"""
DanioService — parte de daños del vehículo (Fase 4, ítems 52-53).

Dos ideas centrales:

1. **El daño le pertenece al vehículo, no al alquiler.** Por eso los daños no
   reparados sobreviven al cierre del alquiler y se precargan como
   "preexistentes" en el próximo check-out (`preexistentes_de()`). Eso es lo
   que evita imputarle a un cliente un rayón que ya estaba.

2. **Detectar ≠ cobrar.** Registrar un daño no mueve plata. Recién
   `imputar()` genera el débito en la cuenta corriente del cliente, y
   `bonificar()` lo revierte con un contra-asiento — mismo patrón que multas.
   Consistente con "el sistema informa, la persona decide".
"""
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.models.alquiler import Alquiler
from app.models.danio import Danio, FotoDanio
from app.services.cuenta_corriente_service import CuentaCorrienteService


# Estados en los que el daño sigue "vivo" sobre el vehículo — son los que se
# precargan en el próximo check-out. Un daño reparado ya no se arrastra.
ESTADOS_VIGENTES = ("detectado", "valorizado", "imputado", "bonificado")


class DanioService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.cc_service = CuentaCorrienteService(db)

    # ── Lectura ──────────────────────────────────────────────────────────────

    def get(self, danio_id: int) -> Danio:
        danio = (
            self.db.query(Danio)
            .options(joinedload(Danio.fotos))
            .filter(Danio.id == danio_id)
            .first()
        )
        if not danio:
            raise NotFoundError("danio_no_encontrado", f"Daño {danio_id} no encontrado")
        return danio

    def listar(
        self,
        *,
        vehiculo_id: int | None = None,
        alquiler_id: int | None = None,
        cliente_id: int | None = None,
        estado: str | None = None,
        incluir_inactivos: bool = False,
    ) -> list[Danio]:
        q = self.db.query(Danio).options(joinedload(Danio.fotos))
        if not incluir_inactivos:
            q = q.filter(Danio.activo.is_(True))
        if vehiculo_id:
            q = q.filter(Danio.vehiculo_id == vehiculo_id)
        if alquiler_id:
            q = q.filter(Danio.alquiler_id == alquiler_id)
        if cliente_id:
            q = q.filter(Danio.cliente_id == cliente_id)
        if estado:
            q = q.filter(Danio.estado == estado)
        return q.order_by(Danio.fecha_deteccion.desc(), Danio.id.desc()).all()

    def preexistentes_de(self, vehiculo_id: int) -> list[Danio]:
        """
        Daños vigentes del vehículo — los que hay que mostrarle al operador
        antes de entregarlo, para que sepa qué ya estaba.
        """
        return (
            self.db.query(Danio)
            .options(joinedload(Danio.fotos))
            .filter(
                Danio.vehiculo_id == vehiculo_id,
                Danio.activo.is_(True),
                Danio.estado.in_(ESTADOS_VIGENTES),
            )
            .order_by(Danio.fecha_deteccion.desc())
            .all()
        )

    # ── Escritura ────────────────────────────────────────────────────────────

    def registrar(self, data, usuario_id: int | None) -> Danio:
        # Si el daño viene de un alquiler y no se indicó cliente, se hereda el
        # de la reserva — pero eso NO significa que sea su responsabilidad:
        # `responsable` arranca en "sin_definir" y lo decide una persona.
        cliente_id = data.cliente_id
        if cliente_id is None and data.alquiler_id:
            alquiler = self.db.get(Alquiler, data.alquiler_id)
            if alquiler and alquiler.reserva:
                cliente_id = alquiler.reserva.cliente_id

        danio = Danio(
            vehiculo_id=data.vehiculo_id,
            alquiler_id=data.alquiler_id,
            cliente_id=cliente_id,
            momento=data.momento,
            zona=data.zona,
            tipo=data.tipo,
            severidad=data.severidad,
            descripcion=data.descripcion,
            fecha_deteccion=data.fecha_deteccion or date.today(),
            costo_estimado=data.costo_estimado,
            responsable=data.responsable,
            estado="valorizado" if data.costo_estimado else "detectado",
            registrado_por=usuario_id,
        )
        self.db.add(danio)
        self.db.flush()
        return danio

    def actualizar(self, danio_id: int, data) -> Danio:
        danio = self.get(danio_id)
        cambios = data.model_dump(exclude_none=True)
        for campo, valor in cambios.items():
            setattr(danio, campo, valor)
        # Cargar un costo sobre un daño recién detectado lo pasa a valorizado
        # solo, sin que haya que tocar el estado a mano.
        if danio.costo_estimado and danio.estado == "detectado":
            danio.estado = "valorizado"
        self.db.flush()
        return danio

    def dar_de_baja(self, danio_id: int) -> Danio:
        """Baja lógica — nunca se borra (regla de oro del proyecto)."""
        danio = self.get(danio_id)
        if danio.estado == "imputado":
            raise BusinessRuleError(
                "danio_imputado",
                "No se puede dar de baja un daño ya imputado. Bonificalo primero "
                "(revierte el débito de la cuenta corriente con un contra-asiento).",
            )
        danio.activo = False
        self.db.flush()
        return danio

    # ── Valorización contra la garantía (ítem 53) ────────────────────────────

    def imputar(
        self,
        danio_id: int,
        monto: Decimal,
        usuario_id: int | None,
        cliente_id: int | None = None,
        concepto: str | None = None,
    ) -> Danio:
        """
        Le cobra el daño al cliente: genera el débito en su cuenta corriente.
        El monto puede ser menor al costo estimado (acuerdo comercial).
        """
        danio = self.get(danio_id)
        if danio.estado == "imputado":
            raise BusinessRuleError("danio_ya_imputado", "El daño ya fue imputado al cliente")
        if danio.estado == "reparado":
            raise BusinessRuleError(
                "danio_reparado", "El daño ya figura como reparado — no se puede imputar"
            )

        destinatario = cliente_id or danio.cliente_id
        if not destinatario:
            raise BusinessRuleError(
                "danio_sin_cliente",
                "El daño no tiene cliente asociado. Indicá a quién imputárselo.",
            )

        patente = danio.vehiculo.patente if danio.vehiculo else danio.vehiculo_id
        mov = self.cc_service.registrar_movimiento(
            cliente_id=destinatario,
            tipo="debito",
            concepto=concepto or f"Daño en {danio.zona} — {patente}",
            monto=Decimal(str(monto)),
            fecha=date.today(),
            creado_por=usuario_id,
            alquiler_id=danio.alquiler_id,
            danio_id=danio.id,
        )

        danio.cliente_id = destinatario
        danio.monto_imputado = Decimal(str(monto))
        danio.movimiento_cc_id = mov.id
        danio.responsable = "cliente"
        danio.estado = "imputado"
        self.db.flush()
        return danio

    def bonificar(self, danio_id: int, motivo: str, usuario_id: int | None) -> Danio:
        """
        Se le perdona el daño al cliente. Si ya estaba imputado, el débito se
        revierte con un contra-asiento (nunca se edita el asiento original).
        """
        danio = self.get(danio_id)
        if danio.estado == "bonificado":
            raise BusinessRuleError("danio_ya_bonificado", "El daño ya está bonificado")

        if danio.movimiento_cc_id:
            self.cc_service.anular_movimiento(
                danio.movimiento_cc_id,
                motivo=f"Daño bonificado — {motivo}",
                creado_por=usuario_id,
            )
            danio.movimiento_cc_id = None

        danio.monto_imputado = None
        danio.motivo_bonificacion = motivo
        danio.estado = "bonificado"
        self.db.flush()
        return danio

    # ── Fotos ────────────────────────────────────────────────────────────────

    def agregar_foto(
        self, danio_id: int, archivo_key: str, descripcion: str | None, usuario_id: int | None
    ) -> FotoDanio:
        self.get(danio_id)  # valida que exista
        foto = FotoDanio(
            danio_id=danio_id,
            archivo_key=archivo_key,
            descripcion=descripcion,
            subida_por=usuario_id,
        )
        self.db.add(foto)
        self.db.flush()
        return foto

    def get_foto(self, foto_id: int) -> FotoDanio:
        foto = self.db.get(FotoDanio, foto_id)
        if not foto:
            raise NotFoundError("foto_no_encontrada", f"Foto {foto_id} no encontrada")
        return foto
