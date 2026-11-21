"""
El envío de las campañas de prospección: casillas, campaña rápida, motor y
todo lo que vuelve (entregas, rebotes, quejas, respuestas, bajas).

Pedido de Gael (21/11/2026): *"es tedioso el crear campaña, enviar, muy largo,
debe ser súper rápido, con un buen mensaje, y sub-dominios de Ubicar, con
casilla de correo"*.

**Cómo se reparte el trabajo.** Las reglas —rampa, reparto, freno, ventana
horaria, token de baja, plantillas— son puras y viven en `domain/`. Acá se
juntan los datos y se aplica lo que ellas deciden. El paso a paso para dejarlo
andando está en `docs/PROSPECCION.md`.

**Nada de esto sale del remitente de los mails a clientes.** Va por otra
función de envío (`adapters/resend_prospeccion.py`), con casillas propias en un
subdominio, para que un mail en frío nunca le pegue a la reputación del dominio
con el que salen las confirmaciones de reserva.
"""
from __future__ import annotations

import html
import logging
import random
import re
from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.adapters.resend_dominios import (
    Dominio, ErrorDeResend, RegistroDNS, ResendDominios, SinPermiso,
)
from app.adapters.resend_prospeccion import (
    EnviadorResend, EnviadorSimulado, MailDeProspeccion,
)
from app.config import settings
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.domain import plantillas_prospeccion as plantillas
from app.domain import prospeccion_envio as reglas
from app.domain.prospectos import mail_valido, motivo_para_no_mandar_mail
from app.models.prospecto import (
    CampanaDestinatario, CampanaEnvio, CampanaProspecto, CasillaProspeccion, Prospecto,
)

logger = logging.getLogger(__name__)

# Cuántos mails se intentan por casilla en cada vuelta del motor. Uno solo: el
# espaciado entre envíos lo da el reloj (`proximo_envio_at`), no un `sleep`.
SALTEOS_POR_VUELTA = 20
# Un envío tomado hace más de esto y que nunca se cerró quedó huérfano (se
# reinició el contenedor en el medio): vuelve a la cola. La clave de
# idempotencia de Resend evita que salga dos veces.
MINUTOS_PARA_SOLTAR = 15
INTENTOS_MAXIMOS = 3
ESTADOS_EN_CURSO = ("enviando", "pausada")
MOTIVO_PAUSA_MANUAL = "Pausada a mano."


# ─── Configuración ───────────────────────────────────────────────────────────

def api_key() -> str:
    return (settings.prospeccion_resend_api_key or settings.resend_api_key or "").strip()


def simula() -> bool:
    """
    Fuera de producción, o sin API key, **no sale nada**: los envíos quedan
    registrados como simulados. Así se puede recorrer el flujo entero en una
    máquina de desarrollo sin escribirle a ninguna empresa real.
    """
    return not settings.is_production or not api_key()


def lista_blanca() -> set[str]:
    return {d.strip().lower() for d in (settings.prospeccion_solo_a or "").split(",") if d.strip()}


def secreto_de_baja() -> str:
    """
    La clave de los links de baja. Si no se cargó `PROSPECCION_SECRETO` se
    deriva de otro secreto que ya existe y no cambia (la clave de Clerk; si no,
    la URL de la base, que lleva la contraseña). Nunca queda una clave fija en
    el código: con una clave conocida cualquiera podría dar de baja a todos.
    """
    return (settings.prospeccion_secreto or settings.clerk_secret_key
            or settings.database_url or "ubicar")


def base_publica() -> str:
    return (settings.backend_public_url or "http://localhost:8000").rstrip("/")


def url_de_baja(prospecto_id: int) -> str:
    token = reglas.token_de_baja(secreto_de_baja(), prospecto_id)
    return f"{base_publica()}/api/v1/public/baja/{token}"


def raiz() -> str:
    return reglas.dominio_raiz(settings.prospeccion_dominio_raiz, settings.from_email)


def html_minimo(texto: str) -> str:
    """
    El mismo texto, en el HTML más chico posible: sin imágenes, sin botones,
    sin colores de marca. Sólo existe para que los links se puedan tocar.
    """
    seguro = html.escape(texto)
    seguro = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', seguro)
    return ('<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;'
            f'color:#222">{seguro.replace(chr(10), "<br>")}</div>')


def _con_pie(cuerpo: str) -> str:
    """El pie de baja no es opcional: si alguien lo borró del editor, vuelve."""
    if re.search(r"\{\{\s*baja\s*\}\}", plantillas._OPCIONAL.sub("", cuerpo or "")):
        return cuerpo
    return f"{(cuerpo or '').rstrip()}\n\n{plantillas.PIE}"


def _con_cita(seguimiento: str, anterior: str) -> str:
    """
    El segundo toque dice "se lo reenvío": lleva el mensaje anterior citado,
    entre el texto nuevo y el pie, como cuando una persona reenvía un mail.
    """
    marca = "\n--\n"
    original = anterior.split(marca)[0].strip()
    cita = "El mensaje anterior:\n" + "\n".join(f"> {l}" if l else ">" for l in original.split("\n"))
    if marca in seguimiento:
        cabeza, pie = seguimiento.rsplit(marca, 1)
        return f"{cabeza.rstrip()}\n\n{cita}\n\n--\n{pie}"
    return f"{seguimiento}\n\n{cita}"


def _dia_y_fecha(d: date) -> str:
    dias = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
    return f"el {dias[d.weekday()]} {d.day}/{d.month}"


