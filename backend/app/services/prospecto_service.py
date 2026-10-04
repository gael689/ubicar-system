"""
Prospectos y campañas de captación de Ubicar.

Tres cosas, en este orden: **importar** lo que trae el buscador (sin duplicar),
**cruzar** contra los clientes de Ubicar (para no captar a quien ya es cliente),
y **armar campañas** sobre una selección — a mano, o "todos los que cumplen este
filtro" — dejando anotado a quién no se le escribe y por qué.

El envío todavía no existe a propósito: falta el mensaje y el remitente
verificado, y `preparar` se niega hasta que estén.
"""
from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain.prospectos import (
    DatosDeContacto, IndiceDeClientes, motivo_para_no_escribir,
)
from app.models.cliente import DNI_CLIENTE_GENERICO, Cliente, ClienteContacto
from app.models.prospecto import CampanaDestinatario, CampanaProspecto, Prospecto

# Tope de una selección "por filtro": una campaña de miles no se revisa.
MAXIMO_POR_SELECCION = 5000

CAMPOS_IMPORTABLES = (
    "nombre", "segmento", "ciudad", "direccion", "telefono", "email", "website",
    "instagram", "score", "contacto_previo", "contacto_previo_detalle",
    "no_contactar", "no_contactar_motivo", "notas",
)


def _limpio(v):
    if isinstance(v, str):
        v = v.strip()
    return v or None


class ProspectoService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Importar ────────────────────────────────────────────────────────────
    def importar(self, items: list[dict]) -> dict:
        """
        Alta o actualización por `ref_externa`. Nunca pisa un dato con vacío, y
        **nunca revive a quien pidió que no lo contacten**: `no_contactar` sólo
        puede encenderse desde acá, no apagarse.
        """
        nuevos = actualizados = invalidos = 0
        for item in items:
            nombre = _limpio(item.get("nombre"))
            if not nombre:
                invalidos += 1
                continue
            ref = _limpio(item.get("ref_externa"))
            p = (
                self.db.query(Prospecto).filter(Prospecto.ref_externa == ref).first()
                if ref else None
            )
            if p is None:
                p = Prospecto(nombre=nombre, ref_externa=ref)
                self.db.add(p)
                nuevos += 1
            else:
                actualizados += 1
            for campo in CAMPOS_IMPORTABLES:
                if campo not in item:
                    continue
                valor = _limpio(item[campo]) if isinstance(item[campo], str) else item[campo]
                if campo == "no_contactar":
                    if valor:
                        p.no_contactar = True
                    continue
                if valor is None and campo != "contacto_previo":
                    continue
                setattr(p, campo, valor)
            if p.no_contactar:
                p.estado = "no_contactar"
        self.db.flush()
        cruzados = self.cruzar()
        return {"nuevos": nuevos, "actualizados": actualizados, "invalidos": invalidos,
                "ya_clientes": cruzados}

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
        if f.get("contacto_previo") is not None:
            q = q.filter(Prospecto.contacto_previo.is_(bool(f["contacto_previo"])))
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
        self, nombre: str, ids: list[int], filtro: dict | None, incluir_contacto_previo: bool,
        usuario_id: int | None,
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
            nombre=nombre, filtro=filtro, incluir_contacto_previo=incluir_contacto_previo,
            creada_por=usuario_id,
        )
        self.db.add(campana)
        self.db.flush()
        for p in self.db.query(Prospecto).filter(Prospecto.id.in_(ids)).all():
            motivo = motivo_para_no_escribir(
                ya_cliente=p.es_cliente, no_contactar=p.no_contactar,
                contacto_previo=p.contacto_previo, estado=p.estado,
                sin_canal=not (p.email or p.telefono),
                incluir_contacto_previo=incluir_contacto_previo,
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
