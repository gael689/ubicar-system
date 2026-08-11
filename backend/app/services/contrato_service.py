from __future__ import annotations
"""
ContratoService — genera, firma y anula contratos de alquiler.

**La regla que ordena todo: el contrato se congela al emitirse.** El snapshot
guarda el anverso ya resuelto; el `plantilla_id` guarda con qué versión del
clausulado se firmó. Reimprimir un contrato de hace dos años tiene que dar el
mismo papel aunque el cliente se haya mudado, el auto se haya vendido y los
precios hayan cambiado tres veces.

Ver `docs/PLAN_CONTRATOS.md` para el mapeo campo por campo del anverso.
"""
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import contrato_clausulado
from app.models.adicional import Adicional
from app.models.alquiler import Alquiler
from app.models.cliente import Cliente, ConductorAdicional
from app.models.contrato import Contrato, ContratoPlantilla
from app.models.reserva import Reserva
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.services.configuracion_service import ConfiguracionService


# Claves de `configuracion` que arma el pie institucional del contrato.
#
# `locador_nombre` es quien se obliga —lo que reemplaza a {{LOCADOR}} en las
# trece cláusulas— y `nombre_comercial` es el nombre de fantasía que encabeza
# el papel. Son dos cosas distintas y el contrato necesita las dos: el cliente
# reconoce "Ubicar Rent", pero quien firma del otro lado es FINAR GRUPO
# FINANCIERO S.R.L. (D-C1, migración 055).
CLAVES_EMPRESA = [
    "empresa.locador_nombre", "empresa.nombre_comercial", "empresa.razon_social",
    "empresa.cuit", "empresa.ingresos_brutos", "empresa.domicilio",
    "empresa.localidad", "empresa.telefonos", "empresa.email",
    "empresa.jurisdiccion",
]


