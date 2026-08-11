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

from datetime import date, datetime

from sqlalchemy import case, extract, func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import NotFoundError
from app.domain.notificaciones_reglas import evaluar_todas
from app.models.notificacion import Notificacion, PreferenciaNotificacion

ESTADOS_ACTIVOS = ("pendiente", "enviada", "pospuesta")

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
    return f"{c['tipo']}:{c['entidad_tipo']}:{c['entidad_id']}:{c['fecha_objetivo'] or ''}"


class NotificacionService:
    def __init__(self, db: Session):
        self.db = db

    # ── Motor ────────────────────────────────────────────────────────────

    def generar(self, hoy: date | None = None) -> dict:
        """Evalúa el catálogo completo de reglas, inserta lo nuevo (dedup por
        clave) y auto-resuelve lo que ya no aparece. No hace commit — lo hace
        el caller (router o scheduler)."""
        hoy = hoy or date.today()
        candidatos = evaluar_todas(self.db, hoy)

        claves_generadas = {_clave_dedupe(c) for c in candidatos}
        existentes = {
            n.clave_dedupe
            for n in self.db.query(Notificacion.clave_dedupe)
            .filter(Notificacion.clave_dedupe.in_(claves_generadas))
            .all()
        }

        creadas = 0
        for c in candidatos:
            clave = _clave_dedupe(c)
            if clave in existentes:
                continue
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
        return {"creadas": creadas, "resueltas": resueltas, "evaluadas": len(candidatos)}

    def generar_una(self, candidato: dict) -> Notificacion | None:
        """Crea una notificación puntual fuera del ciclo del motor — para
        eventos instantáneos que no deben esperar a la corrida de las 08:00
        (ej: echeq rechazado al registrarlo). Idempotente por clave_dedupe."""
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
            estado="pendiente",
        )
        self.db.add(notif)
        self.db.flush()
        return notif

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

    def _auto_resolver(self, candidatos: list[dict]) -> int:
        """Si una notificación activa ya no aparece entre los candidatos
        actuales para su (tipo, entidad_tipo, entidad_id) — sin importar la
        fecha_objetivo, que puede haber cambiado de umbral — la condición que
        la generó desapareció (se cobró el echeq, se hizo el checkin, etc.):
        pasa a resuelta sola."""
        activas_por_entidad: dict[tuple, set] = {}
        for c in candidatos:
            key = (c["tipo"], c["entidad_tipo"], c["entidad_id"])
            activas_por_entidad.setdefault(key, set()).add(_clave_dedupe(c))

        pendientes = self.db.query(Notificacion).filter(Notificacion.estado.in_(ESTADOS_ACTIVOS)).all()
        resueltas = 0
        for n in pendientes:
            key = (n.tipo, n.entidad_tipo, n.entidad_id)
            if key not in activas_por_entidad:
                n.estado = "resuelta"
                n.resuelta_at = datetime.utcnow()
                resueltas += 1
        return resueltas

    # ── Consulta ─────────────────────────────────────────────────────────

    def list_activas(
        self,
        urgencia: str | None = None,
        tipo: str | None = None,
        entidad_tipo: str | None = None,
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
        """
        ahora = datetime.utcnow()

        def filtrar(q):
            if urgencia:
                q = q.filter(Notificacion.urgencia.in_(_lista(urgencia)))
            if tipo:
                q = q.filter(Notificacion.tipo.in_(_lista(tipo)))
            if entidad_tipo:
                q = q.filter(Notificacion.entidad_tipo.in_(_lista(entidad_tipo)))
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

    def marcar_leida(self, id: int) -> Notificacion:
        n = self.get(id)
        n.estado = "leida"
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

    # ── Preferencias ─────────────────────────────────────────────────────

    def list_preferencias(self, usuario_id: int) -> list[PreferenciaNotificacion]:
        return (
            self.db.query(PreferenciaNotificacion)
            .filter(PreferenciaNotificacion.usuario_id == usuario_id)
            .all()
        )

    def set_preferencia(
        self, usuario_id: int, tipo_regla: str, canales: list[str], anticipacion_dias: int | None, activo: bool
    ) -> PreferenciaNotificacion:
        pref = (
            self.db.query(PreferenciaNotificacion)
            .filter(
                PreferenciaNotificacion.usuario_id == usuario_id,
                PreferenciaNotificacion.tipo_regla == tipo_regla,
            )
            .first()
        )
        if pref is None:
            pref = PreferenciaNotificacion(usuario_id=usuario_id, tipo_regla=tipo_regla)
            self.db.add(pref)
        pref.canales = canales
        pref.anticipacion_dias = anticipacion_dias
        pref.activo = activo
        self.db.flush()
        return pref

    # ── Digest matutino por email ───────────────────────────────────────
    # Último canal a implementar (a pedido explícito del usuario). El motor
    # ya corre a las 08:00 ART y persiste todo — esto sólo arma un resumen
    # de lo activo en ese momento y lo manda por Resend. Sin destinatarios
    # configurados (`settings.notificaciones_digest_destinatarios` vacío) no
    # se manda nada; sin `resend_api_key` el intento queda registrado como
    # fallido en `emails_enviados` (ver EmailService).

    _ORDEN_URGENCIA = ("critica", "alta", "media", "baja")
    _LABEL_URGENCIA = {
        "critica": "🔴 CRÍTICO",
        "alta": "🟠 ALTA",
        "media": "🟡 MEDIA",
        "baja": "⚪ BAJA",
    }

    def construir_digest(self, hoy: date | None = None) -> tuple[str, str] | None:
        """Arma (asunto, html) del digest a partir de lo activo ahora mismo.
        Devuelve None si no hay nada que avisar (no manda un mail vacío)."""
        hoy = hoy or date.today()
        items = self.list_activas()
        if not items:
            return None

        por_urgencia: dict[str, list[Notificacion]] = {u: [] for u in self._ORDEN_URGENCIA}
        for n in items:
            por_urgencia.setdefault(n.urgencia, []).append(n)

        bloques = []
        for urgencia in self._ORDEN_URGENCIA:
            notifs = por_urgencia.get(urgencia) or []
            if not notifs:
                continue
            filas = "".join(
                f"<li><strong>{n.titulo}</strong> — {n.descripcion}</li>"
                for n in notifs
            )
            bloques.append(
                f"<h3>{self._LABEL_URGENCIA[urgencia]} ({len(notifs)})</h3><ul>{filas}</ul>"
            )

        fecha_str = hoy.strftime("%d/%m/%Y")
        html = f"<h2>Resumen de notificaciones — {fecha_str}</h2>{''.join(bloques)}"
        asunto = f"Ubicar Rent — {len(items)} notificaciones activas ({fecha_str})"
        return asunto, html

    def enviar_digest_matutino(self, hoy: date | None = None) -> int:
        """Arma el digest y lo manda a los destinatarios configurados.
        Devuelve cuántos envíos se hicieron con éxito (0 si no hay nada que
        avisar, no hay destinatarios, o falló Resend).

        Pasa por `EmailService` como todo lo demás: así el digest que no salió
        un martes queda registrado en el panel, en vez de perderse en el log
        del servidor."""
        from app.services.email_service import EmailService

        destinatarios = [
            d.strip() for d in settings.notificaciones_digest_destinatarios.split(",") if d.strip()
        ]
        if not destinatarios:
            return 0
        digest = self.construir_digest(hoy)
        if digest is None:
            return 0
        asunto, html = digest
        svc = EmailService(self.db)
        enviados = 0
        for destino in destinatarios:
            registro = svc.registrar_y_enviar(
                tipo="digest", destinatario=destino, asunto=asunto, html=html
            )
            if registro is not None and registro.estado == "enviado":
                enviados += 1
        return enviados