class ProspeccionService:
    def __init__(self, db: Session, *, enviador=None, dominios=None) -> None:
        self.db = db
        self._enviador = enviador
        self._dominios = dominios

    # ── Piezas ──────────────────────────────────────────────────────────────
    def _cliente_de_dominios(self):
        return self._dominios or ResendDominios(api_key())

    def _el_enviador(self):
        if self._enviador is not None:
            return self._enviador
        return EnviadorSimulado() if simula() else EnviadorResend(api_key())

    # ═════════════════════════════════════════════════════════════════════════
    # Casillas
    # ═════════════════════════════════════════════════════════════════════════
    def get_casilla(self, casilla_id: int) -> CasillaProspeccion:
        c = self.db.get(CasillaProspeccion, casilla_id)
        if not c:
            raise NotFoundError("Casilla", casilla_id)
        return c

    def listar_casillas(self) -> list[CasillaProspeccion]:
        return self.db.query(CasillaProspeccion).order_by(CasillaProspeccion.direccion).all()

    def _limpiar_datos(self, nombre_visible, responder_a, limite_dia) -> tuple[str, str | None, int]:
        nombre = re.sub(r'["<>\r\n]', "", nombre_visible or "").strip()
        if not nombre:
            raise BusinessRuleError(
                "casilla_sin_nombre",
                "Poné el nombre que va a ver quien recibe el mail (por ejemplo «Franco de Ubicar Rent»).")
        responder = (responder_a or "").strip().lower() or None
        if responder and not mail_valido(responder):
            raise BusinessRuleError("responder_a_invalido", "El mail para las respuestas no es válido.")
        limite = int(limite_dia or reglas.LIMITE_DIA_POR_DEFECTO)
        if not 1 <= limite <= 200:
            raise BusinessRuleError(
                "limite_invalido", "El límite por día tiene que estar entre 1 y 200.")
        return nombre[:120], responder, limite

    def crear_casilla(
        self, direccion: str, nombre_visible: str, responder_a: str | None = None,
        limite_dia: int | None = None, *, ahora: datetime | None = None,
    ) -> CasillaProspeccion:
        try:
            direccion, _dominio = reglas.analizar_direccion(direccion, raiz())
        except reglas.DireccionInvalida as e:
            raise BusinessRuleError("direccion_invalida", str(e)) from None
        if self.db.query(CasillaProspeccion).filter(CasillaProspeccion.direccion == direccion).first():
            raise ConflictError(f"La casilla {direccion} ya está cargada.")
        nombre, responder, limite = self._limpiar_datos(nombre_visible, responder_a, limite_dia)
        c = CasillaProspeccion(
            direccion=direccion, nombre_visible=nombre, responder_a=responder, limite_dia=limite,
            estado="inactiva", salud_desde=ahora or datetime.utcnow(),
        )
        self.db.add(c)
        self.db.flush()
        self.revisar_casilla(c.id, ahora=ahora)
        return c

    def editar_casilla(self, casilla_id: int, nombre_visible: str, responder_a: str | None,
                       limite_dia: int | None) -> CasillaProspeccion:
        c = self.get_casilla(casilla_id)
        c.nombre_visible, c.responder_a, c.limite_dia = self._limpiar_datos(
            nombre_visible, responder_a, limite_dia)
        self.db.flush()
        return c

    def borrar_casilla(self, casilla_id: int) -> None:
        """Lo que ya mandó queda: cada envío guarda la dirección desde la que salió."""
        self.db.delete(self.get_casilla(casilla_id))
        self.db.flush()

    def estado_del_dominio(self, dominio: str) -> tuple[bool | None, str | None]:
        """
        ¿El subdominio está verificado en Resend? `None` = no se pudo saber.

        Fuera de producción no se consulta nada y se da por bueno: los envíos
        son simulados, así que no hay reputación que cuidar.
        """
        if not settings.is_production and self._dominios is None:
            return True, None
        try:
            for d in self._cliente_de_dominios().listar():
                if d.nombre == dominio:
                    if d.verificado:
                        return True, None
                    return False, (f"El subdominio {dominio} todavía no está verificado en Resend: "
                                   "faltan cargar los registros DNS o que terminen de propagar.")
            return False, f"El subdominio {dominio} todavía no está creado en Resend."
        except SinPermiso as e:
            return None, f"No se pudo comprobar {dominio} en Resend: {e}"
        except ErrorDeResend as e:
            return None, f"No se pudo comprobar {dominio} en Resend: {e}"

    def revisar_casilla(self, casilla_id: int, *, confirmo: bool = False,
                        ahora: datetime | None = None) -> CasillaProspeccion:
        """
        Pone la casilla en el estado que le corresponde según su dominio.

        `confirmo` es el "ya lo verifiqué a mano en Resend": sólo vale cuando el
        sistema **no puede** comprobarlo (API key de sólo-envío). Si Resend dice
        que no está verificado, no hay confirmación que valga.
        """
        c = self.get_casilla(casilla_id)
        ahora = ahora or datetime.utcnow()
        verificado, motivo = self.estado_del_dominio(c.dominio)
        if verificado or (verificado is None and confirmo):
            if c.estado == "inactiva":
                c.estado, c.motivo_estado = "activa", None
                c.salud_desde = ahora
                c.rampa_desde = c.rampa_desde or reglas.a_hora_argentina(ahora).date()
        elif verificado is False or c.estado == "inactiva":
            # Con el dominio caído no manda aunque estuviera activa. Si sólo no
            # se pudo comprobar, una casilla que ya venía mandando sigue.
            c.estado, c.motivo_estado = "inactiva", motivo
        self.db.flush()
        return c

    def pausar_casilla(self, casilla_id: int, motivo: str | None = None) -> CasillaProspeccion:
        c = self.get_casilla(casilla_id)
        if c.estado == "activa":
            c.estado, c.motivo_estado = "pausada", (motivo or MOTIVO_PAUSA_MANUAL)[:255]
        self.db.flush()
        return c

    def reactivar_casilla(self, casilla_id: int, *, ahora: datetime | None = None) -> CasillaProspeccion:
        """
        Vuelve a mandar. **Reinicia `salud_desde`**: el freno automático mira
        desde ahora, así los rebotes que la pausaron no la pausan de nuevo en
        el primer envío.
        """
        c = self.get_casilla(casilla_id)
        ahora = ahora or datetime.utcnow()
        venia_mandando = c.estado == "pausada"
        c.estado, c.motivo_estado, c.salud_desde = "inactiva", None, ahora
        self.db.flush()
        return self.revisar_casilla(c.id, confirmo=venia_mandando, ahora=ahora)

    def evaluar_freno(self, casilla_id: int | None) -> str | None:
        """Mira los últimos envíos de la casilla y la pausa si hace falta."""
        c = self.db.get(CasillaProspeccion, casilla_id) if casilla_id else None
        if c is None or c.estado != "activa":
            return None
        recientes = (
            self.db.query(CampanaEnvio.rebotado_at, CampanaEnvio.rebote_duro, CampanaEnvio.queja_at)
            .filter(CampanaEnvio.casilla_id == c.id, CampanaEnvio.enviado_at.isnot(None),
                    CampanaEnvio.enviado_at >= c.salud_desde)
            .order_by(CampanaEnvio.enviado_at.desc()).limit(reglas.VENTANA_DE_SALUD).all()
        )
        motivo = reglas.evaluar_freno(
            enviados=len(recientes),
            # Un rebote sin clasificar cuenta como duro: mejor frenar de más.
            rebotes_duros=sum(1 for r, duro, _q in recientes if r is not None and duro is not False),
            quejas=sum(1 for _r, _d, q in recientes if q is not None),
        )
        if motivo:
            c.estado, c.motivo_estado = "pausada", motivo
            logger.error("[Prospección] Casilla %s pausada: %s", c.direccion, motivo)
            self.db.flush()
        return motivo

    def enviados_hoy(self, ahora: datetime) -> dict[int, int]:
        filas = (
            self.db.query(CampanaEnvio.casilla_id, func.count())
            .filter(CampanaEnvio.enviado_at >= reglas.inicio_del_dia(ahora),
                    CampanaEnvio.casilla_id.isnot(None))
            .group_by(CampanaEnvio.casilla_id).all()
        )
        return {cid: n for cid, n in filas}

    def cupos(self, ahora: datetime) -> list[reglas.Cupo]:
        usados = self.enviados_hoy(ahora)
        hoy = reglas.a_hora_argentina(ahora).date()
        return [
            reglas.Cupo(c.id, c.direccion, reglas.cupo_del_dia(c.limite_dia, c.rampa_desde, hoy),
                        usados.get(c.id, 0))
            for c in self.db.query(CasillaProspeccion)
            .filter(CasillaProspeccion.estado == "activa").order_by(CasillaProspeccion.direccion).all()
        ]

    def casilla_dict(self, c: CasillaProspeccion, ahora: datetime | None = None) -> dict:
        ahora = ahora or datetime.utcnow()
        hoy = reglas.a_hora_argentina(ahora).date()
        return {
            "id": c.id, "direccion": c.direccion, "dominio": c.dominio,
            "nombre_visible": c.nombre_visible, "responder_a": c.responder_a,
            "limite_dia": c.limite_dia,
            "rampa_desde": c.rampa_desde.isoformat() if c.rampa_desde else None,
            "estado": c.estado, "motivo_estado": c.motivo_estado,
            "cupo_hoy": reglas.cupo_del_dia(c.limite_dia, c.rampa_desde, hoy),
            "enviados_hoy": self.enviados_hoy(ahora).get(c.id, 0),
            "en_rampa": bool(c.rampa_desde and (hoy - c.rampa_desde).days < 14),
        }

    # ── El asistente de dominio ─────────────────────────────────────────────
    def _nombre_completo(self, nombre: str, dominio: str) -> str:
        """Resend da el nombre relativo a la raíz (`send.empresas`); acá, entero."""
        r = raiz()
        if nombre.endswith(r):
            return nombre
        return f"{nombre}.{r}" if nombre else dominio

    def _registro(self, r: RegistroDNS, dominio: str, conocido: bool = True) -> dict:
        return {
            "proposito": r.proposito, "tipo": r.tipo, "nombre": r.nombre,
            "nombre_completo": self._nombre_completo(r.nombre, dominio),
            "valor": r.valor, "prioridad": r.prioridad,
            "estado": r.estado if conocido else "sin_comprobar",
        }

    def _registros_a_mano(self, dominio: str) -> list[dict]:
        """
        Sin poder preguntarle a Resend, lo que se sabe de memoria: el MX y el
        SPF son siempre los mismos; la clave DKIM es propia de cada dominio y
        sólo la muestra el panel de Resend.
        """
        sub = dominio[: -len(raiz()) - 1] if dominio.endswith("." + raiz()) else dominio
        region = settings.prospeccion_resend_region
        return [
            self._registro(RegistroDNS("SPF", "MX", f"send.{sub}",
                                       f"feedback-smtp.{region}.amazonses.com", 10), dominio, False),
            self._registro(RegistroDNS("SPF", "TXT", f"send.{sub}",
                                       "v=spf1 include:amazonses.com ~all"), dominio, False),
            self._registro(RegistroDNS("DKIM", "TXT", f"resend._domainkey.{sub}",
                                       "(lo muestra Resend al crear el dominio: copialo de ahí)"),
                           dominio, False),
        ]

    def _dmarc(self, dominio: str) -> dict:
        reportes = settings.prospeccion_dmarc_reportes.strip() or f"dmarc@{raiz()}"
        return {
            "proposito": "DMARC", "tipo": "TXT", "nombre": f"_dmarc.{dominio[: -len(raiz()) - 1]}",
            "nombre_completo": f"_dmarc.{dominio}",
            "valor": f"v=DMARC1; p=none; rua=mailto:{reportes}", "prioridad": None,
            "estado": "recomendado",
        }

    def _ficha_de_dominio(self, dominio: str, remoto: Dominio | None, modo: str,
                          aviso: str | None) -> dict:
        if remoto is not None:
            estado = remoto.estado
            registros = [self._registro(r, dominio) for r in remoto.registros]
        elif modo == "api":
            estado, registros = "sin_crear", []
        else:
            estado, registros = "sin_comprobar", self._registros_a_mano(dominio)
        return {"dominio": dominio, "estado": estado, "modo": modo, "aviso": aviso,
                "registros": registros, "dmarc": self._dmarc(dominio)}

    def dominios(self) -> dict:
        """
        Lo que muestra la pestaña Casillas: por cada subdominio, el checklist de
        registros DNS con su estado.

        `modo`: `api` (el sistema puede crear y verificar), `manual` (API key de
        sólo-envío o sin key: se muestran los pasos para hacerlo a mano) o
        `simulado` (fuera de producción: no hace falta nada).
        """
        nombres = sorted({c.dominio for c in self.listar_casillas()})
        if not settings.is_production and self._dominios is None:
            return {"raiz": raiz(), "modo": "simulado", "aviso": (
                "Entorno de prueba: los mails no salen de verdad, así que no hace falta "
                "verificar ningún dominio."), "dominios": [
                    {**self._ficha_de_dominio(n, None, "simulado", None), "estado": "verificado",
                     "registros": []} for n in nombres]}
        try:
            cliente = self._cliente_de_dominios()
            remotos = {d.nombre: d for d in cliente.listar()}
            # Además de los subdominios con casilla, los que ya estén creados en
            # Resend bajo la raíz: alguien pudo crear el dominio antes que la casilla.
            for n in remotos:
                if n.endswith("." + raiz()) and n not in nombres:
                    nombres.append(n)
            fichas = []
            for n in sorted(nombres):
                remoto = remotos.get(n)
                if remoto is not None:
                    remoto = cliente.obtener(remoto.id)   # el listado no trae los registros
                fichas.append(self._ficha_de_dominio(n, remoto, "api", None))
            return {"raiz": raiz(), "modo": "api", "aviso": None, "dominios": fichas}
        except SinPermiso as e:
            aviso = (f"{e} Pedile a Gael que cree el subdominio en resend.com/domains y te pase "
                     "los tres registros; cargalos en donde está registrado el dominio y, cuando "
                     "Resend lo muestre en verde, tocá «Ya está verificado» en la casilla.")
        except ErrorDeResend as e:
            aviso = f"{e} Probá de nuevo en un rato."
        return {"raiz": raiz(), "modo": "manual", "aviso": aviso,
                "dominios": [self._ficha_de_dominio(n, None, "manual", None) for n in nombres]}

    def _validar_subdominio(self, nombre: str) -> str:
        nombre = (nombre or "").strip().lower().strip(".")
        try:
            reglas.analizar_direccion(f"x@{nombre}", raiz())
        except reglas.DireccionInvalida as e:
            raise BusinessRuleError("subdominio_invalido", str(e)) from None
        return nombre

    def crear_dominio(self, nombre: str) -> dict:
        """Crea el subdominio en Resend y devuelve los registros DNS a cargar."""
        nombre = self._validar_subdominio(nombre)
        try:
            cliente = self._cliente_de_dominios()
            existente = next((d for d in cliente.listar() if d.nombre == nombre), None)
            remoto = (cliente.obtener(existente.id) if existente
                      else cliente.crear(nombre, settings.prospeccion_resend_region))
        except SinPermiso as e:
            return self._ficha_de_dominio(nombre, None, "manual", str(e))
        except ErrorDeResend as e:
            raise BusinessRuleError("resend_no_responde", str(e)) from None
        return self._ficha_de_dominio(nombre, remoto, "api", None)

    def verificar_dominio(self, nombre: str, *, ahora: datetime | None = None) -> dict:
        """'Verificar ahora': Resend vuelve a mirar el DNS y las casillas se actualizan."""
        nombre = self._validar_subdominio(nombre)
        try:
            cliente = self._cliente_de_dominios()
            existente = next((d for d in cliente.listar() if d.nombre == nombre), None)
            if existente is None:
                raise BusinessRuleError(
                    "dominio_sin_crear", f"{nombre} todavía no está creado en Resend.")
            cliente.verificar(existente.id)
            remoto = cliente.obtener(existente.id)
        except SinPermiso as e:
            return self._ficha_de_dominio(nombre, None, "manual", str(e))
        except ErrorDeResend as e:
            raise BusinessRuleError("resend_no_responde", str(e)) from None
        for c in self.listar_casillas():
            if c.dominio == nombre:
                self.revisar_casilla(c.id, ahora=ahora)
        return self._ficha_de_dominio(nombre, remoto, "api", None)

    # ═════════════════════════════════════════════════════════════════════════
    # Quiénes
    # ═════════════════════════════════════════════════════════════════════════
    def _ocupados(self, ahora: datetime, excepto_campana: int | None = None) -> tuple[set[int], set[int]]:
        """`(recibieron hace poco, están en otra campaña en curso)`."""
        desde = ahora - timedelta(days=reglas.DIAS_ENTRE_CAMPANAS)
        q = self.db.query(CampanaEnvio.prospecto_id).filter(CampanaEnvio.enviado_at >= desde)
        if excepto_campana:
            q = q.filter(CampanaEnvio.campana_id != excepto_campana)
        recientes = {i for (i,) in q.distinct().all()}
        q = (
            self.db.query(CampanaEnvio.prospecto_id)
            .join(CampanaProspecto, CampanaProspecto.id == CampanaEnvio.campana_id)
            .filter(CampanaEnvio.estado.in_(("en_cola", "enviando")),
                    CampanaProspecto.estado.in_(ESTADOS_EN_CURSO))
        )
        if excepto_campana:
            q = q.filter(CampanaEnvio.campana_id != excepto_campana)
        return recientes, {i for (i,) in q.distinct().all()}

    def evaluar(self, prospectos: list[Prospecto], ahora: datetime,
                excepto_campana: int | None = None) -> list[tuple[Prospecto, str | None]]:
        """A quién le sale el mail y a quién no, con el motivo."""
        recientes, en_curso = self._ocupados(ahora, excepto_campana)
        vistos: set[str] = set()
        salida = []
        for p in prospectos:
            mail = (p.email or "").strip().lower()
            motivo = motivo_para_no_mandar_mail(
                ya_cliente=p.es_cliente, no_contactar=p.no_contactar, estado=p.estado, email=p.email,
                recibio_hace_poco=p.id in recientes, en_otra_campana=p.id in en_curso,
                mail_repetido=bool(mail) and mail in vistos,
            )
            if motivo is None:
                vistos.add(mail)
            salida.append((p, motivo))
        return salida

    def _prospectos(self, ids: list[int]) -> list[Prospecto]:
        if not ids:
            return []
        return (self.db.query(Prospecto).filter(Prospecto.id.in_(ids))
                .order_by(Prospecto.score.desc().nullslast(), Prospecto.nombre).all())

    def audiencias(self, *, ahora: datetime | None = None) -> dict:
        """
        Las audiencias de un clic, **con el número ya calculado**: a cuántos les
        saldría un mail hoy, en total, por segmento y por ciudad.
        """
        ahora = ahora or datetime.utcnow()
        evaluados = self.evaluar(
            self.db.query(Prospecto).order_by(Prospecto.score.desc().nullslast(), Prospecto.nombre).all(),
            ahora)
        con_envio = {i for (i,) in self.db.query(CampanaEnvio.prospecto_id)
                     .filter(CampanaEnvio.enviado_at.isnot(None)).distinct().all()}
        aptos = [p for p, m in evaluados if m is None]
        segmentos = Counter(p.segmento or "Sin segmento" for p in aptos)
        ciudades = Counter(p.ciudad for p in aptos if p.ciudad)
        return {
            "todos": len(aptos),
            "nunca_contactados": sum(1 for p in aptos if p.estado == "nuevo" and p.id not in con_envio),
            "segmentos": [{"segmento": s, "cantidad": n} for s, n in segmentos.most_common()],
            "ciudades": [{"ciudad": c, "cantidad": n} for c, n in ciudades.most_common()],
            "no_se_les_escribe": dict(Counter(m for _p, m in evaluados if m)),
        }

    # ═════════════════════════════════════════════════════════════════════════
    # Mensaje
    # ═════════════════════════════════════════════════════════════════════════
    def firma_por_defecto(self, usuario=None) -> dict:
        nombre = settings.prospeccion_firma_nombre.strip()
        if not nombre and usuario is not None:
            nombre = (getattr(usuario, "nombre", "") or "").strip().split(" ")[0]
        return {"nombre": nombre, "telefono": settings.prospeccion_firma_telefono.strip()}

    def valores(self, p: Prospecto | None, firma_nombre: str | None, firma_telefono: str | None) -> dict:
        if p is None:
            return {**plantillas.VALORES_DE_EJEMPLO, "firma_nombre": firma_nombre or "",
                    "firma_telefono": firma_telefono or "", "web": settings.prospeccion_web,
                    "baja": f"{base_publica()}/api/v1/public/baja/prueba"}
        return {
            "empresa": re.sub(r"\s+", " ", p.nombre or "").strip(),
            "ciudad": p.ciudad, "segmento": p.segmento,
            "firma_nombre": firma_nombre, "firma_telefono": firma_telefono,
            "web": settings.prospeccion_web, "baja": url_de_baja(p.id),
        }

    def armar(self, asunto: str, cuerpo: str, valores: dict) -> dict:
        """El mensaje para una empresa, con lo que faltó y los avisos de la compuerta."""
        a = plantillas.renderizar(asunto, valores)
        c = plantillas.renderizar(_con_pie(cuerpo), valores)
        avisos = plantillas.revisar_plantilla(asunto, _con_pie(cuerpo))
        avisos += plantillas.compuerta(a.texto, c.texto, link_baja=valores.get("baja"))
        return {
            "asunto": a.texto, "cuerpo": c.texto,
            "faltantes": list(dict.fromkeys(a.faltantes + c.faltantes)),
            "avisos": [{"grave": x.grave, "texto": x.texto} for x in avisos],
        }

    def _seguimientos_limpios(self, seguimientos: list[dict] | None) -> list[dict]:
        limpios = []
        for s in (seguimientos or [])[:2]:
            cuerpo = (s.get("cuerpo") or "").strip()
            if not cuerpo:
                continue
            dias = int(s.get("dias") or 0)
            if not 1 <= dias <= 60:
                raise BusinessRuleError(
                    "seguimiento_invalido", "Un seguimiento sale entre 1 y 60 días después del primer mail.")
            limpios.append({"dias": dias, "cuerpo": _con_pie(cuerpo)})
        return sorted(limpios, key=lambda s: s["dias"])

    # ═════════════════════════════════════════════════════════════════════════
    # Mandar
    # ═════════════════════════════════════════════════════════════════════════
    def estado_del_envio(self, *, ahora: datetime | None = None) -> dict:
        """¿Se puede mandar ya? Si no, por qué — en palabras para el mostrador."""
        ahora = ahora or datetime.utcnow()
        cupos = self.cupos(ahora)
        motivo = None
        if not cupos:
            hay = self.db.query(CasillaProspeccion).count()
            motivo = ("Todavía no hay ninguna casilla lista para mandar." if not hay else
                      "Las casillas cargadas no están activas: revisalas en la pestaña Casillas.")
        elif settings.is_production and not settings.backend_public_url:
            motivo = ("Falta cargar BACKEND_PUBLIC_URL en el servidor: sin eso el link de baja "
                      "de los mails no funciona.")
        return {
            "listo": motivo is None, "motivo": motivo, "casillas_activas": len(cupos),
            "simulado": simula(), "solo_a": sorted(lista_blanca()),
            "en_horario": reglas.en_ventana(ahora),
        }

    def plan(self, cantidad: int, *, ahora: datetime | None = None) -> dict:
        """«Salen 180 mails desde 2 casillas, ~40 por día: termina el jueves 4/12»."""
        ahora = ahora or datetime.utcnow()
        estado = self.estado_del_envio(ahora=ahora)
        activas = (self.db.query(CasillaProspeccion)
                   .filter(CasillaProspeccion.estado == "activa").all())
        est = reglas.estimar_fin(
            cantidad, [(c.limite_dia, c.rampa_desde) for c in activas], ahora,
            tope_diario=settings.prospeccion_tope_diario,
            usados_hoy=sum(self.enviados_hoy(ahora).values()),
        )
        return {
            **estado, "cantidad": cantidad, "por_dia": est.por_dia, "dias": est.dias,
            "termina": est.termina.isoformat() if est.termina else None,
            "termina_texto": _dia_y_fecha(est.termina) if est.termina else None,
        }

    def calcular(
        self, ids: list[int], *, asunto: str | None, cuerpo: str | None,
        seguimientos: list[dict] | None, firma_nombre: str | None, firma_telefono: str | None,
        indice: int = 0, ahora: datetime | None = None,
    ) -> dict:
        """
        Todo lo que la pantalla "Nueva campaña" necesita saber, en un pedido: a
        cuántos les sale, a cuántos no y por qué, qué plantilla conviene, cómo
        queda el mail para una empresa real de la lista, y cuándo termina.
        """
        ahora = ahora or datetime.utcnow()
        evaluados = self.evaluar(self._prospectos(ids), ahora)
        aptos = [p for p, m in evaluados if m is None]
        segmentos = Counter(p.segmento for p in aptos)
        muestra = None
        if aptos:
            indice = indice % len(aptos)
            p = aptos[indice]
            valores = self.valores(p, firma_nombre, firma_telefono)
            muestra = {
                "indice": indice, "de": len(aptos),
                "prospecto": {"id": p.id, "nombre": p.nombre, "email": p.email,
                              "segmento": p.segmento, "ciudad": p.ciudad, "notas": p.notas},
                **(self.armar(asunto or "", cuerpo or "", valores) if (asunto or cuerpo) else
                   {"asunto": "", "cuerpo": "", "faltantes": [], "avisos": []}),
                "seguimientos": [
                    {"dias": s["dias"], **self.armar(
                        "Re: " + plantillas.renderizar(asunto, valores).texto, s["cuerpo"], valores)}
                    for s in self._seguimientos_limpios(seguimientos)
                ],
            }
        dominante = segmentos.most_common(1)[0][0] if segmentos else None
        return {
            "total": len(evaluados), "salen": len(aptos),
            "no_salen": dict(Counter(m for _p, m in evaluados if m)),
            "segmentos": [{"segmento": s or "Sin segmento", "cantidad": n}
                          for s, n in segmentos.most_common()],
            "plantilla_sugerida": plantillas.sugerir(dict(segmentos)),
            "nombre_sugerido": self.nombre_sugerido(dominante, len(segmentos), ahora),
            "muestra": muestra,
            "plan": self.plan(len(aptos), ahora=ahora),
        }

    @staticmethod
    def nombre_sugerido(segmento: str | None, cuantos_segmentos: int, ahora: datetime) -> str:
        """«Constructoras · 21/11»: nadie tiene que pensar un nombre."""
        local = reglas.a_hora_argentina(ahora)
        if cuantos_segmentos == 1 and segmento:
            que = re.split(r"\s+y\s+|,", segmento)[0].strip()
        else:
            que = "Varios rubros" if cuantos_segmentos > 1 else "Empresas"
        return f"{que} · {local.day}/{local.month}"

    def enviar_prueba(
        self, para: str, *, asunto: str, cuerpo: str, firma_nombre: str | None,
        firma_telefono: str | None, prospecto_id: int | None = None, ahora: datetime | None = None,
    ) -> dict:
        """
        Manda **un** mail, a quien está armando la campaña, tal como le llegaría
        a una empresa de la lista. No cuenta para el cupo ni queda en ninguna
        campaña; el link de baja es de mentira.
        """
        if not mail_valido(para):
            raise BusinessRuleError(
                "prueba_sin_destino", "Tu usuario no tiene un mail válido adonde mandar la prueba.")
        ahora = ahora or datetime.utcnow()
        p = self.db.get(Prospecto, prospecto_id) if prospecto_id else None
        valores = self.valores(p, firma_nombre, firma_telefono)
        # El de la prueba no puede dar de baja a la empresa de la muestra.
        valores["baja"] = f"{base_publica()}/api/v1/public/baja/prueba"
        armado = self.armar(asunto, cuerpo, valores)
        graves = [a["texto"] for a in armado["avisos"] if a["grave"]]
        if graves:
            raise BusinessRuleError("mensaje_con_problemas", " ".join(graves))
        casilla = None
        elegido = reglas.elegir(self.cupos(ahora)) or next(iter(self.cupos(ahora)), None)
        if elegido is not None:
            casilla = self.db.get(CasillaProspeccion, elegido.casilla_id)
        if casilla is None and not simula():
            raise BusinessRuleError(
                "sin_casilla", "Para mandar la prueba hace falta una casilla activa. "
                               "Configurala en la pestaña Casillas.")
        desde = (reglas.formatear_remitente(casilla.nombre_visible, casilla.direccion)
                 if casilla else f"Ubicar Rent <prueba@empresas.{raiz()}>")
        r = self._el_enviador().enviar(MailDeProspeccion(
            desde=desde, para=para.strip().lower(), asunto=armado["asunto"], texto=armado["cuerpo"],
            html=html_minimo(armado["cuerpo"]),
            responder_a=(casilla.responder_a if casilla else None),
        ))
        if not r.ok:
            raise BusinessRuleError("prueba_fallida", f"No se pudo mandar la prueba: {r.error}")
        return {"para": para, "desde": desde, "simulado": r.simulado}

    # ── Campañas ────────────────────────────────────────────────────────────
    def get_campana(self, campana_id: int) -> CampanaProspecto:
        c = self.db.get(CampanaProspecto, campana_id)
        if not c:
            raise NotFoundError("Campaña", campana_id)
        return c

    def crear_campana_rapida(
        self, *, nombre: str, ids: list[int], filtro: dict | None, asunto: str, cuerpo: str,
        seguimientos: list[dict] | None, firma_nombre: str | None, firma_telefono: str | None,
        usuario_id: int | None, enviar: bool, ahora: datetime | None = None,
    ) -> CampanaProspecto:
        """
        La campaña entera en un paso: quiénes, qué mensaje y, si `enviar`, a la
        cola. Con `enviar=False` queda `lista` —mensaje y destinatarios
        guardados— para mandarla después con un clic.
        """
        ahora = ahora or datetime.utcnow()
        nombre = (nombre or "").strip()[:120]
        if not nombre:
            raise BusinessRuleError("campana_sin_nombre", "Ponele un nombre a la campaña.")
        asunto, cuerpo = (asunto or "").strip(), _con_pie((cuerpo or "").strip())
        problemas = [a.texto for a in plantillas.revisar_plantilla(asunto, cuerpo) if a.grave]
        if not asunto:
            problemas.insert(0, "Falta el asunto.")
        limpios = self._seguimientos_limpios(seguimientos)
        for s in limpios:
            problemas += [f"Seguimiento: {a.texto}"
                          for a in plantillas.revisar_plantilla("", s["cuerpo"]) if a.grave]
        if problemas:
            raise BusinessRuleError("mensaje_con_problemas", " ".join(dict.fromkeys(problemas)))
        evaluados = self.evaluar(self._prospectos(ids), ahora)
        if not any(m is None for _p, m in evaluados):
            raise BusinessRuleError(
                "campana_sin_destinatarios", "A ninguna de esas empresas se le puede mandar un mail.")
        campana = CampanaProspecto(
            nombre=nombre, filtro=filtro, creada_por=usuario_id, estado="lista",
            asunto=asunto[:200], cuerpo=cuerpo, seguimientos=limpios or None,
            firma_nombre=(firma_nombre or "").strip()[:80] or None,
            firma_telefono=(firma_telefono or "").strip()[:40] or None,
        )
        self.db.add(campana)
        self.db.flush()
        for p, motivo in evaluados:
            self.db.add(CampanaDestinatario(
                campana_id=campana.id, prospecto_id=p.id,
                estado="omitido" if motivo else "pendiente", motivo=motivo,
            ))
        self.db.flush()
        if enviar:
            self.lanzar(campana.id, ahora=ahora)
        return campana

    def lanzar(self, campana_id: int, *, ahora: datetime | None = None) -> CampanaProspecto:
        """
        Pone la campaña a salir: arma el mail de cada empresa (queda guardado tal
        cual va a salir) y lo deja en la cola. De ahí en más lo lleva el motor.

        Sirve también para las campañas armadas con el camino viejo
        (borrador → mensaje → lista).
        """
        ahora = ahora or datetime.utcnow()
        c = self.get_campana(campana_id)
        if c.estado not in ("borrador", "lista"):
            raise BusinessRuleError("campana_ya_salio", "La campaña ya salió.")
        if not (c.asunto and c.cuerpo):
            raise BusinessRuleError(
                "campana_sin_mensaje", "Falta el mensaje (asunto y cuerpo) antes de enviar.")
        estado = self.estado_del_envio(ahora=ahora)
        if not estado["listo"]:
            raise BusinessRuleError("sin_casilla", estado["motivo"])
        c.cuerpo = _con_pie(c.cuerpo)
        pendientes = (
            self.db.query(CampanaDestinatario)
            .filter(CampanaDestinatario.campana_id == c.id, CampanaDestinatario.estado == "pendiente")
            .all()
        )
        # Se vuelve a evaluar: entre que se armó y que se manda pudo pasar una
        # semana, y alguien pudo darse de baja o entrar en otra campaña.
        por_id = {d.prospecto_id: d for d in pendientes}
        en_cola = 0
        for p, motivo in self.evaluar(self._prospectos(list(por_id)), ahora, excepto_campana=c.id):
            d = por_id[p.id]
            armado = None
            if motivo is None:
                armado = self.armar(c.asunto, c.cuerpo, self.valores(p, c.firma_nombre, c.firma_telefono))
                graves = [a["texto"] for a in armado["avisos"] if a["grave"]]
                motivo = graves[0] if graves else None
            if motivo:
                d.estado, d.motivo = "omitido", motivo[:120]
                continue
            self.db.add(CampanaEnvio(
                campana_id=c.id, prospecto_id=p.id, toque=1, para=p.email.strip().lower(),
                asunto=armado["asunto"][:200], cuerpo=armado["cuerpo"], programado_para=ahora,
                estado="en_cola",
            ))
            en_cola += 1
        if en_cola == 0:
            raise BusinessRuleError(
                "campana_sin_destinatarios", "A ninguna de esas empresas se le puede mandar un mail.")
        c.estado, c.lanzada_at = "enviando", ahora
        self.db.flush()
        return c

    def pausar_campana(self, campana_id: int) -> CampanaProspecto:
        c = self.get_campana(campana_id)
        if c.estado != "enviando":
            raise BusinessRuleError("campana_no_esta_saliendo", "Esa campaña no está saliendo.")
        c.estado = "pausada"
        self.db.flush()
        return c

    def reanudar_campana(self, campana_id: int) -> CampanaProspecto:
        c = self.get_campana(campana_id)
        if c.estado != "pausada":
            raise BusinessRuleError("campana_no_esta_pausada", "Esa campaña no está pausada.")
        c.estado = "enviando"
        self.db.flush()
        return c

    def cancelar_campana(self, campana_id: int) -> CampanaProspecto:
        """Lo que estaba en la cola no sale. Lo que ya salió, salió."""
        c = self.get_campana(campana_id)
        if c.estado in ("terminada", "cancelada"):
            raise BusinessRuleError("campana_ya_cerrada", "Esa campaña ya está cerrada.")
        self.db.query(CampanaEnvio).filter(
            CampanaEnvio.campana_id == c.id, CampanaEnvio.estado.in_(("en_cola", "enviando")),
        ).update({"estado": "cancelado", "motivo": "campaña cancelada"}, synchronize_session=False)
        c.estado = "cancelada"
        self.db.flush()
        return c

    def progreso(self, campana_id: int) -> dict:
        """Los números de una campaña. Cuentan las fechas, no el último estado."""
        E = CampanaEnvio
        fila = self.db.query(
            func.count(E.id).filter(E.estado.in_(("en_cola", "enviando"))),
            func.count(E.enviado_at),
            func.count(E.entregado_at),
            func.count(E.rebotado_at),
            func.count(E.queja_at),
            func.count(func.distinct(E.prospecto_id)).filter(E.respondio_at.isnot(None)),
            func.count(func.distinct(E.prospecto_id)).filter(E.estado == "baja"),
            func.count(func.distinct(E.prospecto_id)).filter(E.enviado_at.isnot(None)),
            func.count(E.id).filter(E.simulado.is_(True)),
            func.count(E.id).filter(E.estado == "error"),
        ).filter(E.campana_id == campana_id).one()
        claves = ("en_cola", "enviados", "entregados", "rebotes", "quejas", "respuestas", "bajas",
                  "empresas_contactadas", "simulados", "errores")
        return dict(zip(claves, (int(v or 0) for v in fila)))

    def envios_de_campana(self, campana_id: int) -> list[dict]:
        filas = (self.db.query(CampanaEnvio).filter(CampanaEnvio.campana_id == campana_id)
                 .order_by(CampanaEnvio.prospecto_id, CampanaEnvio.toque).all())
        return [{
            "id": e.id, "prospecto_id": e.prospecto_id, "empresa": e.prospecto.nombre, "para": e.para,
            "toque": e.toque, "estado": e.estado, "motivo": e.motivo, "desde": e.desde,
            "asunto": e.asunto, "cuerpo": e.cuerpo, "simulado": e.simulado,
            "programado_para": e.programado_para.isoformat() + "Z",
            "enviado_at": e.enviado_at.isoformat() + "Z" if e.enviado_at else None,
        } for e in filas]

    def resumen(self, *, ahora: datetime | None = None) -> dict:
        """La tira de arriba de la pantalla: cuatro números y nada más."""
        ahora = ahora or datetime.utcnow()
        local = reglas.a_hora_argentina(ahora)
        lunes = reglas.inicio_del_dia(ahora) - timedelta(days=local.weekday())
        E = CampanaEnvio
        return {
            "contactables": self.audiencias(ahora=ahora)["todos"],
            "enviados_semana": self.db.query(func.count(E.id)).filter(E.enviado_at >= lunes).scalar() or 0,
            "respuestas": self.db.query(func.count(Prospecto.id))
            .filter(Prospecto.estado == "respondio").scalar() or 0,
            "bajas": self.db.query(func.count(Prospecto.id))
            .filter(Prospecto.no_contactar.is_(True),
                    Prospecto.no_contactar_motivo.in_(MOTIVOS_DE_BAJA_PROPIA)).scalar() or 0,
        }

    # ═════════════════════════════════════════════════════════════════════════
    # El motor
    # ═════════════════════════════════════════════════════════════════════════
    def _soltar_colgados(self, ahora: datetime) -> int:
        limite = ahora - timedelta(minutes=MINUTOS_PARA_SOLTAR)
        return self.db.query(CampanaEnvio).filter(
            CampanaEnvio.estado == "enviando", CampanaEnvio.tomado_at < limite,
        ).update({"estado": "en_cola", "tomado_at": None}, synchronize_session=False)

    def _tomar(self, casilla_id: int, activas: list[int], ahora: datetime) -> CampanaEnvio | None:
        """
        El próximo envío para esa casilla, **ya marcado como `enviando` y
        commiteado**: es lo que impide que dos corridas simultáneas (o un
        reinicio en el medio) manden el mismo mail. En Postgres además se toma
        con `FOR UPDATE SKIP LOCKED`, así la segunda corrida ni lo ve.

        Los seguimientos van primero y por la casilla que mandó el primer mail,
        salvo que esa casilla ya no esté activa.
        """
        E = CampanaEnvio
        q = (
            self.db.query(E)
            .join(CampanaProspecto, CampanaProspecto.id == E.campana_id)
            .filter(E.estado == "en_cola", E.programado_para <= ahora,
                    CampanaProspecto.estado == "enviando",
                    (E.casilla_id.is_(None)) | (E.casilla_id == casilla_id)
                    | (E.casilla_id.notin_(activas)))
            .order_by(E.toque.desc(), E.programado_para, E.id)
        )
        if self.db.get_bind().dialect.name == "postgresql":
            q = q.with_for_update(skip_locked=True, of=E)
        envio = q.first()
        if envio is None:
            return None
        envio.estado, envio.tomado_at = "enviando", ahora
        self.db.commit()
        return envio

    def _no_sale(self, envio: CampanaEnvio) -> tuple[str, str] | None:
        """`(estado, motivo)` si este envío ya no tiene que salir."""
        p = envio.prospecto
        motivo = motivo_para_no_mandar_mail(
            ya_cliente=p.es_cliente, no_contactar=p.no_contactar, estado=p.estado, email=envio.para)
        if motivo:
            # Que haya respondido (aunque lo hayan marcado a mano) corta la
            # secuencia; lo demás es que dejó de ser contactable.
            return ("cancelado" if p.estado == "respondio" else "omitido"), motivo
        if envio.toque > 1:
            anterior = (self.db.query(CampanaEnvio).filter(
                CampanaEnvio.campana_id == envio.campana_id,
                CampanaEnvio.prospecto_id == envio.prospecto_id,
                CampanaEnvio.toque == envio.toque - 1).first())
            if anterior is None or anterior.enviado_at is None or anterior.rebotado_at is not None:
                return "cancelado", "el mail anterior no salió o rebotó"
        return None

    def _programar_seguimiento(self, envio: CampanaEnvio, ahora: datetime) -> bool:
        c = envio.campana
        seguimientos = c.seguimientos or []
        if envio.toque > len(seguimientos):
            return False
        s = seguimientos[envio.toque - 1]
        primero = envio if envio.toque == 1 else (self.db.query(CampanaEnvio).filter(
            CampanaEnvio.campana_id == c.id, CampanaEnvio.prospecto_id == envio.prospecto_id,
            CampanaEnvio.toque == 1).first())
        asunto_original = re.sub(r"^(re:\s*)+", "", (primero or envio).asunto, flags=re.I)
        valores = self.valores(envio.prospecto, c.firma_nombre, c.firma_telefono)
        armado = self.armar(f"Re: {asunto_original}", s["cuerpo"], valores)
        if any(a["grave"] for a in armado["avisos"]):
            return False
        cuerpo = armado["cuerpo"]
        if envio.toque == 1:
            cuerpo = _con_cita(cuerpo, envio.cuerpo)
        cuando = ((primero or envio).enviado_at or ahora) + timedelta(days=int(s["dias"]))
        self.db.add(CampanaEnvio(
            campana_id=c.id, prospecto_id=envio.prospecto_id, toque=envio.toque + 1,
            casilla_id=envio.casilla_id, para=envio.para, asunto=armado["asunto"][:200],
            cuerpo=cuerpo, programado_para=max(cuando, ahora), estado="en_cola",
        ))
        return True

    def _mandar(self, envio: CampanaEnvio, casilla: CasillaProspeccion, ahora: datetime,
                stats: dict) -> bool:
        """Manda un envío ya tomado. Devuelve si **ocupó el turno** de la casilla."""
        no_sale = self._no_sale(envio)
        if no_sale:
            envio.estado, envio.motivo = no_sale
            if envio.toque == 1:
                d = (self.db.query(CampanaDestinatario).filter(
                    CampanaDestinatario.campana_id == envio.campana_id,
                    CampanaDestinatario.prospecto_id == envio.prospecto_id).first())
                if d:
                    d.estado, d.motivo = "omitido", no_sale[1][:120]
            stats["omitidos"] += 1
            return False

        blanca = lista_blanca()
        fuera_de_lista = bool(blanca) and envio.para not in blanca
        # Con lista blanca, a quien no está en ella no le sale nada de verdad.
        enviador = EnviadorSimulado() if fuera_de_lista else self._el_enviador()
        baja = url_de_baja(envio.prospecto_id)
        r = enviador.enviar(MailDeProspeccion(
            desde=reglas.formatear_remitente(casilla.nombre_visible, casilla.direccion),
            para=envio.para, asunto=envio.asunto, texto=envio.cuerpo, html=html_minimo(envio.cuerpo),
            responder_a=casilla.responder_a,
            cabeceras={
                # RFC 8058: el POST a esa URL da de baja sin preguntar nada. El
                # `mailto:` es para los clientes de correo que no hacen el POST.
                "List-Unsubscribe": f"<{baja}>, <mailto:{casilla.responder_a or casilla.direccion}?subject=baja>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            clave_idempotencia=f"ubicar-prospeccion-{envio.id}",
        ))
        envio.intentos += 1
        if not r.ok:
            error = (r.error or "")[:255]
            if re.search(r"not verified|domain", error, re.I) and not r.transitorio:
                # El dominio dejó de estar verificado: no es culpa de este
                # mail. La casilla queda inactiva y el envío vuelve a la cola.
                casilla.estado, casilla.motivo_estado = "inactiva", f"Resend rechazó el envío: {error}"[:255]
                envio.estado, envio.tomado_at = "en_cola", None
            elif r.transitorio and envio.intentos < INTENTOS_MAXIMOS:
                envio.estado, envio.tomado_at, envio.motivo = "en_cola", None, error
                envio.programado_para = ahora + timedelta(minutes=30)
            else:
                envio.estado, envio.motivo = "error", error
            stats["errores"] += 1
            return True

        envio.estado, envio.enviado_at, envio.proveedor_id = "enviado", ahora, r.proveedor_id
        envio.simulado = bool(r.simulado or fuera_de_lista)
        envio.casilla_id, envio.desde, envio.motivo = casilla.id, casilla.direccion, None
        casilla.proximo_envio_at = ahora + timedelta(
            seconds=random.randint(reglas.ESPACIADO_MIN_S, reglas.ESPACIADO_MAX_S))
        p = envio.prospecto
        if p.estado == "nuevo":
            p.estado = "contactado"
        if envio.toque == 1:
            d = (self.db.query(CampanaDestinatario).filter(
                CampanaDestinatario.campana_id == envio.campana_id,
                CampanaDestinatario.prospecto_id == envio.prospecto_id).first())
            if d:
                d.estado, d.enviado_at = "enviado", ahora
        if self._programar_seguimiento(envio, ahora):
            stats["seguimientos_programados"] += 1
        stats["enviados"] += 1
        return True

    def _cerrar_terminadas(self) -> int:
        """Una campaña sin nada en la cola (ni seguimientos por salir) terminó."""
        n = 0
        for c in self.db.query(CampanaProspecto).filter(CampanaProspecto.estado == "enviando").all():
            quedan = self.db.query(CampanaEnvio.id).filter(
                CampanaEnvio.campana_id == c.id,
                CampanaEnvio.estado.in_(("en_cola", "enviando"))).first()
            if quedan is None:
                c.estado = "terminada"
                n += 1
        return n

    def despachar(self, *, ahora: datetime | None = None) -> dict:
        """
        Una vuelta del motor. **Commitea sola** (la llama el scheduler, no un
        request) y es segura de correr dos veces a la vez.

        Manda como mucho **un mail por casilla por vuelta**, y sólo de las
        casillas a las que ya les tocó (`proximo_envio_at`): el goteo y el
        espaciado aleatorio salen de ahí. Fuera del horario, sin casillas o sin
        cupo no hace nada: la cola espera, no se descarta ni falla.
        """
        ahora = ahora or datetime.utcnow()
        stats = {"enviados": 0, "omitidos": 0, "errores": 0, "seguimientos_programados": 0,
                 "terminadas": 0, "motivo": None}
        self._soltar_colgados(ahora)
        self.db.commit()
        if not reglas.en_ventana(ahora):
            stats["motivo"] = "fuera de horario"
            return stats
        cupos = self.cupos(ahora)
        if not cupos:
            stats["motivo"] = "sin casillas activas"
            return stats
        resto = settings.prospeccion_tope_diario - sum(c.usados for c in cupos)
        activas = [c.casilla_id for c in cupos]
        for cupo in sorted(cupos, key=lambda c: (c.usados, c.direccion)):
            if resto <= 0:
                stats["motivo"] = "se llegó al tope del día"
                break
            if cupo.libres <= 0:
                continue
            casilla = self.db.get(CasillaProspeccion, cupo.casilla_id)
            if casilla.proximo_envio_at and casilla.proximo_envio_at > ahora:
                continue
            for _ in range(SALTEOS_POR_VUELTA):
                envio = self._tomar(casilla.id, activas, ahora)
                if envio is None:
                    break
                antes = stats["enviados"]
                try:
                    ocupo = self._mandar(envio, casilla, ahora, stats)
                    self.db.commit()
                except Exception:
                    # Un mail que revienta no frena a los demás: queda con error
                    # a la vista y la vuelta sigue.
                    self.db.rollback()
                    logger.exception("[Prospección] Falló el envío %s", envio.id)
                    self.db.query(CampanaEnvio).filter(CampanaEnvio.id == envio.id).update(
                        {"estado": "error", "motivo": "error interno al enviar"},
                        synchronize_session=False)
                    self.db.commit()
                    stats["errores"] += 1
                    break
                if ocupo:
                    resto -= stats["enviados"] - antes
                    break
        stats["terminadas"] = self._cerrar_terminadas()
        self.db.commit()
        return stats

    # ═════════════════════════════════════════════════════════════════════════
    # Lo que vuelve
    # ═════════════════════════════════════════════════════════════════════════
    def _cancelar_cola(self, prospecto_id: int, motivo: str) -> int:
        return self.db.query(CampanaEnvio).filter(
            CampanaEnvio.prospecto_id == prospecto_id,
            CampanaEnvio.estado.in_(("en_cola", "enviando")),
        ).update({"estado": "cancelado", "motivo": motivo}, synchronize_session=False)

    def _ultimo_enviado(self, prospecto_id: int) -> CampanaEnvio | None:
        return (self.db.query(CampanaEnvio)
                .filter(CampanaEnvio.prospecto_id == prospecto_id, CampanaEnvio.enviado_at.isnot(None))
                .order_by(CampanaEnvio.enviado_at.desc(), CampanaEnvio.id.desc()).first())

    def dar_de_baja(self, prospecto_id: int, motivo: str = "baja") -> bool:
        """
        **Para siempre.** Marca `no_contactar`, cancela lo que estuviera en la
        cola y deja anotado en qué mail se dio de baja. Devuelve `False` si ya
        lo estaba (dos clics, o Gmail y la persona a la vez).
        """
        p = self.db.get(Prospecto, prospecto_id)
        if p is None:
            return False
        nueva = not p.no_contactar
        if nueva:
            p.no_contactar, p.no_contactar_motivo, p.estado = True, motivo[:120], "no_contactar"
            if motivo in ("baja", "pidió la baja por mail"):
                ultimo = self._ultimo_enviado(p.id)
                if ultimo is not None and ultimo.estado in ("enviado", "entregado", "respondio"):
                    ultimo.estado = "baja"
        self._cancelar_cola(p.id, "se dio de baja" if "baja" in motivo else motivo)
        self.db.flush()
        return nueva

    def marcar_respondio(self, prospecto_id: int, *, ahora: datetime | None = None) -> bool:
        """Respondió: se cortan los seguimientos. A partir de acá le contesta una persona."""
        p = self.db.get(Prospecto, prospecto_id)
        if p is None or p.no_contactar:
            return False
        ahora = ahora or datetime.utcnow()
        if p.estado in ("nuevo", "contactado"):
            p.estado = "respondio"
        ultimo = self._ultimo_enviado(p.id)
        if ultimo is not None and ultimo.respondio_at is None:
            ultimo.respondio_at = ahora
            if ultimo.estado in ("enviado", "entregado"):
                ultimo.estado = "respondio"
        self._cancelar_cola(p.id, "la empresa respondió")
        self.db.flush()
        return True

    def registrar_evento(self, tipo: str, datos: dict, *, ahora: datetime | None = None,
                         traer_recibido=None) -> str:
        """
        Un evento del webhook de Resend. **Idempotente**: Resend reintenta, y el
        mismo evento dos veces no cambia nada la segunda.

        Devuelve qué pasó (`entregado`, `rebote`, `queja`, `respuesta`,
        `repetido`, `ajeno`, `ignorado`): el webhook es de toda la cuenta, así
        que también llegan los eventos de los mails a clientes, que no son de
        acá (`ajeno`).
        """
        ahora = ahora or datetime.utcnow()
        datos = datos or {}
        if tipo == "email.received":
            return self._registrar_respuesta(datos, ahora, traer_recibido)
        if tipo not in ("email.delivered", "email.bounced", "email.complained"):
            return "ignorado"
        email_id = str(datos.get("email_id") or "")
        envio = (self.db.query(CampanaEnvio).filter(CampanaEnvio.proveedor_id == email_id).first()
                 if email_id else None)
        if envio is None:
            return "ajeno"

        if tipo == "email.delivered":
            if envio.entregado_at is not None:
                return "repetido"
            envio.entregado_at = ahora
            if envio.estado == "enviado":
                envio.estado = "entregado"
            self.db.flush()
            return "entregado"

        if tipo == "email.bounced":
            if envio.rebotado_at is not None:
                return "repetido"
            rebote = datos.get("bounce") if isinstance(datos.get("bounce"), dict) else {}
            clase = str(rebote.get("type") or "").lower()
            # Sólo es blando si Resend lo dice: ante la duda, duro (casilla
            # llena se reintenta sola; dirección inexistente no vuelve nunca).
            envio.rebotado_at, envio.rebote_duro = ahora, clase not in ("transient", "temporary", "soft")
            envio.estado = "rebotado"
            envio.motivo = str(rebote.get("message") or "rebotó")[:255]
            if envio.rebote_duro:
                self.dar_de_baja(envio.prospecto_id, "rebote")
            else:
                self._cancelar_cola(envio.prospecto_id, "el mail anterior rebotó")
            self.db.flush()
            self.evaluar_freno(envio.casilla_id)
            return "rebote"

        if envio.queja_at is not None:
            return "repetido"
        envio.queja_at, envio.estado = ahora, "queja"
        self.dar_de_baja(envio.prospecto_id, "queja de spam")
        self.db.flush()
        self.evaluar_freno(envio.casilla_id)
        return "queja"

    def _registrar_respuesta(self, datos: dict, ahora: datetime, traer_recibido) -> str:
        """
        `email.received`: alguien contestó a una casilla que recibe por Resend.
        Se asocia por la dirección de quien escribe. El webhook no trae el
        cuerpo: si se puede pedir (`traer_recibido`), además se detecta el
        "no me escriban más".
        """
        m = re.search(r"[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}", str(datos.get("from") or ""))
        remitente = m.group(0).lower() if m else ""
        if not remitente:
            return "ignorado"
        envio = (self.db.query(CampanaEnvio)
                 .filter(CampanaEnvio.para == remitente, CampanaEnvio.enviado_at.isnot(None))
                 .order_by(CampanaEnvio.enviado_at.desc()).first())
        if envio is None:
            return "ajeno"
        contenido: dict = {}
        if traer_recibido is not None and datos.get("email_id"):
            try:
                contenido = traer_recibido(str(datos["email_id"])) or {}
            except Exception:
                logger.warning("[Prospección] No se pudo leer la respuesta %s", datos.get("email_id"))
        if reglas.es_respuesta_automatica(str(datos.get("subject") or ""), contenido.get("headers")):
            return "ignorado"
        if envio.respondio_at is not None:
            return "repetido"
        texto = str(contenido.get("text") or re.sub(r"<[^>]+>", " ", str(contenido.get("html") or "")))
        self.marcar_respondio(envio.prospecto_id, ahora=ahora)
        if reglas.pide_la_baja(texto):
            self.dar_de_baja(envio.prospecto_id, "pidió la baja por mail")
        return "respuesta"


#: Los `no_contactar` que salieron de una campaña nuestra (los demás vienen
#: marcados desde el buscador de Gael y no son "bajas").
MOTIVOS_DE_BAJA_PROPIA = ("baja", "pidió la baja por mail", "queja de spam", "rebote")


def correr_motor() -> dict:
    """El job del scheduler y del cron externo: una vuelta, con su propia sesión."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        return ProspeccionService(db).despachar()
    finally:
        db.close()