class ContratoService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.config = ConfiguracionService(db)

    # ── Plantilla ─────────────────────────────────────────────────────────

    def plantilla_vigente(self) -> ContratoPlantilla:
        """
        La versión activa del clausulado. Si no hay ninguna, siembra la v1
        desde `domain/contrato_clausulado.py` — así el módulo funciona desde
        el primer arranque sin que nadie tenga que cargar 13 cláusulas a mano.
        """
        vigente = (
            self.db.query(ContratoPlantilla)
            .filter(ContratoPlantilla.activa.is_(True), ContratoPlantilla.activo.is_(True))
            .order_by(ContratoPlantilla.version.desc())
            .first()
        )
        if vigente:
            return vigente

        plantilla = ContratoPlantilla(
            version=1,
            titulo=contrato_clausulado.TITULO,
            clausulas=contrato_clausulado.CLAUSULAS,
            vigente_desde=date.today(),
            activa=True,
        )
        self.db.add(plantilla)
        self.db.flush()
        return plantilla

    def nueva_version(self, titulo: str, clausulas: list, usuario_id: int | None) -> ContratoPlantilla:
        """
        Publica una versión nueva del clausulado. **Nunca edita la anterior**:
        los contratos ya firmados siguen apuntando a la suya.
        """
        ultima = (
            self.db.query(ContratoPlantilla)
            .order_by(ContratoPlantilla.version.desc())
            .first()
        )
        self.db.query(ContratoPlantilla).filter(
            ContratoPlantilla.activa.is_(True)
        ).update({"activa": False})

        plantilla = ContratoPlantilla(
            version=(ultima.version + 1) if ultima else 1,
            titulo=titulo,
            clausulas=clausulas,
            vigente_desde=date.today(),
            activa=True,
            creado_por=usuario_id,
        )
        self.db.add(plantilla)
        self.db.flush()
        return plantilla

    # ── Datos de la empresa ───────────────────────────────────────────────

    def datos_empresa(self) -> dict:
        datos = {}
        for clave in CLAVES_EMPRESA:
            try:
                datos[clave.split(".", 1)[1]] = self.config.get(clave).valor
            except NotFoundError:
                datos[clave.split(".", 1)[1]] = ""
        return datos

    def falta_datos_fiscales(self) -> bool:
        """
        D-C1 sigue pendiente: no se sabe quién es legalmente el locador.

        Mientras el CUIT esté vacío, el contrato se puede generar igual (no
        bloquear es lo que permite operar) pero **avisa**, para que el
        placeholder no se vuelva permanente por olvido — que es exactamente lo
        que pasa con estas cosas.
        """
        return not (self.datos_empresa().get("cuit") or "").strip()

    # ── Snapshot: el anverso ──────────────────────────────────────────────

    def preparar(self, reserva_id: int) -> dict:
        """
        Arma el anverso precargado desde los datos del sistema.

        Lo que sale de acá es **editable**: el operador corrige lo que haga
        falta y lo corregido es lo que se congela. Por eso `preparar` no
        persiste nada.

        **Parte de la reserva, no del alquiler.** Si el check-out ya ocurrió se
        usan los datos reales de salida (km, combustible); si no, se usa lo
        previsto y esos dos campos quedan en blanco para completarlos al
        entregar. Emitir el contrato antes es lo normal: da tiempo a leerlo y
        corregirlo, en vez de resolverlo con el cliente esperando en la puerta.
        """
        reserva: Reserva | None = self.db.get(Reserva, reserva_id)
        if not reserva:
            raise NotFoundError("Reserva", reserva_id)
        alquiler: Alquiler | None = reserva.alquiler
        cliente: Cliente | None = self.db.get(Cliente, reserva.cliente_id)
        vehiculo: Vehiculo | None = (
            self.db.get(Vehiculo, reserva.vehiculo_id) if reserva.vehiculo_id else None
        )
        conductor: ConductorAdicional | None = (
            self.db.get(ConductorAdicional, reserva.conductor_id) if reserva.conductor_id else None
        )

        return {
            "empresa": self.datos_empresa(),
            "reserva_id": reserva.id,
            "alquiler_id": alquiler.id if alquiler else None,
            "cliente": self._bloque_cliente(cliente),
            "conductor_adicional": self._bloque_conductor(conductor),
            "vehiculo": self._bloque_vehiculo(vehiculo, reserva),
            "servicio": self._bloque_servicio(alquiler, reserva),
            "cargos": self._bloque_cargos(reserva),
            "coberturas": self._bloque_coberturas(reserva),
            "aceptacion": contrato_clausulado.ACEPTACION,
        }

    def _bloque_cliente(self, c: Cliente | None) -> dict:
        if not c:
            return {}
        return {
            "id": c.id,
            "nombre": c.nombre_completo,
            "dni_cuit": c.dni_cuit,
            "domicilio": c.domicilio or "",
            "localidad": c.localidad or "",
            "provincia": c.provincia or "",
            "codigo_postal": c.codigo_postal or "",
            "pais": "ARGENTINA",
            "telefono": c.telefono or "",
            "email": c.email or "",
            # Sólo si es empresa: un particular no tiene razón social y dejar
            # el campo vacío en el papel se lee como un dato faltante.
            "empresa": c.razon_social if c.tipo == "empresa" else "",
            "licencia_numero": c.licencia_numero or "",
            "licencia_vencimiento": _iso(c.licencia_vencimiento),
            "licencia_pais": c.licencia_pais or "",
            "licencia_categoria": c.licencia_categoria or "",
        }

    def _bloque_conductor(self, c: ConductorAdicional | None) -> dict:
        if not c:
            return {}
        # La cláusula 2.h exige nombre, documento Y dirección para que la
        # autorización del conductor adicional sea válida.
        return {
            "id": c.id,
            "nombre": c.nombre_completo,
            "dni": c.dni or "",
            "domicilio": getattr(c, "domicilio", None) or "",
            "licencia_numero": c.licencia_numero or "",
            "licencia_vencimiento": _iso(c.licencia_vencimiento),
        }

    def _bloque_vehiculo(self, v: Vehiculo | None, reserva: Reserva) -> dict:
        if not v:
            return {"categoria": _nombre_categoria(reserva)}
        return {
            "id": v.id,
            "descripcion": " ".join(
                x for x in [v.marca, v.modelo, getattr(v, "version", None)] if x
            ).upper(),
            "patente": v.patente,
            "interno": v.id,
            "categoria": _nombre_categoria(reserva),
        }

    def _bloque_servicio(self, a: Alquiler | None, r: Reserva) -> dict:
        # Sin check-out todavía: la salida es la prevista, y km y combustible
        # quedan vacíos. Precargarlos con un número inventado sería peor —
        # el contrato es justamente donde ese dato se vuelve oponible.
        return {
            "check_out_fecha": _iso(a.checkout_fecha) if a else _iso(r.fecha_inicio),
            "check_out_hora": _hora(a.checkout_hora) if a else _hora(r.hora_inicio),
            "check_out_lugar": r.lugar_entrega,
            "check_out_km": a.checkout_km if a else None,
            # El nivel de combustible de salida no está en el original, pero la
            # cláusula 1 obliga a devolver con el tanque lleno y la 6.(iv)
            # permite debitar la diferencia: reclamar eso sin haber dejado
            # escrito con cuánto salió es indefendible.
            "check_out_combustible": a.checkout_combustible if a else None,
            # La devolución es la prevista: el contrato se firma al entregar.
            "check_in_fecha": _iso(r.fecha_fin),
            "check_in_hora": _hora(r.hora_devolucion_acordada or r.hora_fin),
            "check_in_lugar": r.lugar_devolucion,
        }

    def _bloque_cargos(self, r: Reserva) -> dict:
        """
        El desglose del anverso. **"Valor estimado", no "total"**: al firmar el
        auto todavía no volvió, y el excedente, el combustible y los daños se
        liquidan en el check-in. Decir "total" sería prometer un número que el
        propio contrato (cláusula 6) se reserva el derecho de aumentar.
        """
        lineas = []
        dias = (r.fecha_fin - r.fecha_inicio).days
        precio = Decimal(str(r.precio_total or 0))
        if precio > 0:
            lineas.append({
                "concepto": "Días de alquiler",
                "cantidad": dias,
                "valor_unitario": float(precio / dias) if dias else float(precio),
                "total": float(precio),
            })

        for a in r.adicionales:
            lineas.append({
                "concepto": a.nombre,
                "cantidad": a.cantidad,
                "valor_unitario": float(a.precio_unitario),
                "total": float(a.subtotal),
            })

        if r.recargo_edad_monto and Decimal(str(r.recargo_edad_monto)) > 0:
            lineas.append({
                "concepto": f"{r.recargo_edad_nombre} ({r.recargo_edad_edad} años)",
                "cantidad": 1,
                "valor_unitario": float(r.recargo_edad_monto),
                "total": float(r.recargo_edad_monto),
            })

        if r.cargo_late_checkout and Decimal(str(r.cargo_late_checkout)) > 0:
            lineas.append({
                "concepto": "Cargo por devolución fuera de horario",
                "cantidad": 1,
                "valor_unitario": float(r.cargo_late_checkout),
                "total": float(r.cargo_late_checkout),
            })

        estimado = sum(Decimal(str(l["total"])) for l in lineas)

        # El descuento se imprime como línea propia: `precio_lista` vs
        # `precio_total` existe justamente para auditarlo (ítem 22), y
        # esconderlo dentro de un unitario más bajo rompería esa auditoría en
        # el único documento que el cliente se lleva.
        descuento = Decimal("0")
        if r.precio_lista and Decimal(str(r.precio_lista)) > precio:
            descuento = Decimal(str(r.precio_lista)) - precio

        return {
            "lineas": lineas,
            "descuento": float(descuento),
            "valor_estimado": float(estimado),
            "incluye_kilometraje": True,
            # El IVA se desagrega sólo si se factura: para un consumidor final
            # el precio es final y desglosarlo confunde sin aportar nada.
            "discrimina_iva": bool(r.con_factura),
        }

    def _bloque_coberturas(self, r: Reserva) -> dict:
        """
        Coberturas contratadas y **el rechazo explícito de las que no**.

        Esa segunda parte no es decoración: es la prueba de que se ofreció y el
        cliente dijo que no. Sin esa línea, un cliente que choca puede alegar
        que nunca le ofrecieron nada.
        """
        contratadas = [
            {
                "nombre": a.nombre,
                # La franquicia es del catálogo, no de la línea contratada:
                # es un dato de la cobertura, no del precio pactado.
                "franquicia": (
                    float(a.adicional.franquicia)
                    if a.adicional and a.adicional.franquicia is not None else None
                ),
            }
            for a in r.adicionales
            if a.grupo == "cobertura"
        ]
        ids_contratadas = {a.adicional_id for a in r.adicionales}

        no_contratadas = [
            a.nombre
            for a in self.db.query(Adicional)
            .filter(Adicional.activo.is_(True), Adicional.grupo == "cobertura")
            .all()
            if a.id not in ids_contratadas
        ]

        # La franquicia que rige es la de la cobertura contratada; sin
        # cobertura, la de configuración (D-C3).
        if contratadas and contratadas[0]["franquicia"] is not None:
            franquicia = contratadas[0]["franquicia"]
        else:
            franquicia = float(self.config.get_decimal("contrato.franquicia_default", Decimal("0")))

        return {
            "contratadas": contratadas,
            "rechazadas": no_contratadas,
            "franquicia": franquicia,
        }

    # ── Emisión ───────────────────────────────────────────────────────────

    def de_reserva(self, reserva_id: int) -> Contrato | None:
        """El contrato vigente de una reserva, o `None`. Anulados no cuentan."""
        return (
            self.db.query(Contrato)
            .filter(
                Contrato.reserva_id == reserva_id,
                Contrato.anulado.is_(False),
                Contrato.activo.is_(True),
            )
            .first()
        )

    def crear(self, reserva_id: int, snapshot: dict | None, usuario_id: int | None) -> Contrato:
        reserva = self.db.get(Reserva, reserva_id)
        if not reserva:
            raise NotFoundError("Reserva", reserva_id)

        vigente = self.de_reserva(reserva_id)
        if vigente:
            raise BusinessRuleError(
                "contrato_ya_existe",
                f"La reserva ya tiene el contrato {vigente.numero_formateado}. "
                "Anulalo antes de emitir uno nuevo.",
            )

        plantilla = self.plantilla_vigente()
        datos = snapshot or self.preparar(reserva_id)
        # El nombre del operador se sella acá: es lo que se imprime en el pie.
        usuario = self.db.get(Usuario, usuario_id) if usuario_id else None
        datos["atendido_por"] = _nombre_para_el_papel(usuario)
        datos["emitido_at"] = datetime.utcnow().isoformat()

        contrato = Contrato(
            reserva_id=reserva_id,
            # Si el auto ya salió, el contrato queda atado a esa operación en
            # el acto; si no, se completa en el check-out.
            alquiler_id=reserva.alquiler.id if reserva.alquiler else None,
            plantilla_id=plantilla.id,
            snapshot=datos,
            atendido_por=usuario_id,
            creado_por=usuario_id,
        )
        self.db.add(contrato)
        self.db.flush()
        self.db.refresh(contrato)
        return contrato

    def firmar(
        self, contrato_id: int, firma_bytes: bytes | None,
        nombre: str, dni: str, usuario_id: int | None,
        medio: str | None = None,
    ) -> Contrato:
        """
        Deja el contrato firmado.

        `medio` distingue las dos formas reales de firmar:

        - **pantalla**: el cliente traza la firma con el dedo o el mouse y
          queda estampada en el PDF.
        - **papel**: se imprime, el cliente firma con lapicera y acá se
          registra quién firmó. No hay imagen, y eso es correcto — el original
          firmado es el papel.

        Si no viene, se deduce del trazo. Se guarda igual para que un contrato
        firmado en papel no se confunda con uno marcado por error.
        """
        contrato = self.get(contrato_id)
        if contrato.anulado:
            raise BusinessRuleError("contrato_anulado", "El contrato está anulado")
        if contrato.firmado:
            raise BusinessRuleError("contrato_ya_firmado", "El contrato ya está firmado")

        if firma_bytes:
            from app.core.deps import get_storage
            key = f"contratos/{contrato.id}/firma.png"
            contrato.firma_key = get_storage().upload(key, firma_bytes, "image/png")

        contrato.firmado = True
        contrato.firmado_at = datetime.utcnow()
        contrato.firmado_por_nombre = nombre
        contrato.firmado_por_dni = dni
        contrato.firma_medio = medio or ("pantalla" if firma_bytes else "papel")

        # El alquiler es quien responde "¿este auto salió con contrato?" en el
        # listado, así que el estado tiene que vivir también ahí. Si todavía no
        # hay alquiler —contrato firmado antes de la entrega— lo sella el
        # check-out al crearlo.
        alquiler = contrato.alquiler or (contrato.reserva.alquiler if contrato.reserva else None)
        if alquiler:
            contrato.alquiler_id = alquiler.id
            alquiler.contrato_firmado = True
        self.db.flush()
        return contrato

    # ── Firma por link (D-C6) ─────────────────────────────────────────────

    CLAVE_HORAS_LINK = "contrato.link_firma_horas"
    HORAS_LINK_DEFAULT = 72

    def generar_link(self, contrato_id: int, url_base_web: str) -> Contrato:
        """
        Emite el link que se le manda al cliente para que firme desde su
        teléfono.

        **Regenerar invalida el anterior**, y eso es deliberado: el token es la
        única credencial: si sobrevivieran dos, revocar el que se filtró no
        serviría de nada. La contra —que el link viejo del WhatsApp deje de
        andar— se resuelve devolviendo siempre el mismo mientras siga vigente,
        en vez de fabricar uno nuevo en cada clic.
        """
        contrato = self.get(contrato_id)
        if contrato.anulado:
            raise BusinessRuleError("contrato_anulado", "El contrato está anulado")
        if contrato.firmado:
            raise BusinessRuleError(
                "contrato_ya_firmado",
                "El contrato ya está firmado: no hace falta mandar el link.",
            )

        vigente = (
            contrato.firma_token
            and contrato.firma_token_expira
            and contrato.firma_token_expira > datetime.utcnow()
        )
        if not vigente:
            # 32 bytes en base64url: no adivinable por fuerza bruta, y entra en
            # un WhatsApp sin acortador.
            contrato.firma_token = secrets.token_urlsafe(32)
            contrato.firma_token_expira = datetime.utcnow() + timedelta(
                hours=self._horas_link()
            )

        contrato.link_prellenado = self.url_de_firma(contrato, url_base_web)
        self.db.flush()
        return contrato

    def _horas_link(self) -> int:
        try:
            return max(1, int(self.config.get(self.CLAVE_HORAS_LINK).valor))
        except (NotFoundError, TypeError, ValueError):
            return self.HORAS_LINK_DEFAULT

    @staticmethod
    def url_de_firma(contrato: Contrato, url_base_web: str) -> str:
        return f"{(url_base_web or '').rstrip('/')}/contrato/{contrato.firma_token}"

    def revocar_link(self, contrato_id: int) -> Contrato:
        """
        Mata el link. Se usa cuando se mandó a la persona equivocada o cuando
        el cliente prefiere firmar en el mostrador.

        No se toca `firmado`: revocar el link de un contrato ya firmado no
        deshace la firma, sólo cierra la puerta.
        """
        contrato = self.get(contrato_id)
        contrato.firma_token = None
        contrato.firma_token_expira = None
        contrato.link_prellenado = None
        self.db.flush()
        return contrato

    def por_token(self, token: str, *, para_firmar: bool) -> Contrato:
        """
        Resuelve el contrato detrás de un link.

        `para_firmar=False` es la lectura: sigue funcionando después de firmado
        y después de vencido, para que el cliente pueda volver a abrir el link
        y bajarse su copia. Un link que muere en el instante de firmar deja al
        cliente sin el documento que acaba de aceptar.

        `para_firmar=True` es estricto: vencido o ya firmado, no se firma.
        """
        contrato = (
            self.db.query(Contrato)
            .filter(Contrato.firma_token == token, Contrato.activo.is_(True))
            .first()
        )
        # El mismo 404 para "no existe" y para "revocado": distinguirlos le
        # confirmaría a alguien que prueba tokens cuáles existieron.
        if contrato is None:
            raise NotFoundError("Contrato", token)
        if contrato.anulado:
            raise BusinessRuleError("contrato_anulado", "Este contrato fue anulado.")

        if para_firmar:
            if contrato.firmado:
                raise BusinessRuleError(
                    "contrato_ya_firmado", "Este contrato ya está firmado."
                )
            if (
                contrato.firma_token_expira is None
                or contrato.firma_token_expira <= datetime.utcnow()
            ):
                raise BusinessRuleError(
                    "link_vencido",
                    "El link para firmar venció. Pedinos uno nuevo y lo mandamos.",
                )
        return contrato

    def firmar_por_link(
        self,
        token: str,
        *,
        nombre: str,
        dni: str,
        firma_bytes: bytes | None,
        aceptadas: list[str],
        ip: str | None,
        user_agent: str | None,
    ) -> Contrato:
        """
        Firma remota. Es la misma firma ológrafa digitalizada de siempre, con
        dos cosas más que el mostrador no necesita: **las aceptaciones con su
        texto congelado** y **el rastro de dónde se firmó**.

        El trazo es obligatorio acá y opcional en el mostrador: en el mostrador
        hay alguien mirando y el papel se archiva; en remoto, el trazo es la
        única prueba de que del otro lado había una persona.
        """
        contrato = self.por_token(token, para_firmar=True)

        faltan = [
            a["titulo"] for a in contrato_clausulado.ACEPTACIONES
            if a["clave"] not in aceptadas
        ]
        if faltan:
            raise BusinessRuleError(
                "faltan_aceptaciones",
                "Falta aceptar: " + ", ".join(faltan),
            )
        if not firma_bytes:
            raise BusinessRuleError(
                "falta_firma", "Firmá en el recuadro para poder confirmar."
            )

        ahora = datetime.utcnow()
        contrato.firma_aceptaciones = [
            {**a, "aceptado_at": ahora.isoformat()}
            for a in contrato_clausulado.ACEPTACIONES
        ]
        contrato.firma_ip = (ip or "")[:45] or None
        contrato.firma_user_agent = (user_agent or "")[:255] or None

        self.firmar(
            contrato.id, firma_bytes, nombre, dni, usuario_id=None, medio="link",
        )
        return contrato

    # ── Escaneo del ejemplar firmado en papel ─────────────────────────────

    def adjuntar_escaneo(self, contrato_id: int, contenido: bytes, content_type: str) -> Contrato:
        """
        Guarda la foto o el escaneo del contrato firmado a mano.

        No exige que el contrato esté marcado como firmado: el orden natural es
        subir el papel y marcarlo, o al revés, y bloquear uno de los dos
        órdenes sólo obliga a hacer clics en la secuencia correcta.
        """
        from app.core.deps import get_storage

        contrato = self.get(contrato_id)
        if contrato.anulado:
            raise BusinessRuleError("contrato_anulado", "El contrato está anulado")

        extension = {
            "application/pdf": "pdf", "image/jpeg": "jpg",
            "image/png": "png", "image/webp": "webp",
        }.get(content_type)
        if extension is None:
            raise BusinessRuleError(
                "formato_no_soportado",
                "Subí el contrato firmado como PDF, JPG, PNG o WEBP.",
            )

        key = f"contratos/{contrato.id}/firmado.{extension}"
        contrato.escaneo_key = get_storage().upload(key, contenido, content_type)
        self.db.flush()
        return contrato

    def anular(self, contrato_id: int, motivo: str, usuario_id: int | None) -> Contrato:
        """
        Anula el contrato. **Nunca se borra** — un contrato emitido existió, lo
        haya firmado el cliente o no.
        """
        contrato = self.get(contrato_id)
        if contrato.anulado:
            raise BusinessRuleError("contrato_ya_anulado", "El contrato ya está anulado")

        contrato.anulado = True
        contrato.motivo_anulacion = motivo
        contrato.activo = False

        alquiler = self.db.get(Alquiler, contrato.alquiler_id)
        if alquiler:
            alquiler.contrato_firmado = False
        self.db.flush()
        return contrato

    # ── Lectura ───────────────────────────────────────────────────────────

    def get(self, contrato_id: int) -> Contrato:
        c = self.db.get(Contrato, contrato_id)
        if not c:
            raise NotFoundError("Contrato", contrato_id)
        return c

    def por_alquiler(self, alquiler_id: int) -> Contrato | None:
        return (
            self.db.query(Contrato)
            .filter(Contrato.alquiler_id == alquiler_id, Contrato.anulado.is_(False))
            .first()
        )

    def generar_pdf(self, contrato_id: int) -> bytes:
        from app.services.contrato_pdf import generar_pdf_contrato

        contrato = self.get(contrato_id)
        plantilla = (
            self.db.get(ContratoPlantilla, contrato.plantilla_id)
            if contrato.plantilla_id else self.plantilla_vigente()
        )
        firma = None
        if contrato.firma_key:
            from app.core.deps import get_storage
            try:
                firma = get_storage().read(contrato.firma_key)
            except Exception:
                # Un adjunto perdido no puede impedir reimprimir el contrato.
                firma = None
        return generar_pdf_contrato(contrato, plantilla, firma)


