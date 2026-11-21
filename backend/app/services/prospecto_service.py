"""
Prospectos y campañas de captación de Ubicar.

Tres cosas, en este orden: **importar** lo que trae el buscador (sin duplicar),
**cruzar** contra los clientes de Ubicar (para no captar a quien ya es cliente),
y **armar campañas** sobre una selección — a mano, o "todos los que cumplen este
filtro" — dejando anotado a quién no se le escribe y por qué.

El envío vive aparte, en `prospeccion_service.py` (plantillas, casillas, el
motor y los seguimientos). Acá queda la base: los datos y las campañas armadas
a mano, que siguen funcionando igual.
"""
from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain.prospectos import (
    DatosDeContacto, IndiceDeClientes, dominio_propio, motivo_para_no_escribir,
    normalizar_email, normalizar_nombre, normalizar_telefono,
)
from app.models.cliente import DNI_CLIENTE_GENERICO, Cliente, ClienteContacto
from app.models.prospecto import CampanaDestinatario, CampanaProspecto, Prospecto

# Tope de una selección "por filtro": una campaña de miles no se revisa.
MAXIMO_POR_SELECCION = 5000

CAMPOS_IMPORTABLES = (
    "nombre", "segmento", "ciudad", "direccion", "telefono", "email", "website",
    "instagram", "score",
    "no_contactar", "no_contactar_motivo", "notas",
)


def _limpio(v):
    if isinstance(v, str):
        v = v.strip()
    return v or None


def _a_la_medida(campo: str, valor):
    """
    Recorta el texto al largo de la columna.

    Un solo website de Booking con 300 caracteres de parámetros alcanzaba para
    que Postgres rechazara el lote entero de 500 (14/10): el error salía como
    500 sin cabeceras de CORS y el navegador lo mostraba como "bloqueado por
    CORS", que no dice nada de lo que pasó. SQLite —la base local y la de los
    tests— no controla el largo, así que acá nunca se vio.
    """
    if not isinstance(valor, str):
        return valor
    largo = getattr(Prospecto.__table__.columns[campo].type, "length", None)
    return valor[:largo] if largo else valor


class _IndiceDeProspectos:
    """
    Los prospectos que ya están, indexados por cada forma de reconocerlos.

    Orden de confianza: la ref del buscador, el mail, el teléfono y, por último,
    el dominio propio. **El dominio solo no alcanza**: dos hoteles distintos
    pueden tener de "web" el mismo portal, así que además se pide que el nombre
    comparta alguna palabra.
    """

    def __init__(self, prospectos: list[Prospecto]) -> None:
        self.por_ref: dict[str, Prospecto] = {}
        self.por_email: dict[str, Prospecto] = {}
        self.por_telefono: dict[str, Prospecto] = {}
        self.por_dominio: dict[str, list[Prospecto]] = {}
        for p in prospectos:
            self.agregar(p)

    def agregar(self, p: Prospecto) -> None:
        if p.ref_externa:
            self.por_ref.setdefault(p.ref_externa, p)
        if (e := normalizar_email(p.email)):
            self.por_email.setdefault(e, p)
        if (t := normalizar_telefono(p.telefono)):
            self.por_telefono.setdefault(t, p)
        if (d := dominio_propio(p.website) or dominio_propio(p.email)):
            lista = self.por_dominio.setdefault(d, [])
            if p not in lista:
                lista.append(p)

    def ref_en_uso(self, ref: str) -> bool:
        return ref in self.por_ref

    @staticmethod
    def _palabras(nombre: str | None) -> set[str]:
        return {w for w in (normalizar_nombre(nombre) or "").split() if len(w) >= 4}

    def buscar(self, *, ref, nombre, email, telefono, website) -> Prospecto | None:
        if ref and ref in self.por_ref:
            return self.por_ref[ref]
        if (e := normalizar_email(email)) and e in self.por_email:
            return self.por_email[e]
        if (t := normalizar_telefono(telefono)) and t in self.por_telefono:
            return self.por_telefono[t]
        d = dominio_propio(website) or dominio_propio(email)
        if d:
            palabras = self._palabras(nombre)
            for p in self.por_dominio.get(d, []):
                if palabras & self._palabras(p.nombre):
                    return p
        return None


