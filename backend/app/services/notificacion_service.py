"""
NotificacionService — motor de reglas unificado (Fase 2, plan maestro §4).

Reemplaza dos sistemas paralelos que existían antes:
- `services/alertas.py` (huérfano — nadie lo llamaba).
- `routers/notificaciones.py` computando todo on-demand en cada request de
  la campana, sin persistencia (no se podía marcar leído/posponer/descartar,
  ni saber si algo ya se había avisado).

`generar()` corre todas las reglas de `domain/notificaciones_reglas.py`,
inserta las que son nuevas (por `clave_dedupe`) y auto-resuelve las que ya
no aplican. Lo llama el scheduler todos los días a las 08:00 ART, y también
se puede disparar a mano (botón "actualizar" de la campana, o el evento
puntual de un echeq rechazado).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import case, exists, extract, func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.domain.notificaciones_reglas import evaluar_todas
from app.models.notificacion import Notificacion, NotificacionVista

ESTADOS_ACTIVOS = ("pendiente", "enviada", "pospuesta")

# Avisos de **estado continuo**: hablan de algo que sigue igual hasta que
# alguien lo arregla (una categoría sin precio, un cliente sin DNI, un service
# vencido). Estas reglas ponen `fecha_objetivo = hoy`, así que la clave de
# dedupe cambiaba cada día y el motor creaba **una fila nueva por día** para el
# mismo problema, sin importar que la de ayer siguiera abierta. Leerla o
# descartarla sólo escondía la de ese día: al siguiente nacía otra. Era la causa
# principal de la campana clavada en "99+".
#
# Ahora hay una sola fila por (tipo, entidad) mientras el problema exista, y si
# alguien la descarta, se vuelve a avisar recién pasados `REAVISO_DIAS`.
TIPOS_DE_ESTADO_CONTINUO = frozenset({
    "checkout_pendiente",
    "limite_credito_superado",
    "service_km_vencido",
    "service_km_proximo",
    "vehiculo_fuera_servicio_prolongado",
    "datos_por_completar",
    # Un contrato sin firmar es un aviso por reserva, que sube de urgencia a
    # medida que se acerca la entrega: el motor le actualiza texto y urgencia.
    "contrato_no_firmado",
})
REAVISO_DIAS = 7

# Estado continuo **que escala**: el mismo asunto sube de urgencia a medida que
# se acerca una fecha (el contrato sin firmar: `media` a 2-3 días de la
# entrega, `alta` el día anterior y el mismo día). Para éstos la regla general
# de arriba callaba justo el aviso que importa: descartar el de "entrega en 3
# días" —o que se resolviera porque se regeneró el contrato— silenciaba por
# siete días el del día de la entrega.
#
# Para estos tipos:
#   - una fila **resuelta** no silencia nada: si el problema volvió (el contrato
#     regenerado tampoco está firmado), se vuelve a avisar;
#   - una **descartada** silencia sólo mientras la urgencia no suba: quien
#     descartó el "media" se entera del "alta", pero no recibe otro "alta" al
#     día siguiente. Es el mismo principio de no repetir cada día, medido en
#     escalones y no en días.
TIPOS_QUE_ESCALAN = frozenset({"contrato_no_firmado"})
RANGO_URGENCIA = {"baja": 0, "media": 1, "alta": 2, "critica": 3}

# Avisos **escalonados**: el mismo asunto avisa en pocos momentos espaciados
# (deuda a los 7, 15 y 30 días; un vencimiento a los 15 y a los 3). Cada
# escalón es una fila propia (`escalon` en la clave), y **el nuevo reemplaza al
# anterior**: hay una sola fila activa por asunto, la del escalón en que está.
TIPOS_ESCALONADOS = frozenset({
    "cc_vencida",
    "vtv_vencimiento",
    "poliza_vencimiento",
    "doc_vehiculo_por_vencer",
    "doc_vehiculo_vencido",
    "doc_cliente_por_vencer",
    "doc_cliente_vencido",
    "licencia_cliente_por_vencer",
    # Un echeq: "se cobra en N días" y después "se cobra hoy", una sola fila.
    "echeq_proximo",
})

# Una reserva web es **un** aviso. El instantáneo (`reserva_web_nueva`, al
# entrar) y las reglas que la siguen reclamando (sin atender, sin asignar,
# esperando la transferencia) hablaban de la misma reserva, y la campana
# mostraba dos o tres filas por cada una. Mientras el instantáneo siga abierto
# —o alguien lo haya descartado hace poco—, las reglas no suman otra fila: son
# la red de seguridad para cuando el instantáneo no existe o ya se resolvió.
TIPOS_REGLA_RESERVA_WEB = frozenset({
    "reserva_web_sin_atender",
    "reserva_web_sin_asignar",
    "reserva_web_esperando_transferencia",
})

# Tipos de aviso instantáneo (`generar_una`, no catalogados) que escalan solos
# si nadie resuelve la reserva o el contrato que los generó. Es el C-9: "avisos
# hasta que alguien vea esta reserva". No es horario hábil de verdad —eso es un
# módulo aparte que no existe hoy—, es horas de reloj, documentado como
# simplificación consciente.
TIPOS_ESCALABLES = ("reserva_web_nueva", "reserva_web_sin_asignar", "reserva_web_esperando_transferencia")
HORAS_PARA_ESCALAR = 4

# Orden de la cola: lo urgente primero, y recién después lo reciente.
#
# Se resuelve en la base y no en Python porque el historial viene paginado: si
# el orden se armara después de traer la página, la página 1 no tendría las
# críticas sino las últimas cargadas.
PESO_URGENCIA = case(
    {"critica": 0, "alta": 1, "media": 2, "baja": 3},
    value=Notificacion.urgencia,
    else_=4,
)


def _lista(valor: str) -> list[str]:
    """`"critica,alta"` → `["critica", "alta"]`."""
    return [v.strip() for v in valor.split(",") if v.strip()]


def _clave_dedupe(c: dict) -> str:
    clave = f"{c['tipo']}:{c['entidad_tipo']}:{c['entidad_id']}:{c['fecha_objetivo'] or ''}"
    # Los escalonados suman el escalón, así cada uno es un aviso propio. Sólo si
    # viene: las claves de todo lo demás quedan exactamente como estaban.
    if c.get("escalon") is not None:
        clave += f":{c['escalon']}"
    return clave


class NotificacionService:
    def __init__(self, db: Session):
        self.db = db

    # ── Motor ────────────────────────────────────────────────────────────

    def generar(self, hoy: date | None = None) -> dict:
        """Evalúa el catálogo completo de reglas, inserta lo nuevo (dedup por
        clave) y auto-resuelve lo que ya no aparece. No hace commit — lo hace
        el caller (router o scheduler)."""
        hoy = hoy or date.today()
        candidatos = self._sin_repetir_reserva_web(evaluar_todas(self.db, hoy), hoy)

        claves_generadas = {_clave_dedupe(c) for c in candidatos}
        existentes = {
            n.clave_dedupe
            for n in self.db.query(Notificacion.clave_dedupe)
            .filter(Notificacion.clave_dedupe.in_(claves_generadas))
            .all()
        }

        ya_avisados = self._ya_avisados_de_estado_continuo(candidatos, hoy)

        creadas = 0
        for c in candidatos:
            clave = _clave_dedupe(c)
            if c["tipo"] in TIPOS_QUE_ESCALAN:
                creadas += self._avisar_escalable(c, clave, hoy)
                continue
            if clave in existentes:
                continue
            if c["tipo"] in TIPOS_DE_ESTADO_CONTINUO:
                quien = (c["tipo"], c["entidad_tipo"], c["entidad_id"])
                if quien in ya_avisados:
                    continue
                ya_avisados.add(quien)
            self.db.add(Notificacion(
                tipo=c["tipo"],
                titulo=c["titulo"],
                descripcion=c["descripcion"],
                urgencia=c["urgencia"],
                entidad_tipo=c["entidad_tipo"],
                entidad_id=c["entidad_id"],
                url_destino=c["url_destino"],
                fecha_objetivo=c["fecha_objetivo"],
                clave_dedupe=clave,
                estado="pendiente",
            ))
            creadas += 1

        resueltas = self._auto_resolver(candidatos)
        self.db.flush()
        self._refrescar_texto(candidatos)
        colapsadas = self._colapsar_duplicadas()
        self.db.flush()
        return {
            "creadas": creadas,
            "resueltas": resueltas + colapsadas,
            "evaluadas": len(candidatos),
        }

    def _sin_repetir_reserva_web(self, candidatos: list[dict], hoy: date) -> list[dict]:
        """
        Saca los candidatos de las reglas de reserva web cuya reserva ya tiene
        su aviso instantáneo (`reserva_web_nueva`) abierto, o descartado hace
        menos de `REAVISO_DIAS`. Ver `TIPOS_REGLA_RESERVA_WEB`.

        Al sacarlos de los candidatos, `_auto_resolver` además resuelve las
        filas de esas reglas que ya se habían acumulado: la campana se limpia
        sola en la próxima corrida.
        """
        ids = {
            c["entidad_id"] for c in candidatos
            if c["tipo"] in TIPOS_REGLA_RESERVA_WEB and c["entidad_tipo"] == "reserva"
        }
        if not ids:
            return candidatos
        limite = datetime.combine(hoy - timedelta(days=REAVISO_DIAS), time.min)
        con_aviso = {
            eid for (eid,) in self.db.query(Notificacion.entidad_id).filter(
                Notificacion.tipo == "reserva_web_nueva",
                Notificacion.entidad_tipo == "reserva",
                Notificacion.entidad_id.in_(ids),
                or_(
                    Notificacion.estado.in_(ESTADOS_ACTIVOS),
                    (Notificacion.estado == "descartada") & (Notificacion.created_at >= limite),
                ),
            ).all()
        }
        return [
            c for c in candidatos
            if not (c["tipo"] in TIPOS_REGLA_RESERVA_WEB and c["entidad_id"] in con_aviso)
        ]

    def _avisar_escalable(self, c: dict, clave: str, hoy: date) -> int:
        """
        Crea —o reabre— el aviso de un tipo de `TIPOS_QUE_ESCALAN`. Devuelve 1
        si quedó un aviso nuevo en la campana, 0 si no.

        **Reabre en vez de insertar** cuando ya hay una fila con la misma clave
        (la clave es única y para el contrato no cambia: tipo + reserva + fecha
        de entrega). Reabrirla también borra los "visto" de esa fila: el aviso
        subió de escalón y tiene que volver a verse.
        """
        filas = (
            self.db.query(Notificacion)
            .filter(
                Notificacion.tipo == c["tipo"],
                Notificacion.entidad_tipo == c["entidad_tipo"],
                Notificacion.entidad_id == c["entidad_id"],
            )
            .all()
        )
        # Abierta: `_refrescar_texto` le sube la urgencia, no hace falta otra.
        if any(n.estado in ESTADOS_ACTIVOS for n in filas):
            return 0

        rango = RANGO_URGENCIA.get(c["urgencia"], 0)
        limite = datetime.combine(hoy - timedelta(days=REAVISO_DIAS), time.min)
        for n in filas:
            if n.estado != "descartada":
                continue
            # La descartada cuenta si es de este mismo asunto (misma clave) o
            # reciente — una de hace meses, de otra entrega, no calla nada.
            relevante = n.clave_dedupe == clave or (n.created_at and n.created_at >= limite)
            if relevante and RANGO_URGENCIA.get(n.urgencia, 0) >= rango:
                return 0

        existente = next((n for n in filas if n.clave_dedupe == clave), None)
        if existente is not None:
            existente.estado = "pendiente"
            existente.titulo = c["titulo"]
            existente.descripcion = c["descripcion"]
            existente.urgencia = c["urgencia"]
            existente.url_destino = c["url_destino"]
            existente.resuelta_at = None
            existente.posponer_hasta = None
            self.db.query(NotificacionVista).filter(
                NotificacionVista.notificacion_id == existente.id
            ).delete(synchronize_session=False)
            return 1

        self.db.add(Notificacion(
            tipo=c["tipo"],
            titulo=c["titulo"],
            descripcion=c["descripcion"],
            urgencia=c["urgencia"],
            entidad_tipo=c["entidad_tipo"],
            entidad_id=c["entidad_id"],
            url_destino=c["url_destino"],
            fecha_objetivo=c["fecha_objetivo"],
            clave_dedupe=clave,
            estado="pendiente",
        ))
        # Sin flush, dos candidatos iguales en la misma corrida no se verían.
        self.db.flush()
        return 1

    def _ya_avisados_de_estado_continuo(
        self, candidatos: list[dict], hoy: date
    ) -> set[tuple]:
        """
        Los (tipo, entidad) de estado continuo que **no hay que volver a
        avisar hoy**: tienen una fila activa, o se avisó hace menos de
        `REAVISO_DIAS`. Lo segundo es lo que evita que descartar un aviso lo
        haga reaparecer mañana.
        """
        tipos = {c["tipo"] for c in candidatos if c["tipo"] in TIPOS_DE_ESTADO_CONTINUO}
        if not tipos:
            return set()
        limite = datetime.combine(hoy - timedelta(days=REAVISO_DIAS), time.min)
        filas = (
            self.db.query(Notificacion.tipo, Notificacion.entidad_tipo, Notificacion.entidad_id)
            .filter(
                Notificacion.tipo.in_(tipos),
                or_(
                    Notificacion.estado.in_(ESTADOS_ACTIVOS),
                    Notificacion.created_at >= limite,
                ),
            )
            .all()
        )
        return {(t, et, eid) for t, et, eid in filas}

    def _refrescar_texto(self, candidatos: list[dict]) -> None:
        """
        Al aviso de estado continuo que ya existe le actualiza el texto y la
        urgencia. Sin esto un resumen ("Hay 9 datos por completar") quedaba
        para siempre con el número del día en que nació.
        """
        vigentes = {
            (c["tipo"], c["entidad_tipo"], c["entidad_id"]): c
            for c in candidatos if c["tipo"] in TIPOS_DE_ESTADO_CONTINUO
        }
        if not vigentes:
            return
        activas = (
            self.db.query(Notificacion)
            .filter(
                Notificacion.tipo.in_({k[0] for k in vigentes}),
                Notificacion.estado.in_(ESTADOS_ACTIVOS),
            )
            .all()
        )
        for n in activas:
            c = vigentes.get((n.tipo, n.entidad_tipo, n.entidad_id))
            if c is None:
                continue
            n.titulo = c["titulo"]
            n.descripcion = c["descripcion"]
            n.urgencia = c["urgencia"]

    def _colapsar_duplicadas(self) -> int:
        """
        Deja **una** fila activa por asunto y resuelve las demás. Repara lo que
        ya se acumuló y sostiene el escalonado: cada corrida del motor lo hace,
        así que el contador baja solo, sin migración.

        - **Estado continuo**: se conserva la **más vieja**. Es la que puede
          tener el acuse de alguien o un "posponer" puesto, y perderlos haría
          reaparecer el aviso justo para quien ya lo había atendido.
        - **Escalonados**: se conserva la **más nueva**, que es el escalón en el
          que está hoy. El "a los 7 días" no tiene sentido al lado del "a los 30".
          El asunto es tipo + entidad + fecha del hecho: dos documentos del mismo
          auto son dos asuntos.
        """
        colapsadas = 0
        activas = (
            self.db.query(Notificacion)
            .filter(
                Notificacion.tipo.in_(TIPOS_DE_ESTADO_CONTINUO | TIPOS_ESCALONADOS),
                Notificacion.estado.in_(ESTADOS_ACTIVOS),
                Notificacion.autoresoluble.is_(True),
            )
            .order_by(Notificacion.created_at.asc(), Notificacion.id.asc())
            .all()
        )
        ganadoras: dict[tuple, Notificacion] = {}
        for n in activas:
            if n.tipo in TIPOS_ESCALONADOS:
                quien = (n.tipo, n.entidad_tipo, n.entidad_id, n.fecha_objetivo)
            else:
                quien = (n.tipo, n.entidad_tipo, n.entidad_id)
            previa = ganadoras.get(quien)
            if previa is None:
                ganadoras[quien] = n
                continue
            perdedora = previa if n.tipo in TIPOS_ESCALONADOS else n
            if n.tipo in TIPOS_ESCALONADOS:
                ganadoras[quien] = n
            perdedora.estado = "resuelta"
            perdedora.resuelta_at = datetime.utcnow()
            colapsadas += 1
        return colapsadas

    def generar_una(self, candidato: dict, solo_historial: bool = False) -> Notificacion | None:
        """Crea una notificación puntual fuera del ciclo del motor — para
        eventos instantáneos que no deben esperar a la corrida de las 08:00
        (ej: echeq rechazado al registrarlo). Idempotente por clave_dedupe.

        **`autoresoluble=False`** (plan de conexión 13/08, cierra C-2/C-3):
        estas notificaciones no salen de ninguna regla del catálogo, así que
        `_auto_resolver` nunca las va a encontrar entre los candidatos de una
        corrida — y antes de esta columna eso las marcaba "resueltas" en el
        primer barrido, aunque nadie las hubiera atendido. Se resuelven a
        mano o cuando la entidad cambia de estado (`resolver_por_entidad`).

        **`solo_historial=True`** la crea ya resuelta: queda registrado que
        pasó (se ve en el historial) pero no suma a la campana. Es para los
        hechos que son buenas noticias y no piden hacer nada, como que el
        cliente firmó el contrato.
        """
        clave = _clave_dedupe(candidato)
        existe = self.db.query(Notificacion).filter(Notificacion.clave_dedupe == clave).first()
        if existe:
            return None
        notif = Notificacion(
            tipo=candidato["tipo"],
            titulo=candidato["titulo"],
            descripcion=candidato["descripcion"],
            urgencia=candidato["urgencia"],
            entidad_tipo=candidato["entidad_tipo"],
            entidad_id=candidato["entidad_id"],
            url_destino=candidato["url_destino"],
            fecha_objetivo=candidato["fecha_objetivo"],
            clave_dedupe=clave,
            estado="resuelta" if solo_historial else "pendiente",
            resuelta_at=datetime.utcnow() if solo_historial else None,
            autoresoluble=False,
        )
        self.db.add(notif)
        self.db.flush()
        return notif

    def resolver_por_entidad(
        self, entidad_tipo: str, entidad_id: int, resuelta_por: int | None = None
    ) -> int:
        """
        Resuelve todas las notificaciones activas de una entidad puntual —
        el disparador real para las `autoresoluble=False` (C-2/C-3): esas no
        las toca `_auto_resolver`, así que necesitan que quien cambia el
        estado de la reserva o el contrato avise que ya no hace falta el
        aviso. Se llama, por ejemplo, al asignar el vehículo de una reserva
        web o al rechazarla.
        """
        activas = (
            self.db.query(Notificacion)
            .filter(
                Notificacion.entidad_tipo == entidad_tipo,
                Notificacion.entidad_id == entidad_id,
                Notificacion.estado.in_(ESTADOS_ACTIVOS),
            )
            .all()
        )
        ahora = datetime.utcnow()
        for n in activas:
            n.estado = "resuelta"
            n.resuelta_at = ahora
            n.resuelta_por = resuelta_por
        if activas:
            self.db.flush()
        return len(activas)

    def avisar_reserva_web(self, reserva) -> Notificacion | None:
        """
        Aviso instantáneo de una reserva que entró por la web.

        **No puede esperar al barrido de las 08:00.** Una reserva que llega un
        sábado a la tarde quedaría sin respuesta hasta el lunes, y una reserva
        web sin responder es una venta que se cae. Por eso se llama en el
        momento de crearla, no desde el motor.

        La regla `reserva_web_sin_atender` del catálogo sigue existiendo como
        red de seguridad: si esto falla o nadie la atiende, vuelve a aparecer
        cada mañana. La deduplicación por `clave_dedupe` evita que se dupliquen.
        """
        critica = reserva.estado == "revision_sin_cupo"
        contacto = getattr(reserva, "web_contacto_nombre", None) or (
            reserva.cliente.nombre_completo if getattr(reserva, "cliente", None) else "?"
        )
        telefono = getattr(reserva, "web_contacto_telefono", None)

        return self.generar_una({
            "tipo": "reserva_web_nueva",
            "titulo": (
                "Reserva web pagada SIN CUPO — resolver ya"
                if critica else "Reserva nueva desde la web"
            ),
            "descripcion": (
                f"Reserva #{reserva.id} — {contacto} — "
                f"{reserva.fecha_inicio.strftime('%d/%m')} al "
                f"{reserva.fecha_fin.strftime('%d/%m')}"
                + (f" — {telefono}" if telefono else "")
            ),
            "urgencia": "critica" if critica else "alta",
            "entidad_tipo": "reserva",
            "entidad_id": reserva.id,
            "url_destino": "/reservas-web",
            "fecha_objetivo": reserva.fecha_inicio,
        })

    def avisar_solicitud_contacto(self, solicitud) -> Notificacion | None:
        """
        Alguien dejó sus datos para que lo llamemos (D-61).

        **Le prometimos una llamada**, y esa promesa es la razón por la que
        esto avisa en el acto en vez de esperar al barrido de las 08:00: una
        solicitud del sábado atendida el lunes es peor que no haber ofrecido
        el botón. Urgencia alta por lo mismo.

        El motivo va en la descripción porque cambia cómo se atiende: no es lo
        mismo "quiere para dentro de tres días" que "quiere que se lo llevemos
        a un campo".
        """
        etiquetas = {
            "fuera_de_ventana": "fecha muy cerca",
            "sin_cupo": "categoría sin cupo",
            "otro_lugar": "lugar a coordinar",
        }
        motivo = etiquetas.get(solicitud.motivo, solicitud.motivo)
        cuando = (
            f" — {solicitud.fecha_inicio.strftime('%d/%m')}"
            + (f" al {solicitud.fecha_fin.strftime('%d/%m')}" if solicitud.fecha_fin else "")
            if solicitud.fecha_inicio else ""
        )
        return self.generar_una({
            "tipo": "solicitud_contacto",
            "titulo": "Piden que los llamemos",
            "descripcion": (
                f"{solicitud.nombre} — {solicitud.telefono} — {motivo}{cuando}"
            ),
            "urgencia": "alta",
            "entidad_tipo": "solicitud_contacto",
            "entidad_id": solicitud.id,
            "url_destino": "/reservas-web",
            "fecha_objetivo": solicitud.fecha_inicio,
        })

    def _auto_resolver(self, candidatos: list[dict]) -> int:
        """Si una notificación activa ya no aparece entre los candidatos
        actuales para su (tipo, entidad_tipo, entidad_id) — sin importar la
        fecha_objetivo, que puede haber cambiado de umbral — la condición que
        la generó desapareció (se cobró el echeq, se hizo el checkin, etc.):
        pasa a resuelta sola.

        **Sólo mira `autoresoluble=True`** (plan de conexión 13/08, C-2/C-3).
        Las de evento puntual (`generar_una`) nunca van a aparecer entre los
        candidatos de ninguna corrida —no salen de ninguna regla del
        catálogo—, así que barrerlas acá era el bug: se resolvían solas en la
        primera corrida sin que nadie las hubiera visto. Esas se resuelven a
        mano o vía `resolver_por_entidad`.
        """
        activas_por_entidad: dict[tuple, set] = {}
        for c in candidatos:
            key = (c["tipo"], c["entidad_tipo"], c["entidad_id"])
            activas_por_entidad.setdefault(key, set()).add(_clave_dedupe(c))

        pendientes = (
            self.db.query(Notificacion)
            .filter(Notificacion.estado.in_(ESTADOS_ACTIVOS), Notificacion.autoresoluble.is_(True))
            .all()
        )
        resueltas = 0
        for n in pendientes:
            key = (n.tipo, n.entidad_tipo, n.entidad_id)
            if key not in activas_por_entidad:
                n.estado = "resuelta"
                n.resuelta_at = datetime.utcnow()
                resueltas += 1
        return resueltas

    def escalar_urgencias(self, ahora: datetime | None = None) -> int:
        """
        C-9: una alerta que nadie atiende sube de urgencia sola.

        Sólo `TIPOS_ESCALABLES`, sólo de `alta` a `critica`, y sólo una vez
        (`escalada_en` evita reescalar en cada corrida). El pedido era "un
        cartel y avisos hasta que alguien vea esta reserva" — sin esto, una
        reserva web sin asignar se queda en `alta` para siempre, con la misma
        prioridad visual el primer minuto que a las tres semanas.
        """
        ahora = ahora or datetime.utcnow()
        limite = ahora - timedelta(hours=HORAS_PARA_ESCALAR)
        candidatas = (
            self.db.query(Notificacion)
            .filter(
                Notificacion.tipo.in_(TIPOS_ESCALABLES),
                Notificacion.urgencia == "alta",
                Notificacion.estado.in_(ESTADOS_ACTIVOS),
                Notificacion.escalada_en.is_(None),
                Notificacion.created_at <= limite,
            )
            .all()
        )
        for n in candidatas:
            n.urgencia = "critica"
            n.escalada_en = ahora
        if candidatas:
            self.db.flush()
        return len(candidatas)

    # ── Consulta ─────────────────────────────────────────────────────────

    def list_activas(
        self,
        urgencia: str | None = None,
        tipo: str | None = None,
        entidad_tipo: str | None = None,
        usuario_id: int | None = None,
    ) -> list[Notificacion]:
        """
        Las notificaciones activas, **ordenadas por urgencia y no por fecha**.

        Antes se ordenaba sólo por `created_at desc`, y eso hacía que una
        crítica de ayer —un auto que no volvió, un contrato sin emitir— quedara
        debajo de una baja generada hoy. La campana muestra las primeras: lo
        importante se hundía justamente por seguir importando el tiempo
        suficiente como para no ser nuevo.

        `urgencia` y `tipo` aceptan varios valores separados por coma, para
        poder mirar "sólo críticas y altas" o una familia entera de una.

        **`usuario_id` saca las que ese usuario ya marcó vistas** (C-9): es el
        acuse por usuario, no un `estado` global — que Franco la marque no la
        esconde para Martín, sólo para Franco. Sin `usuario_id` (llamadas
        internas) devuelve todo lo activo, sin filtrar por lectura de
        nadie.
        """
        ahora = datetime.utcnow()

        def filtrar(q):
            if urgencia:
                q = q.filter(Notificacion.urgencia.in_(_lista(urgencia)))
            if tipo:
                q = q.filter(Notificacion.tipo.in_(_lista(tipo)))
            if entidad_tipo:
                q = q.filter(Notificacion.entidad_tipo.in_(_lista(entidad_tipo)))
            if usuario_id is not None:
                vista = exists().where(
                    NotificacionVista.notificacion_id == Notificacion.id,
                    NotificacionVista.usuario_id == usuario_id,
                )
                q = q.filter(~vista)
            return q.order_by(PESO_URGENCIA, Notificacion.created_at.desc())

        items = filtrar(
            self.db.query(Notificacion).filter(Notificacion.estado.in_(("pendiente", "enviada")))
        ).all()
        # Las pospuestas vuelven a aparecer solo cuando se cumple posponer_hasta.
        pospuestas = filtrar(
            self.db.query(Notificacion).filter(
                Notificacion.estado == "pospuesta",
                Notificacion.posponer_hasta <= ahora,
            )
        ).all()
        return items + pospuestas

    def list_historial(
        self,
        page: int = 1,
        page_size: int = 30,
        solo_resueltas: bool = True,
        fecha: date | None = None,
        anio: int | None = None,
        mes: int | None = None,
        tipo: str | None = None,
        urgencia: str | None = None,
        entidad_tipo: str | None = None,
    ) -> tuple[list[Notificacion], int]:
        """Historial de notificaciones. `solo_resueltas=True` (default) mantiene
        el comportamiento de siempre (leída/descartada/resuelta, usado por el
        diálogo chico de la campana). El módulo dedicado (`/notificaciones`)
        pasa `solo_resueltas=False` para ver todas, con filtros de fecha sobre
        `created_at` — día exacto si viene `fecha`, si no año/mes por separado."""
        q = self.db.query(Notificacion)
        if solo_resueltas:
            q = q.filter(Notificacion.estado.in_(("leida", "descartada", "resuelta")))
        if fecha is not None:
            q = q.filter(func.date(Notificacion.created_at) == fecha)
        else:
            if anio is not None:
                q = q.filter(extract("year", Notificacion.created_at) == anio)
            if mes is not None:
                q = q.filter(extract("month", Notificacion.created_at) == mes)
        if tipo:
            q = q.filter(Notificacion.tipo.in_(_lista(tipo)))
        if urgencia:
            q = q.filter(Notificacion.urgencia.in_(_lista(urgencia)))
        if entidad_tipo:
            q = q.filter(Notificacion.entidad_tipo.in_(_lista(entidad_tipo)))
        total = q.count()
        # El historial sí va por fecha: acá se busca "qué pasó tal día", no
        # "qué atiendo primero".
        items = q.order_by(Notificacion.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return items, total

    def get(self, id: int) -> Notificacion:
        n = self.db.get(Notificacion, id)
        if not n:
            raise NotFoundError("Notificación", id)
        return n

    # ── Acciones (D-19 style: transición explícita, no edición libre) ──────

    def marcar_leida(self, id: int, usuario_id: int) -> Notificacion:
        """
        Acuse **de este usuario**, no un cambio de estado global (C-9).

        Antes esto pisaba `Notificacion.estado = 'leida'`: que uno la leyera
        la escondía para todos, aunque nadie hubiera hecho nada con la
        reserva o el contrato que la generó. Ahora inserta la marca en
        `notificaciones_vistas` y listo — la notificación sigue activa para
        cualquier otro usuario, y para éste vuelve a aparecer si se descarta
        la marca o si el motor la regenera con una `clave_dedupe` nueva.

        `leida_at` se sigue completando la primera vez, a título informativo
        (para el historial), pero ya no decide si algo se ve.
        """
        n = self.get(id)
        ya_vista = (
            self.db.query(NotificacionVista)
            .filter(NotificacionVista.notificacion_id == id, NotificacionVista.usuario_id == usuario_id)
            .first()
        )
        if ya_vista is None:
            self.db.add(NotificacionVista(notificacion_id=id, usuario_id=usuario_id))
        if n.leida_at is None:
            n.leida_at = datetime.utcnow()
        self.db.flush()
        return n

    def posponer(self, id: int, hasta: datetime) -> Notificacion:
        n = self.get(id)
        n.estado = "pospuesta"
        n.posponer_hasta = hasta
        self.db.flush()
        return n

    def descartar(self, id: int) -> Notificacion:
        n = self.get(id)
        n.estado = "descartada"
        self.db.flush()
        return n