def _nombre_para_el_papel(usuario) -> str:
    """
    Cómo se llama el operador en el pie del contrato.

    **Un identificador técnico no puede aparecer en un documento que se firma.**
    Pasó: cuando el token de Clerk viene sin el claim de email, el nombre del
    usuario terminaba siendo el `sub`, y el contrato salía impreso con
    *"Usted fue atendido por: user_3HBPnBzP6K0WDB3Q05CxEQzWtIF"*.

    Se corrigió el origen (`core/deps.py`), pero los usuarios ya dados de alta
    con ese nombre siguen en la base, así que el filtro se queda: es la última
    línea antes del papel.

    Si no hay nada presentable, devuelve vacío. El generador ya sabe omitir la
    línea entera, y **un espacio en blanco es mejor que un dato que confunde**.
    """
    if usuario is None:
        return ""

    def _presentable(valor: str | None) -> str:
        v = (valor or "").strip()
        if not v or v.startswith("user_") or v.endswith("@sin-email.clerk"):
            return ""
        return v

    return _presentable(getattr(usuario, "nombre", None)) or _presentable(
        getattr(usuario, "email", None)
    )


def _iso(v) -> str | None:
    return v.isoformat() if v else None


def _hora(v) -> str | None:
    return v.strftime("%H:%M") if v else None


def _nombre_categoria(r: Reserva) -> str:
    cat = getattr(r, "categoria", None)
    return getattr(cat, "nombre", "") if cat else ""