class ProspectoService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Importar ────────────────────────────────────────────────────────────
    def importar(self, items: list[dict], *, simular: bool = False) -> dict:
        """
        Alta o actualización. Nunca pisa un dato con vacío, y **nunca revive a
        quien pidió que no lo contacten**: `no_contactar` sólo puede encenderse
        desde acá, no apagarse.

        **Cómo se reconoce que ya estaba.** Primero por `ref_externa` (el id del
        buscador de Gael). Si la ref no coincide —una lista armada a mano, u
        otra fuente— se busca por **mail, teléfono o dominio propio**: sin eso,
        importar una lista nueva duplicaba a media base, y una empresa
        duplicada recibe dos veces la misma campaña.

        `simular=True` no escribe nada: sólo cuenta, para la vista previa de la
        pantalla ("12 nuevos, 68 que ya estaban, 2 sin nombre").
        """
        indice = _IndiceDeProspectos(self.db.query(Prospecto).all())
        nuevos = actualizados = invalidos = 0
        for item in items:
            nombre = _limpio(item.get("nombre"))
            if not nombre:
                invalidos += 1
                continue
            ref = _limpio(item.get("ref_externa"))
            if isinstance(ref, str):
                ref = _a_la_medida("ref_externa", ref)
            p = indice.buscar(ref=ref, nombre=nombre, email=item.get("email"),
                              telefono=item.get("telefono"), website=item.get("website"))
            if p is None:
                nuevos += 1
                p = Prospecto(nombre=_a_la_medida("nombre", nombre), ref_externa=ref)
                if simular:
                    # No se guarda, pero se anota en el índice: dos filas del
                    # mismo archivo que son la misma empresa cuentan como una
                    # nueva y una repetida, igual que al importar de verdad.
                    p.email, p.telefono, p.website = (
                        _limpio(item.get("email")), _limpio(item.get("telefono")),
                        _limpio(item.get("website")))
                    indice.agregar(p)
                    continue
                self.db.add(p)
            else:
                actualizados += 1
                if simular:
                    continue
                if ref and not p.ref_externa and not indice.ref_en_uso(ref):
                    p.ref_externa = ref
            for campo in CAMPOS_IMPORTABLES:
                if campo not in item:
                    continue
                valor = _limpio(item[campo]) if isinstance(item[campo], str) else item[campo]
                valor = _a_la_medida(campo, valor)
                if campo == "no_contactar":
                    if valor:
                        p.no_contactar = True
                    continue
                if valor is None:
                    continue
                if campo == "score":
                    try:
                        valor = int(round(float(valor)))
                    except (TypeError, ValueError):
                        continue
                setattr(p, campo, valor)
            # De dónde salió el dato (una lista investigada a mano lo trae): es
            # una nota interna, nunca entra en un mail.
            fuente = _limpio(item.get("fuente"))
            if fuente and f"Fuente: {fuente}" not in (p.notas or ""):
                p.notas = f"{p.notas}\nFuente: {fuente}" if p.notas else f"Fuente: {fuente}"
            if p.no_contactar:
                p.estado = "no_contactar"
            indice.agregar(p)
        if simular:
            return {"nuevos": nuevos, "actualizados": actualizados, "invalidos": invalidos,
                    "ya_clientes": 0}
        self.db.flush()
        cruzados = self.cruzar()
        return {"nuevos": nuevos, "actualizados": actualizados, "invalidos": invalidos,
                "ya_clientes": cruzados}

    def agregar(self, datos: dict) -> tuple[Prospecto, bool]:
        """
        Alta a mano de **una** empresa, desde la pantalla. Pasa por el mismo
        camino que la importación, así que si ya estaba (mismo mail, teléfono o
        dominio) se completa la que había en vez de duplicarla.

        Devuelve `(prospecto, era_nuevo)`.
        """
        nombre = _limpio(datos.get("nombre"))
        if not nombre:
            raise BusinessRuleError("prospecto_sin_nombre", "Poné el nombre de la empresa.")
        antes = {i for (i,) in self.db.query(Prospecto.id).all()}
        self.importar([datos])
        indice = _IndiceDeProspectos(self.db.query(Prospecto).all())
        p = indice.buscar(ref=None, nombre=nombre, email=datos.get("email"),
                          telefono=datos.get("telefono"), website=datos.get("website"))
        if p is None:   # sin mail, teléfono ni web: es la última con ese nombre
            p = (self.db.query(Prospecto).filter(Prospecto.nombre == _a_la_medida("nombre", nombre))
                 .order_by(Prospecto.id.desc()).first())
        return p, p.id not in antes

    # ── Cruce con los clientes ──────────────────────────────────────────────
    def _indice_de_clientes(self) -> IndiceDeClientes:
        filas: list[tuple[int, DatosDeContacto]] = []
        for c in (
            self.db.query(Cliente)
            .filter(Cliente.activo.is_(True), Cliente.dni_cuit != DNI_CLIENTE_GENERICO)
            .all()
        ):
            filas.append((c.id, DatosDeContacto(
                nombre=c.razon_social or c.nombre_completo, email=c.email, telefono=c.telefono,
            )))
            if c.nombre_completo and c.razon_social:
                filas.append((c.id, DatosDeContacto(nombre=c.nombre_completo)))
            if c.representante_email or c.representante_telefono:
                filas.append((c.id, DatosDeContacto(
                    email=c.representante_email, telefono=c.representante_telefono)))
        for ct in self.db.query(ClienteContacto).filter(ClienteContacto.activo.is_(True)).all():
            filas.append((ct.cliente_id, DatosDeContacto(email=ct.email, telefono=ct.telefono)))
        return IndiceDeClientes(filas)

    def cruzar(self) -> int:
        """
        Marca los prospectos que ya son clientes de Ubicar. Un cruce **firme**
        (mail, teléfono, dominio) pasa el estado a `cliente`; uno **por nombre**
        sólo se anota y queda a revisión.

        Devuelve cuántos prospectos quedaron como cliente.
        """
        indice = self._indice_de_clientes()
        total = 0
        for p in self.db.query(Prospecto).filter(Prospecto.no_contactar.is_(False)).all():
            if p.cruce_descartado:
                continue
            c = indice.buscar(DatosDeContacto(
                nombre=p.nombre, email=p.email, telefono=p.telefono, website=p.website))
            if c is None:
                if p.ya_cliente_id is not None:
                    p.ya_cliente_id, p.cruce_por = None, None
                    if p.estado == "cliente":
                        p.estado = "nuevo"
                continue
            p.ya_cliente_id, p.cruce_por = c.id, c.por
            if c.es_firme and p.estado in ("nuevo", "contactado", "respondio"):
                p.estado = "cliente"
            if p.es_cliente:
                total += 1
        self.db.flush()
        return total

    def descartar_cruce(self, prospecto_id: int) -> Prospecto:
        """'No es el mismo': el cruce por nombre era un falso positivo."""
        p = self.get(prospecto_id)
        p.cruce_descartado = True
        if p.estado == "cliente":
            p.estado = "nuevo"
        self.db.flush()
        return p

    # ── Consultas ───────────────────────────────────────────────────────────
    def get(self, prospecto_id: int) -> Prospecto:
        p = self.db.get(Prospecto, prospecto_id)
        if not p:
            raise NotFoundError("Prospecto", prospecto_id)
        return p

    def _filtrar(self, q, f: dict):
        if f.get("q"):
            like = f"%{f['q'].strip()}%"
            q = q.filter(or_(
                Prospecto.nombre.ilike(like), Prospecto.ciudad.ilike(like),
                Prospecto.email.ilike(like), Prospecto.segmento.ilike(like),
            ))
        if f.get("segmento"):
            q = q.filter(Prospecto.segmento == f["segmento"])
        if f.get("ciudad"):
            q = q.filter(Prospecto.ciudad == f["ciudad"])
        if f.get("estado"):
            q = q.filter(Prospecto.estado == f["estado"])
        if f.get("con_mail"):
            q = q.filter(Prospecto.email.isnot(None))
        if f.get("con_telefono"):
            q = q.filter(Prospecto.telefono.isnot(None))
        if f.get("score_min") is not None:
            q = q.filter(Prospecto.score >= f["score_min"])
        if f.get("segmentos"):
            q = q.filter(Prospecto.segmento.in_(f["segmentos"]))
        if f.get("nunca_contactados"):
            # "Nunca les escribimos": siguen en `nuevo` y no hay ningún mail
            # nuestro que les haya salido.
            from app.models.prospecto import CampanaEnvio
            q = q.filter(
                Prospecto.estado == "nuevo",
                ~Prospecto.id.in_(
                    self.db.query(CampanaEnvio.prospecto_id).filter(CampanaEnvio.enviado_at.isnot(None))
                ),
            )
        if f.get("solo_contactables"):
            q = q.filter(
                Prospecto.no_contactar.is_(False),
                Prospecto.estado.in_(("nuevo", "contactado", "respondio")),
                or_(Prospecto.ya_cliente_id.is_(None), Prospecto.cruce_descartado.is_(True)),
                or_(Prospecto.email.isnot(None), Prospecto.telefono.isnot(None)),
            )
        return q

    def listar(self, filtro: dict, pagina: int = 1, por_pagina: int = 50) -> tuple[list[Prospecto], int]:
        q = self._filtrar(self.db.query(Prospecto), filtro)
        total = q.count()
        items = (
            q.order_by(Prospecto.score.desc().nullslast(), Prospecto.nombre)
            .offset((pagina - 1) * por_pagina).limit(por_pagina).all()
        )
        return items, total

    def ids_por_filtro(self, filtro: dict) -> list[int]:
        q = self._filtrar(self.db.query(Prospecto.id), filtro)
        return [i for (i,) in q.order_by(Prospecto.id).limit(MAXIMO_POR_SELECCION + 1).all()]

    def resumen(self) -> dict:
        por_estado = dict(self.db.query(Prospecto.estado, func.count()).group_by(Prospecto.estado).all())
        segmentos = [
            {"segmento": s or "Sin segmento", "cantidad": n}
            for s, n in self.db.query(Prospecto.segmento, func.count())
            .group_by(Prospecto.segmento).order_by(func.count().desc()).all()
        ]
        ciudades = [c for (c,) in self.db.query(Prospecto.ciudad).filter(Prospecto.ciudad.isnot(None)).distinct().order_by(Prospecto.ciudad).all()]
        contactables = self._filtrar(self.db.query(Prospecto), {"solo_contactables": True}).count()
        return {
            "total": sum(por_estado.values()), "por_estado": por_estado,
            "segmentos": segmentos, "ciudades": ciudades, "contactables": contactables,
        }

    # ── Cambios de estado ───────────────────────────────────────────────────
    def cambiar_estado(self, ids: list[int], estado: str) -> int:
        if estado not in ("nuevo", "contactado", "respondio", "descartado"):
            raise BusinessRuleError("estado_invalido", "Ese estado no se puede poner a mano.")
        n = 0
        for p in self.db.query(Prospecto).filter(Prospecto.id.in_(ids)).all():
            if p.no_contactar:
                continue  # quien pidió que no lo contacten no vuelve a la cola
            p.estado = estado
            n += 1
        self.db.flush()
        return n

    # ── Campañas ────────────────────────────────────────────────────────────
    def crear_campana(
        self, nombre: str, ids: list[int], filtro: dict | None, usuario_id: int | None,
    ) -> CampanaProspecto:
        nombre = (nombre or "").strip()
        if not nombre:
            raise BusinessRuleError("campana_sin_nombre", "Ponele un nombre a la campaña.")
        if not ids:
            raise BusinessRuleError("campana_sin_destinatarios", "No hay prospectos seleccionados.")
        if len(ids) > MAXIMO_POR_SELECCION:
            raise BusinessRuleError(
                "seleccion_demasiado_grande",
                f"Son más de {MAXIMO_POR_SELECCION} prospectos. Filtrá un poco más: "
                "una campaña tan grande no se puede revisar.",
            )
        campana = CampanaProspecto(
            nombre=nombre, filtro=filtro, creada_por=usuario_id,
        )
        self.db.add(campana)
        self.db.flush()
        for p in self.db.query(Prospecto).filter(Prospecto.id.in_(ids)).all():
            motivo = motivo_para_no_escribir(
                ya_cliente=p.es_cliente, no_contactar=p.no_contactar, estado=p.estado,
                sin_canal=not (p.email or p.telefono),
            )
            self.db.add(CampanaDestinatario(
                campana_id=campana.id, prospecto_id=p.id,
                estado="omitido" if motivo else "pendiente", motivo=motivo,
            ))
        self.db.flush()
        self.db.refresh(campana)
        return campana

    def get_campana(self, campana_id: int) -> CampanaProspecto:
        c = self.db.get(CampanaProspecto, campana_id)
        if not c:
            raise NotFoundError("Campaña", campana_id)
        return c

    def resumen_de_campana(self, c: CampanaProspecto) -> dict:
        cuentas = dict(
            self.db.query(CampanaDestinatario.estado, func.count())
            .filter(CampanaDestinatario.campana_id == c.id)
            .group_by(CampanaDestinatario.estado).all()
        )
        omitidos: dict[str, int] = {}
        for motivo, n in (
            self.db.query(CampanaDestinatario.motivo, func.count())
            .filter(CampanaDestinatario.campana_id == c.id, CampanaDestinatario.estado == "omitido")
            .group_by(CampanaDestinatario.motivo).all()
        ):
            omitidos[motivo or "—"] = n
        return {"destinatarios": sum(cuentas.values()), "por_estado": cuentas, "omitidos_por_motivo": omitidos}

    def actualizar_mensaje(self, campana_id: int, asunto: str | None, cuerpo: str | None) -> CampanaProspecto:
        c = self.get_campana(campana_id)
        if c.estado not in ("borrador", "lista"):
            raise BusinessRuleError("campana_ya_salio", "La campaña ya salió y no se puede editar.")
        c.asunto = _limpio(asunto)
        c.cuerpo = _limpio(cuerpo)
        c.estado = "borrador"
        self.db.flush()
        return c

    def preparar(self, campana_id: int) -> CampanaProspecto:
        """
        Deja la campaña lista para salir. **No envía nada**: el envío se enciende
        cuando haya mensaje y remitente verificado.
        """
        c = self.get_campana(campana_id)
        if c.estado not in ("borrador", "lista"):
            raise BusinessRuleError("campana_ya_salio", "La campaña ya salió.")
        if not (c.asunto and c.cuerpo):
            raise BusinessRuleError(
                "campana_sin_mensaje",
                "Falta escribir el mensaje (asunto y cuerpo) antes de preparar la campaña.",
            )
        if settings.from_email.lower().endswith("@resend.dev"):
            raise BusinessRuleError(
                "remitente_sin_verificar",
                "Falta verificar el dominio de Ubicar en Resend: con el remitente de "
                "prueba los mails no llegan a nadie.",
            )
        pendientes = (
            self.db.query(CampanaDestinatario)
            .filter(CampanaDestinatario.campana_id == c.id, CampanaDestinatario.estado == "pendiente")
            .count()
        )
        if pendientes == 0:
            raise BusinessRuleError(
                "campana_sin_destinatarios", "Ningún destinatario se puede contactar."
            )
        c.estado = "lista"
        self.db.flush()
        return c
