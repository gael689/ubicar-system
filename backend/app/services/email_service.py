"""
EmailService — el único lugar por el que sale un mail del sistema.

Antes había tres caminos paralelos hacia `enviar_email` (el digest, los avisos
de reserva web y el contrato firmado), cada uno con su criterio, y ninguno
dejaba constancia: si el cliente decía "no me llegó", la respuesta honesta era
"no sé". Este service es la vía única, y hace tres cosas que ninguno de los
tres hacía:

1. **Registra todo intento** en `emails_enviados` — a quién, cuándo, con qué
   asunto y con qué resultado. Lo mira el panel de Notificaciones.
2. **Nunca levanta.** Un mail que falla no puede tumbar la operación que lo
   disparó: el check-out tiene que completarse aunque Resend esté caído. El
   envío queda `fallido` con el error, y se puede reintentar desde el panel.
3. **Frena los mails a clientes mientras el remitente sea el de prueba.**

Sobre lo tercero, que es lo menos obvio. Hoy `FROM_EMAIL=onboarding@resend.dev`,
el remitente compartido de prueba de Resend: **sólo entrega a la casilla dueña
de la cuenta**. Un mail a un cliente real no llega — pero tampoco "falla" de
una forma que alguien vaya a mirar. Mandarlo igual crearía la peor de las
situaciones: el sistema diciendo "enviado" y el cliente sin nada. Así que
mientras el remitente sea de `@resend.dev`, los mails a clientes se registran
como `omitido`, con el motivo escrito, y el panel lo muestra arriba de todo.
Los mails internos (al equipo) sí se intentan: la casilla del equipo puede muy
bien ser la de la cuenta, y si no lo es queda `fallido` con el error de Resend,
que es información y no silencio.

El día que el dominio esté verificado, cambiar `FROM_EMAIL` alcanza: no hay
ninguna otra bandera que tocar.
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.email_enviado import EmailEnviado
from app.services import email_plantillas
from app.services.notificaciones import enviar_email

logger = logging.getLogger(__name__)

# Los tipos de mail que existen. El panel los agrupa por acá, así que agregar
# uno nuevo sin sumarlo a esta tabla lo deja sin nombre en la interfaz.
TIPOS: dict[str, str] = {
    "reserva_confirmada": "Reserva confirmada",
    "checkout": "Retiro del vehículo",
    "checkin": "Devolución",
    "oferta": "Oferta o descuento",
    "contrato_firmado": "Contrato firmado",
    "reserva_web_equipo": "Aviso interno — reserva web",
    "contrato_firmado_equipo": "Aviso interno — contrato firmado",
    "digest": "Resumen diario de notificaciones",
}

# Cuáles van al cliente. Son los únicos que se frenan con el remitente de
# prueba: al equipo se le manda igual (ver el docstring del módulo).
TIPOS_AL_CLIENTE = frozenset(
    {"reserva_confirmada", "checkout", "checkin", "oferta", "contrato_firmado"}
)

MOTIVO_REMITENTE_PRUEBA = (
    "No se envió: el remitente configurado ({}) es el de prueba de Resend, que "
    "sólo entrega a la casilla dueña de la cuenta. Verificá el dominio propio y "
    "cambiá FROM_EMAIL para que los mails lleguen a los clientes."
)


class EmailService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Estado de la integración ─────────────────────────────────────────

    @property
    def remitente_de_prueba(self) -> bool:
        """¿El `from` es el de prueba de Resend? Es lo que decide si los mails
        a clientes salen o se omiten."""
        return (settings.from_email or "").strip().lower().endswith("@resend.dev")

    @property
    def configurado(self) -> bool:
        return bool(settings.resend_api_key)

    def estado(self) -> dict:
        """Lo que el panel necesita para explicar por qué un mail no salió,
        sin que nadie tenga que entrar al servidor a mirar variables."""
        return {
            "remitente": settings.from_email,
            "remitente_de_prueba": self.remitente_de_prueba,
            "configurado": self.configurado,
            "destinatarios_equipo": self._destinatarios_equipo(),
            "tipos": TIPOS,
        }

    def _destinatarios_equipo(self) -> list[str]:
        from app.services.email_reservas import destinatarios_equipo

        try:
            return destinatarios_equipo(self.db)
        except Exception:
            logger.exception("[Email] no se pudieron leer los destinatarios del equipo")
            return []

    def _empresa(self) -> dict:
        """Los datos de la empresa para el pie del mail. Si la configuración no
        se puede leer, el mail sale igual con el nombre por defecto: un pie
        incompleto es mucho menos grave que no mandar la confirmación."""
        try:
            from app.services.contrato_service import ContratoService

            return ContratoService(self.db).datos_empresa()
        except Exception:
            logger.exception("[Email] no se pudieron leer los datos de la empresa")
            return {}

    # ── El envío, registrado ─────────────────────────────────────────────

    def registrar_y_enviar(
        self,
        tipo: str,
        destinatario: str | None,
        asunto: str,
        html: str,
        entidad_tipo: str | None = None,
        entidad_id: int | None = None,
        adjuntos: list[tuple[str, bytes]] | None = None,
        automatico: bool = True,
        usuario_id: int | None = None,
        forzar: bool = False,
    ) -> EmailEnviado | None:
        """
        Manda un mail y deja el registro. **Nunca levanta.**

        Devuelve la fila creada, o `None` si no había a quién escribirle — sin
        destinatario no hay nada que registrar, y una fila con el campo vacío
        sólo ensuciaría el panel.

        `forzar=True` saltea la guarda del remitente de prueba. Existe para un
        solo caso: probar de verdad contra la casilla de la cuenta. La interfaz
        que lo ofrece tiene que decir que el mail probablemente no llegue.
        """
        if not (destinatario or "").strip():
            logger.info("[Email] '%s' sin destinatario: no se manda", tipo)
            return None

        registro = EmailEnviado(
            tipo=tipo,
            destinatario=destinatario.strip(),
            remitente=settings.from_email,
            asunto=asunto[:255],
            cuerpo_html=html,
            entidad_tipo=entidad_tipo,
            entidad_id=entidad_id,
            con_adjunto=bool(adjuntos),
            automatico=automatico,
            enviado_por=usuario_id,
            intentos=1,
        )

        if tipo in TIPOS_AL_CLIENTE and self.remitente_de_prueba and not forzar:
            registro.estado = "omitido"
            registro.motivo = MOTIVO_REMITENTE_PRUEBA.format(settings.from_email)
        else:
            try:
                resultado = enviar_email(registro.destinatario, asunto, html, adjuntos=adjuntos)
                registro.estado = "enviado" if resultado.ok else "fallido"
                registro.motivo = resultado.error
                registro.proveedor_id = resultado.proveedor_id
            except Exception as e:  # defensa extra: enviar_email ya atrapa todo
                logger.exception("[Email] error inesperado mandando '%s'", tipo)
                registro.estado = "fallido"
                registro.motivo = f"{type(e).__name__}: {e}"[:500]

        self.db.add(registro)
        self.db.flush()
        return registro

    # ── Los cuatro envíos del flujo ──────────────────────────────────────

    def enviar_reserva_confirmada(
        self, reserva, pago_web=None, usuario_id: int | None = None, forzar: bool = False
    ) -> EmailEnviado | None:
        """
        El comprobante de la reserva, con el PDF adjunto.

        **No se manda si la reserva no está confirmada.** Decirle "tu reserva
        está confirmada" a alguien a quien todavía no le podemos dar un auto es
        peor que no escribirle: cuando lo llamen a explicarle, ya va a tener un
        mail que dice lo contrario.
        """
        if reserva.estado != "confirmada":
            logger.info(
                "[Email] reserva #%s en estado '%s': no se manda la confirmación",
                reserva.id, reserva.estado,
            )
            return None

        asunto, html = email_plantillas.reserva_confirmada(
            reserva, empresa=self._empresa(), pago_web=pago_web
        )
        return self.registrar_y_enviar(
            tipo="reserva_confirmada",
            destinatario=email_plantillas.email_del_cliente(reserva),
            asunto=asunto,
            html=html,
            entidad_tipo="reserva",
            entidad_id=reserva.id,
            adjuntos=self._pdf_reserva(reserva),
            automatico=usuario_id is None,
            usuario_id=usuario_id,
            forzar=forzar,
        )

    def enviar_checkout(
        self, alquiler, usuario_id: int | None = None, forzar: bool = False
    ) -> EmailEnviado | None:
        asunto, html = email_plantillas.checkout(alquiler, empresa=self._empresa())
        return self.registrar_y_enviar(
            tipo="checkout",
            destinatario=email_plantillas.email_del_cliente(alquiler.reserva),
            asunto=asunto,
            html=html,
            entidad_tipo="alquiler",
            entidad_id=alquiler.id,
            automatico=usuario_id is None,
            usuario_id=usuario_id,
            forzar=forzar,
        )

    def enviar_checkin(
        self, alquiler, usuario_id: int | None = None, forzar: bool = False
    ) -> EmailEnviado | None:
        asunto, html = email_plantillas.checkin(alquiler, empresa=self._empresa())
        return self.registrar_y_enviar(
            tipo="checkin",
            destinatario=email_plantillas.email_del_cliente(alquiler.reserva),
            asunto=asunto,
            html=html,
            entidad_tipo="alquiler",
            entidad_id=alquiler.id,
            automatico=usuario_id is None,
            usuario_id=usuario_id,
            forzar=forzar,
        )

    def enviar_oferta(
        self,
        destinatarios: list[str],
        titulo: str,
        cuerpo: str,
        usuario_id: int | None = None,
        forzar: bool = False,
    ) -> list[EmailEnviado]:
        """
        El único envío que no dispara ningún flujo: lo escribe una persona.

        **Uno por destinatario, no un `to` con toda la lista.** Con la lista
        completa en el `to`, cada cliente ve el mail de todos los demás — y
        además no se puede saber a quién le llegó y a quién no, que es la mitad
        del motivo por el que este registro existe.
        """
        if not (titulo or "").strip():
            raise BusinessRuleError("asunto_requerido", "El asunto no puede estar vacío")
        if not (cuerpo or "").strip():
            raise BusinessRuleError("cuerpo_requerido", "El mensaje no puede estar vacío")

        limpios = [d.strip() for d in destinatarios if (d or "").strip()]
        # Sin duplicados y conservando el orden: la misma persona en dos listas
        # no tiene que recibir la promoción dos veces.
        unicos = list(dict.fromkeys(limpios))
        if not unicos:
            raise BusinessRuleError("sin_destinatarios", "No hay ningún destinatario para enviar")

        empresa = self._empresa()
        enviados: list[EmailEnviado] = []
        for destino in unicos:
            asunto, html = email_plantillas.oferta(titulo, cuerpo, empresa=empresa)
            registro = self.registrar_y_enviar(
                tipo="oferta",
                destinatario=destino,
                asunto=asunto,
                html=html,
                automatico=False,
                usuario_id=usuario_id,
                forzar=forzar,
            )
            if registro is not None:
                enviados.append(registro)
        return enviados

    # ── Disparadores post-commit ─────────────────────────────────────────

    @staticmethod
    def avisar(db: Session, evento: str, entidad) -> None:
        """
        El disparador que usan los routers **después del commit**.

        Va acá y no adentro de los services (`AlquilerService`, `ReservaService`)
        por una razón concreta: esos corren dentro de la transacción, y un mail
        mandado ahí sale igual aunque la transacción termine rolleada. El
        cliente recibiría la constancia de una entrega que no ocurrió. Después
        del commit el hecho es un hecho, y recién ahí se avisa.

        **No levanta nunca y hace su propio commit**, porque el de la operación
        ya pasó: si el registro del mail no se puede guardar, se descarta y la
        operación queda intacta.

        `evento` es uno de `checkout`, `checkin`, `reserva_confirmada`.
        """
        try:
            svc = EmailService(db)
            if evento == "checkout":
                svc.enviar_checkout(entidad)
            elif evento == "checkin":
                svc.enviar_checkin(entidad)
            elif evento == "reserva_confirmada":
                svc.enviar_reserva_confirmada(entidad)
            else:
                raise ValueError(f"Evento de mail desconocido: {evento}")
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "[Email] falló el aviso '%s' de la entidad #%s",
                evento, getattr(entidad, "id", "?"),
            )

    # ── Reintento ────────────────────────────────────────────────────────

    def reintentar(self, id: int, usuario_id: int | None = None, forzar: bool = False) -> EmailEnviado:
        """
        Vuelve a intentar un envío que no salió.

        **Reusa el cuerpo guardado en vez de rearmarlo.** Rearmar la plantilla
        mandaría los datos de hoy, y el cliente recibiría un mail distinto del
        que se le quiso mandar — con los cargos ya editados, por ejemplo. Lo
        que se reintenta es el mismo mail, no uno nuevo. El adjunto sí se
        regenera (no se guarda), y si no se puede, el mail sale sin él antes
        que no salir.
        """
        registro = self.db.get(EmailEnviado, id)
        if registro is None:
            raise NotFoundError("Email", id)
        if registro.estado == "enviado":
            raise BusinessRuleError(
                "ya_enviado", "Este mail ya se envió correctamente. No hace falta reintentarlo."
            )

        adjuntos = self._adjuntos_de(registro)
        registro.remitente = settings.from_email
        registro.intentos += 1
        registro.ultimo_intento_at = datetime.utcnow()
        if registro.enviado_por is None:
            registro.enviado_por = usuario_id

        if registro.tipo in TIPOS_AL_CLIENTE and self.remitente_de_prueba and not forzar:
            registro.estado = "omitido"
            registro.motivo = MOTIVO_REMITENTE_PRUEBA.format(settings.from_email)
        else:
            resultado = enviar_email(
                registro.destinatario, registro.asunto, registro.cuerpo_html or "", adjuntos=adjuntos
            )
            registro.estado = "enviado" if resultado.ok else "fallido"
            registro.motivo = resultado.error
            registro.proveedor_id = resultado.proveedor_id

        self.db.flush()
        return registro

    # ── Consulta ─────────────────────────────────────────────────────────

    def list(
        self,
        page: int = 1,
        page_size: int = 30,
        tipo: str | None = None,
        estado: str | None = None,
        destinatario: str | None = None,
    ) -> tuple[list[EmailEnviado], int]:
        q = self.db.query(EmailEnviado)
        if tipo:
            q = q.filter(EmailEnviado.tipo.in_([t.strip() for t in tipo.split(",") if t.strip()]))
        if estado:
            q = q.filter(EmailEnviado.estado.in_([e.strip() for e in estado.split(",") if e.strip()]))
        if destinatario:
            q = q.filter(EmailEnviado.destinatario.ilike(f"%{destinatario.strip()}%"))
        total = q.count()
        items = (
            q.order_by(EmailEnviado.created_at.desc(), EmailEnviado.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    def get(self, id: int) -> EmailEnviado:
        registro = self.db.get(EmailEnviado, id)
        if registro is None:
            raise NotFoundError("Email", id)
        return registro

    def destinatarios_de_clientes(self, solo_con_alquileres: bool = True) -> list[dict]:
        """
        La lista para el envío de ofertas: clientes con casilla cargada.

        `solo_con_alquileres=True` deja afuera a los que nunca alquilaron. Una
        promoción a alguien que sólo pidió un presupuesto hace dos años es la
        clase de mail que hace que la próxima caiga en spam.
        """
        from app.models.alquiler import Alquiler
        from app.models.cliente import Cliente
        from app.models.reserva import Reserva

        q = self.db.query(Cliente).filter(
            Cliente.email.isnot(None), Cliente.email != "", Cliente.activo.is_(True)
        )
        if solo_con_alquileres:
            q = q.filter(
                Cliente.id.in_(
                    self.db.query(Reserva.cliente_id).join(Alquiler, Alquiler.reserva_id == Reserva.id)
                )
            )
        return [
            {"id": c.id, "nombre": c.nombre_completo, "email": c.email}
            for c in q.order_by(Cliente.nombre_completo).all()
        ]

    # ── Adjuntos ─────────────────────────────────────────────────────────

    def _pdf_reserva(self, reserva) -> list[tuple[str, bytes]] | None:
        """El PDF de la reserva. Si no se puede generar, el mail sale igual sin
        adjunto: la confirmación con los datos en el cuerpo ya sirve, y el PDF
        se puede volver a pedir desde el sistema en cualquier momento."""
        try:
            from app.services.reserva_pdf import generar_pdf_reserva

            contenido = generar_pdf_reserva(
                reserva,
                cliente=reserva.cliente,
                vehiculo=reserva.vehiculo,
                conductor=getattr(reserva, "conductor", None),
            )
            return [(f"reserva_{reserva.id:05d}.pdf", contenido)]
        except Exception:
            logger.exception("[Email] no se pudo generar el PDF de la reserva #%s", reserva.id)
            return None

    def _adjuntos_de(self, registro: EmailEnviado) -> list[tuple[str, bytes]] | None:
        """Regenera el adjunto de un mail que se está reintentando."""
        if not registro.con_adjunto:
            return None
        if registro.tipo == "reserva_confirmada" and registro.entidad_id:
            from app.models.reserva import Reserva

            reserva = self.db.get(Reserva, registro.entidad_id)
            return self._pdf_reserva(reserva) if reserva else None
        if registro.tipo == "contrato_firmado" and registro.entidad_id:
            try:
                from app.services.contrato_service import ContratoService

                svc = ContratoService(self.db)
                contrato = svc.get(registro.entidad_id)
                return [
                    (f"contrato_{contrato.numero_formateado}.pdf", svc.generar_pdf(contrato.id))
                ]
            except Exception:
                logger.exception("[Email] no se pudo regenerar el PDF del contrato")
                return None
        return None
