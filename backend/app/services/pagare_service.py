"""
PagareService — genera, firma y anula el pagaré que acompaña al contrato.

Tres reglas ordenan todo (el detalle, en `docs/PAGARE.md`):

1. **Aparte del contrato, en el mismo link.** El pagaré tiene tabla, snapshot y
   PDF propios —el contrato no cambia ni una coma— pero cuelga del contrato
   vigente de la reserva porque viaja en su `firma_token`.
2. **Una sola firma, en un solo acto.** El trazo que firma el contrato firma el
   pagaré en la misma transacción. Si el pagaré llega después de que el
   contrato ya se firmó, se firma aparte: nunca se estampa una firma vieja
   sobre un documento que la persona no vio.
3. **Se congela al emitirse.** Monto, beneficiario, tasas, lugar de pago,
   deudor, co-deudores y el texto resuelto quedan en `snapshot`. Cambiar la
   tasa en Configuración mañana no reescribe los pagarés de hoy.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import pagare_texto
from app.domain.monto_letras import monto_a_letras
from app.models.cliente import ConductorAdicional
from app.models.contrato import Contrato
from app.models.pagare import Pagare
from app.models.reserva import Reserva
from app.services import auditoria_service
from app.services.configuracion_service import ConfiguracionService

ZONA = ZoneInfo("America/Argentina/Buenos_Aires")

CLAVE_COMPENSATORIO = "pagare.interes_compensatorio_anual"
CLAVE_PUNITORIO = "pagare.interes_punitorio_anual"
CLAVE_LUGAR_EMISION = "pagare.lugar_emision"
CLAVE_LUGAR_PAGO = "pagare.lugar_pago"

MAX_CODEUDORES = 3


def dia_local(momento: datetime | None):
    """
    El día calendario en Argentina de un `datetime` guardado en UTC.

    La base guarda `utcnow()`: un pagaré firmado a las 22 h del 12 quedaría
    fechado el 13 si se imprimiera la fecha tal cual.
    """
    if momento is None:
        return datetime.now(ZONA).date()
    return momento.replace(tzinfo=timezone.utc).astimezone(ZONA).date()


class PagareService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.config = ConfiguracionService(db)

    # ── Configuración ─────────────────────────────────────────────────────

    def _conf(self, clave: str) -> str:
        try:
            return (self.config.get(clave).valor or "").strip()
        except NotFoundError:
            return ""

    def datos_config(self) -> dict:
        """
        Lo que el pagaré toma de Configuración.

        **El lugar de pago por defecto es el domicilio de la empresa**, no el
        del cliente. Si el pagaré no dice dónde se paga, la ley toma el lugar de
        creación o el domicilio del suscriptor (art. 102); con clientes que
        reservan por la web desde cualquier provincia, eso mandaría el cobro a
        la otra punta del país. El domicilio del acreedor además coincide con la
        jurisdicción que ya fija el contrato.
        """
        from app.services.contrato_service import ContratoService

        empresa = ContratoService(self.db).datos_empresa()
        domicilio = ", ".join(
            x for x in [(empresa.get("domicilio") or "").strip(), (empresa.get("localidad") or "").strip()] if x
        )
        return {
            "interes_compensatorio": self._conf(CLAVE_COMPENSATORIO),
            "interes_punitorio": self._conf(CLAVE_PUNITORIO),
            "lugar_emision": self._conf(CLAVE_LUGAR_EMISION) or "Bahía Blanca",
            "lugar_pago": self._conf(CLAVE_LUGAR_PAGO) or domicilio,
            # Quien cobra es quien se obliga en el contrato: la razón social,
            # no el nombre de fantasía.
            "beneficiario": (empresa.get("locador_nombre") or empresa.get("razon_social") or "").strip(),
            "empresa": empresa,
        }

    def faltantes(self, conf: dict | None = None) -> list[str]:
        """Lo que impide emitir, dicho como para leerlo en la pantalla."""
        conf = conf or self.datos_config()
        faltan = []
        if not conf["interes_compensatorio"]:
            faltan.append("la tasa de interés compensatorio (Configuración → Garantía)")
        if not conf["interes_punitorio"]:
            faltan.append("la tasa de interés punitorio (Configuración → Garantía)")
        if not conf["beneficiario"]:
            faltan.append("la razón social de la empresa (Configuración → Empresa)")
        if not conf["lugar_pago"]:
            faltan.append("el lugar de pago o el domicilio de la empresa (Configuración)")
        return faltan

    # ── Lectura ───────────────────────────────────────────────────────────

    def get(self, pagare_id: int) -> Pagare:
        p = self.db.get(Pagare, pagare_id)
        if not p:
            raise NotFoundError("Garantía", pagare_id)
        return p

    def de_contrato(self, contrato_id: int) -> Pagare | None:
        """El pagaré vigente de un contrato. Anulados no cuentan."""
        return (
            self.db.query(Pagare)
            .filter(
                Pagare.contrato_id == contrato_id,
                Pagare.anulado.is_(False),
                Pagare.activo.is_(True),
            )
            .first()
        )

    def de_reserva(self, reserva_id: int) -> Pagare | None:
        return (
            self.db.query(Pagare)
            .filter(
                Pagare.reserva_id == reserva_id,
                Pagare.anulado.is_(False),
                Pagare.activo.is_(True),
            )
            .order_by(Pagare.id.desc())
            .first()
        )

    def pendiente_de(self, contrato_id: int) -> Pagare | None:
        """El pagaré que falta firmar en este link, si hay uno."""
        p = self.de_contrato(contrato_id)
        return p if p is not None and not p.firmado else None

    # ── Preparar y emitir ─────────────────────────────────────────────────

    def preparar(self, reserva_id: int) -> dict:
        """
        Lo precargado para el formulario de emisión. No persiste nada.

        **El monto sugerido es el valor del alquiler** —el "Valor estimado" del
        contrato— porque es lo que pidió Ubicar. Queda editable: si el pagaré
        se piensa como garantía de daños, el número que corresponde es el de la
        franquicia, y esa es una decisión comercial, no del sistema.
        """
        from app.services.contrato_service import ContratoService

        reserva = self.db.get(Reserva, reserva_id)
        if not reserva:
            raise NotFoundError("Reserva", reserva_id)

        contrato = ContratoService(self.db).de_reserva(reserva_id)
        snap = (contrato.snapshot if contrato else None) or ContratoService(self.db).preparar(reserva_id)
        cargos = snap.get("cargos") or {}
        coberturas = snap.get("coberturas") or {}
        conf = self.datos_config()

        conductor = (
            self.db.get(ConductorAdicional, reserva.conductor_id) if reserva.conductor_id else None
        )
        return {
            "monto_sugerido": float(cargos.get("valor_estimado") or 0),
            "franquicia": coberturas.get("franquicia"),
            "deudor": self._deudor(snap),
            # Sugerencia y no default: quien maneja no es por eso garante. Se
            # ofrece con un botón; nadie queda como co-deudor sin que se decida.
            "codeudor_sugerido": (
                {
                    "nombre": conductor.nombre_completo,
                    "dni": conductor.dni or "",
                    "domicilio": getattr(conductor, "domicilio", None) or "",
                } if conductor else None
            ),
            "beneficiario": conf["beneficiario"],
            "lugar_emision": conf["lugar_emision"],
            "lugar_pago": conf["lugar_pago"],
            "interes_compensatorio": conf["interes_compensatorio"],
            "interes_punitorio": conf["interes_punitorio"],
            "faltantes": self.faltantes(conf),
            "tiene_contrato": contrato is not None,
        }

    @staticmethod
    def _deudor(snap: dict) -> dict:
        cli = snap.get("cliente") or {}
        domicilio = ", ".join(
            str(x).strip() for x in [cli.get("domicilio"), cli.get("localidad"), cli.get("provincia")]
            if x and str(x).strip()
        )
        return {
            "nombre": cli.get("nombre") or "",
            "dni": cli.get("dni_cuit") or "",
            "domicilio": domicilio,
        }

    @staticmethod
    def _limpiar_codeudores(codeudores: list[dict] | None) -> list[dict]:
        limpios = []
        for c in codeudores or []:
            nombre = (c.get("nombre") or "").strip()
            dni = (c.get("dni") or "").strip()
            if not nombre and not dni:
                continue
            if not nombre or not dni:
                raise BusinessRuleError(
                    "codeudor_incompleto",
                    "Cada co-deudor necesita nombre y DNI: son los datos con los que firma.",
                )
            limpios.append({"nombre": nombre, "dni": dni, "domicilio": (c.get("domicilio") or "").strip()})
        if len(limpios) > MAX_CODEUDORES:
            raise BusinessRuleError(
                "demasiados_codeudores", f"La garantía admite hasta {MAX_CODEUDORES} co-deudores."
            )
        return limpios

    def crear(
        self,
        reserva_id: int,
        *,
        monto,
        codeudores: list[dict] | None,
        usuario_id: int | None,
    ) -> Pagare:
        from app.services.contrato_service import ContratoService

        reserva = self.db.get(Reserva, reserva_id)
        if not reserva:
            raise NotFoundError("Reserva", reserva_id)

        contrato = ContratoService(self.db).de_reserva(reserva_id)
        if contrato is None:
            raise BusinessRuleError(
                "pagare_sin_contrato",
                "Generá el contrato primero: la garantía viaja en el mismo link y se "
                "firma con la misma firma.",
            )
        existente = self.de_contrato(contrato.id)
        if existente is not None:
            raise BusinessRuleError(
                "pagare_ya_existe",
                f"La reserva ya tiene la garantía {existente.numero_formateado}. "
                "Anulalo antes de emitir otro.",
            )

        try:
            monto_dec = Decimal(str(monto)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            raise BusinessRuleError("pagare_monto_invalido", "El monto de la garantía no es un número.")
        if monto_dec <= 0:
            raise BusinessRuleError("pagare_monto_invalido", "El monto de la garantía tiene que ser mayor a cero.")

        conf = self.datos_config()
        faltan = self.faltantes(conf)
        if faltan:
            raise BusinessRuleError(
                "pagare_falta_configuracion",
                "Para emitir la garantía falta cargar " + "; ".join(faltan) + ".",
            )

        limpios = self._limpiar_codeudores(codeudores)
        deudor = self._deudor(contrato.snapshot or {})
        firmantes = 1 + len(limpios)

        snapshot = {
            "titulo": pagare_texto.TITULO,
            "lugar_emision": conf["lugar_emision"],
            "monto": float(monto_dec),
            "monto_numerico": pagare_texto.monto_numerico(monto_dec),
            "monto_letras": monto_a_letras(monto_dec),
            "beneficiario": conf["beneficiario"],
            "lugar_pago": conf["lugar_pago"],
            "interes_compensatorio": conf["interes_compensatorio"],
            "interes_punitorio": conf["interes_punitorio"],
            "deudor": deudor,
            "codeudores": limpios,
            "texto": pagare_texto.cuerpo(
                beneficiario=conf["beneficiario"],
                monto=monto_dec,
                lugar_pago=conf["lugar_pago"],
                interes_compensatorio=conf["interes_compensatorio"],
                interes_punitorio=conf["interes_punitorio"],
                firmantes=firmantes,
            ),
            "aceptacion": pagare_texto.texto_aceptacion(len(limpios)),
            "empresa": {
                k: conf["empresa"].get(k, "")
                for k in ("nombre_comercial", "razon_social", "cuit", "domicilio", "localidad")
            },
            "contrato_numero": contrato.numero_formateado,
            "emitido_at": datetime.utcnow().isoformat(),
        }

        pagare = Pagare(
            reserva_id=reserva_id,
            contrato_id=contrato.id,
            snapshot=snapshot,
            creado_por=usuario_id,
        )
        self.db.add(pagare)
        self.db.flush()

        auditoria_service.registrar(
            self.db,
            usuario_id=usuario_id,
            accion="emitir_pagare",
            entidad_tipo="pagare",
            entidad_id=pagare.id,
            descripcion=(
                f"Garantía {pagare.numero_formateado} por ${snapshot['monto_numerico']} "
                f"(contrato {contrato.numero_formateado}, {firmantes} firmante(s))"
            ),
            datos_despues={"monto": snapshot["monto"], "codeudores": len(limpios)},
        )
        return pagare

    # ── Firma ─────────────────────────────────────────────────────────────

    def validar_firma(self, pagare: Pagare, medio: str, codeudores: list[dict] | None) -> None:
        """
        Se llama **antes** de tocar el contrato: si al pagaré le falta una firma
        de co-deudor, no puede quedar firmado el contrato solo y el pagaré no —
        el acto es uno.
        """
        if pagare.anulado:
            raise BusinessRuleError("pagare_anulado", "La garantía está anulada.")
        if pagare.firmado:
            raise BusinessRuleError("pagare_ya_firmado", "La garantía ya está firmada.")
        esperados = (pagare.snapshot or {}).get("codeudores") or []
        if medio == "papel" or not esperados:
            return
        recibidos = codeudores or []
        if len(recibidos) != len(esperados) or not all(c.get("firma_bytes") for c in recibidos):
            nombres = ", ".join(c["nombre"] for c in esperados)
            raise BusinessRuleError(
                "falta_firma_codeudor",
                f"Falta la firma {'del co-deudor' if len(esperados) == 1 else 'de los co-deudores'}: {nombres}.",
            )

    def firmar(
        self,
        pagare: Pagare,
        *,
        firma_bytes: bytes | None,
        nombre: str,
        dni: str,
        medio: str,
        codeudores: list[dict] | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
        con_aceptacion: bool = False,
    ) -> Pagare:
        from app.core.deps import get_storage

        self.validar_firma(pagare, medio, codeudores)
        storage = get_storage()

        if firma_bytes:
            pagare.firma_key = storage.upload(f"pagares/{pagare.id}/firma.png", firma_bytes, "image/png")

        esperados = (pagare.snapshot or {}).get("codeudores") or []
        firmas = []
        for i, esperado in enumerate(esperados):
            recibido = (codeudores or [])[i] if i < len(codeudores or []) else {}
            key = None
            if medio != "papel" and recibido.get("firma_bytes"):
                key = storage.upload(
                    f"pagares/{pagare.id}/codeudor-{i + 1}.png", recibido["firma_bytes"], "image/png"
                )
            firmas.append({
                # El nombre y el DNI son los del snapshot: es a quien el
                # documento nombra como co-deudor.
                "nombre": esperado["nombre"],
                "dni": esperado["dni"],
                "firma_key": key,
            })
        pagare.firmas_codeudores = firmas

        ahora = datetime.utcnow()
        pagare.firmado = True
        pagare.firmado_at = ahora
        pagare.firmado_por_nombre = nombre
        pagare.firmado_por_dni = dni
        pagare.firma_medio = medio
        pagare.firma_ip = (ip or "")[:45] or None
        pagare.firma_user_agent = (user_agent or "")[:255] or None
        if con_aceptacion:
            pagare.firma_aceptacion = {
                **((pagare.snapshot or {}).get("aceptacion") or pagare_texto.ACEPTACION),
                "aceptado_at": ahora.isoformat(),
            }
        self.db.flush()
        return pagare

    # ── Anulación y papel ─────────────────────────────────────────────────

    def anular(self, pagare_id: int, motivo: str, usuario_id: int | None) -> Pagare:
        """Nunca se borra. Un pagaré firmado anulado sigue diciendo que se firmó."""
        pagare = self.get(pagare_id)
        if pagare.anulado:
            raise BusinessRuleError("pagare_ya_anulado", "La garantía ya está anulada.")
        estaba_firmado = bool(pagare.firmado)
        pagare.anulado = True
        pagare.activo = False
        pagare.motivo_anulacion = motivo
        self.db.flush()
        auditoria_service.registrar(
            self.db,
            usuario_id=usuario_id,
            accion="anular_pagare_firmado" if estaba_firmado else "anular_pagare",
            entidad_tipo="pagare",
            entidad_id=pagare.id,
            descripcion=(
                f"Garantía {pagare.numero_formateado} anulada"
                + (" — estaba FIRMADA" if estaba_firmado else "")
                + f". Motivo: {motivo}"
            ),
            datos_antes={"firmado": estaba_firmado},
            datos_despues={"anulado": True, "motivo": motivo},
        )
        return pagare

    def adjuntar_escaneo(self, pagare_id: int, contenido: bytes, content_type: str) -> Pagare:
        from app.core.deps import get_storage

        pagare = self.get(pagare_id)
        extension = {
            "application/pdf": "pdf", "image/jpeg": "jpg",
            "image/png": "png", "image/webp": "webp",
        }.get(content_type)
        if extension is None:
            raise BusinessRuleError(
                "formato_no_soportado", "Subí la garantía firmada como PDF, JPG, PNG o WEBP."
            )
        pagare.escaneo_key = get_storage().upload(
            f"pagares/{pagare.id}/firmado.{extension}", contenido, content_type
        )
        self.db.flush()
        return pagare

    # ── PDF ───────────────────────────────────────────────────────────────

    def generar_pdf(self, pagare_id: int) -> bytes:
        from app.core.deps import get_storage
        from app.services.pagare_pdf import generar_pdf_pagare

        pagare = self.get(pagare_id)
        storage = get_storage()

        def _leer(key: str | None) -> bytes | None:
            if not key:
                return None
            try:
                return storage.read(key)
            except Exception:
                # Un adjunto perdido no puede impedir reimprimir el documento.
                return None

        firma = _leer(pagare.firma_key)
        firmas_codeudores = [_leer(f.get("firma_key")) for f in (pagare.firmas_codeudores or [])]
        return generar_pdf_pagare(pagare, firma, firmas_codeudores)
