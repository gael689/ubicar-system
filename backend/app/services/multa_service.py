"""
MultaService — lógica de gestión de multas/infracciones.
El flujo principal: buscar quién tenía el auto en la fecha/hora de la infracción,
luego crear la multa vinculada al cliente y alquiler responsable.

Ledger: imputar una multa a un cliente genera un débito automático en su
cuenta corriente (mismo mecanismo que alquiler/pago/echeq). Resolverla
("cobrada" o "bonificada") genera el crédito o el contra-asiento
correspondiente — ver CuentaCorrienteService.
"""
from datetime import date, time, datetime
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.models.alquiler import Alquiler
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.cliente import Cliente
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.pago import Pago
from app.repositories.multa_repo import MultaRepo
from app.schemas.multa import MultaCreate, MultaUpdate, BusquedaMultaResponse
from app.services.cuenta_corriente_service import CuentaCorrienteService


class MultaService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = MultaRepo(db)

    def buscar_responsable(
        self,
        patente: str,
        fecha_infraccion: date,
        hora_infraccion: time | None = None,
    ) -> BusquedaMultaResponse:
        """
        Dado patente + fecha (+ hora opcional), cruza con el historial de alquileres
        para encontrar quién tenía el vehículo en ese momento.
        """
        vehiculo = (
            self.db.query(Vehiculo)
            .filter(Vehiculo.patente.ilike(patente.strip()))
            .first()
        )

        if not vehiculo:
            return BusquedaMultaResponse(
                encontrado=False,
                patente=patente.upper(),
                fecha_infraccion=fecha_infraccion,
                hora_infraccion=hora_infraccion,
            )

        # Busca alquileres del vehículo que cubran la fecha de infracción
        alquileres = (
            self.db.query(Alquiler)
            .join(Reserva, Alquiler.reserva_id == Reserva.id)
            .filter(
                Reserva.vehiculo_id == vehiculo.id,
                Reserva.fecha_inicio <= fecha_infraccion,
                Reserva.fecha_fin >= fecha_infraccion,
            )
            .order_by(Alquiler.id.desc())
            .all()
        )

        if not alquileres:
            return BusquedaMultaResponse(
                encontrado=False,
                patente=patente.upper(),
                fecha_infraccion=fecha_infraccion,
                hora_infraccion=hora_infraccion,
            )

        # Toma el alquiler más relevante (el más reciente que cubra la fecha)
        alquiler = alquileres[0]
        reserva = alquiler.reserva
        cliente = self.db.query(Cliente).filter(Cliente.id == reserva.cliente_id).first()
        # Conductor != pagador: si la reserva tenía un conductor designado
        # (típico en empresas), es quien realmente manejaba.
        conductor = reserva.conductor if reserva.conductor_id else None

        return BusquedaMultaResponse(
            encontrado=True,
            patente=patente.upper(),
            fecha_infraccion=fecha_infraccion,
            hora_infraccion=hora_infraccion,
            alquiler_id=alquiler.id,
            cliente_id=cliente.id if cliente else None,
            cliente_nombre=cliente.nombre_completo if cliente else None,
            cliente_dni=cliente.dni_cuit if cliente else None,
            conductor_nombre=conductor.nombre_completo if conductor else None,
            conductor_dni=conductor.dni if conductor else None,
            contrato_numero=reserva.id,
            fecha_checkout=alquiler.checkout_fecha,
            fecha_checkin=alquiler.checkin_fecha,
        )

    def crear(self, payload: MultaCreate):
        data = payload.model_dump(exclude_none=False)
        # Normaliza patente
        data["patente"] = data["patente"].upper().strip()
        return self.repo.create(data)

    def get(self, id: int):
        multa = self.repo.get(id)
        if not multa:
            raise NotFoundError("Multa", id)
        return multa

    def list(self, **kwargs):
        return self.repo.list(**kwargs)

    def actualizar(self, id: int, payload: MultaUpdate, usuario_id: int | None = None):
        multa = self.get(id)
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        estado_anterior = multa.estado
        multa = self.repo.update(multa, data)

        # Imputar (asignarle un responsable) genera el débito en su cuenta
        # corriente — sólo la primera vez que pasa a este estado.
        if data.get("estado") == "imputada" and estado_anterior != "imputada":
            cliente_id = data.get("cliente_id") or multa.cliente_id
            if not cliente_id:
                raise BusinessRuleError(
                    "multa_sin_cliente",
                    "No se puede imputar una multa sin un cliente responsable",
                )
            multa.fecha_imputada = datetime.utcnow()
            CuentaCorrienteService(self.db).registrar_movimiento(
                cliente_id=cliente_id,
                tipo="debito",
                concepto=f"Multa #{multa.id} — {multa.patente} ({multa.fecha_infraccion})",
                monto=multa.monto,
                fecha=date.today(),
                creado_por=usuario_id,
                alquiler_id=multa.alquiler_id,
                multa_id=multa.id,
            )

        return multa

    def _ya_tiene_credito(self, multa_id: int) -> bool:
        """
        ¿Esta multa ya se cobró?

        **La guarda que impide cobrarla dos veces.** El cobro suelto de Caja
        (`POST /pagos`) sigue existiendo para lo que no cuelga de ninguna multa,
        pero nada impedía que alguien cobrara la multa por ahí **y además** la
        resolviera como "cobrada": dos créditos por la misma plata, y desde este
        commit también dos pagos en la caja. Ver `PLAN_DINERO.md` §1.4.

        Es el mismo filtro que la rama bonificada ya usaba para encontrar el
        débito, con el tipo dado vuelta.
        """
        return (
            self.db.query(MovimientoCuentaCorriente.id)
            .filter(
                MovimientoCuentaCorriente.multa_id == multa_id,
                MovimientoCuentaCorriente.tipo == "credito",
                MovimientoCuentaCorriente.anulado == False,
            )
            .first()
            is not None
        )

    def resolver(
        self,
        id: int,
        decision: str,
        motivo: str | None,
        usuario_id: int | None,
        medio_pago: str = "efectivo",
        fecha_cobro: date | None = None,
    ):
        """
        Resuelve una multa imputada: "cobrada" (el cliente la pagó) o
        "bonificada" (se le perdona — anula el débito con un contra-asiento,
        motivo obligatorio).

        **Cobrarla hace las dos cosas en un solo acto**: crea el `Pago` —que es
        lo que la hace entrar a la caja del día, con su medio de pago— y el
        crédito que cancela el débito. Es el patrón de `ReciboService.crear`
        (`recibo_service.py:127-164`): el operador no tiene que acordarse de
        hacer dos cosas, que es exactamente cómo se terminaba cobrando dos
        veces o ninguna.

        Antes sólo asentaba el crédito. La deuda del cliente bajaba y esa plata
        **no aparecía en la caja de ningún día** — el arqueo del mostrador no
        cerraba y nadie sabía por qué.
        """
        multa = self.get(id)
        if multa.estado != "imputada":
            raise BusinessRuleError(
                "multa_no_imputada",
                f"Sólo se puede resolver una multa imputada (estado actual: {multa.estado})",
            )
        if not multa.cliente_id:
            raise BusinessRuleError("multa_sin_cliente", "La multa no tiene cliente responsable")

        cc_service = CuentaCorrienteService(self.db)

        if decision == "cobrada":
            if self._ya_tiene_credito(multa.id):
                raise BusinessRuleError(
                    "multa_ya_cobrada",
                    f"La multa #{multa.id} ya tiene un cobro registrado en la cuenta "
                    "corriente del cliente. Si el cobro anterior fue un error, anulalo "
                    "primero — no se cobra dos veces.",
                )
            fecha = fecha_cobro or date.today()
            pago = Pago(
                cliente_id=multa.cliente_id,
                alquiler_id=multa.alquiler_id,
                monto=multa.monto,
                medio_pago=medio_pago,
                con_factura=False,
                cobrado_por=usuario_id,
                fecha=fecha,
                notas=f"Multa #{multa.id} — {multa.patente} ({multa.fecha_infraccion})",
            )
            self.db.add(pago)
            self.db.flush()  # asegurar pago.id antes de enlazarlo al movimiento

            cc_service.registrar_movimiento(
                cliente_id=multa.cliente_id,
                tipo="credito",
                concepto=f"Multa #{multa.id} cobrada — {multa.patente} ({medio_pago})",
                monto=multa.monto,
                fecha=fecha,
                creado_por=usuario_id,
                alquiler_id=multa.alquiler_id,
                multa_id=multa.id,
                pago_id=pago.id,
            )
        elif decision == "bonificada":
            if not motivo or not motivo.strip():
                raise BusinessRuleError("motivo_requerido", "Bonificar una multa requiere un motivo")
            debito = (
                self.db.query(MovimientoCuentaCorriente)
                .filter(
                    MovimientoCuentaCorriente.multa_id == id,
                    MovimientoCuentaCorriente.tipo == "debito",
                    MovimientoCuentaCorriente.anulado == False,
                )
                .first()
            )
            if debito:
                cc_service.anular_movimiento(debito.id, motivo=motivo, creado_por=usuario_id)
            multa.motivo_bonificacion = motivo
        else:
            raise BusinessRuleError("decision_invalida", f"Decisión inválida: {decision!r}")

        multa.estado = decision
        multa.resuelto_por = usuario_id
        multa.resuelto_en = datetime.utcnow()
        self.db.flush()
        return multa

    def eliminar(self, id: int) -> None:
        multa = self.get(id)
        self.repo.deactivate(multa)
