"""
Service de Gastos del vehículo.

Regla específica: cuando el gasto es tipo='service' y trae km_al_momento, el
vehículo se actualiza:
- km_actual = max(km_actual, km_al_momento)
- km_proximo_service = km_al_momento + vehiculo.km_entre_services

Doc F1 sección B1.6: gastos en F1 son borrado físico (no entidad auditada).
"""
from datetime import date, datetime
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.gasto import Gasto
from app.services import auditoria_service
from app.models.vehiculo import Vehiculo
from app.repositories.gasto_repo import GastoRepository
from app.repositories.vehiculo_repo import VehiculoRepository
from app.schemas.gasto import GastoCreate, GastoUpdate


class GastoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = GastoRepository(db)
        self.vehiculo_repo = VehiculoRepository(db)

    def list(
        self,
        vehiculo_id: int,
        *,
        tipo: str | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Gasto], int]:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)
        return self.repo.list_by_vehiculo(
            vehiculo_id,
            tipo=tipo, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
            skip=(page - 1) * page_size, limit=page_size,
        )

    def get(self, gasto_id: int) -> Gasto:
        gasto = self.repo.get(gasto_id)
        if gasto is None:
            raise NotFoundError("Gasto", gasto_id)
        return gasto

    def create_for_vehiculo(self, vehiculo_id: int, payload: GastoCreate) -> Gasto:
        vehiculo = self.vehiculo_repo.get(vehiculo_id)
        if vehiculo is None:
            raise NotFoundError("Vehículo", vehiculo_id)

        gasto = Gasto(
            vehiculo_id=vehiculo_id,
            tipo=payload.tipo,
            descripcion=payload.descripcion,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            fecha=payload.fecha,
            proveedor=payload.proveedor,
            km_al_momento=payload.km_al_momento,
            notas=payload.notas,
        )
        self.repo.create(gasto)
        self._apply_service_side_effects(vehiculo, gasto)
        self.db.commit()
        self.db.refresh(gasto)
        return gasto

    def update(self, gasto_id: int, payload: GastoUpdate, usuario_id: int | None = None) -> Gasto:
        """
        Edita un gasto, **dejando rastro**.

        Antes se editaba libremente y sin auditoría: monto y fecha incluidos.
        Los gastos son la mitad de "cuánto se gasta en la flota"
        (`/reportes/flota`) y desde la Fase 2.5 entran también en el efectivo
        del cajón. Un número que se puede reescribir hacia atrás sin rastro no
        sirve para decidir nada — ver `PLAN_DINERO.md` §3.3b.

        Se audita **sólo si cambió algo que mueve plata**. Corregirle una falta
        de ortografía a la descripción no es un hecho que haya que registrar, y
        llenar el libro de auditoría con eso es la forma más rápida de que nadie
        lo mire.
        """
        gasto = self.get(gasto_id)
        cambios = payload.model_dump(exclude_unset=True)

        CAMPOS_QUE_MUEVEN_PLATA = ("monto", "fecha", "medio_pago", "tipo")
        antes = {
            campo: getattr(gasto, campo)
            for campo in CAMPOS_QUE_MUEVEN_PLATA
            if campo in cambios and getattr(gasto, campo) != cambios[campo]
        }

        for field, value in cambios.items():
            setattr(gasto, field, value)

        if antes:
            auditoria_service.registrar(
                self.db,
                usuario_id=usuario_id,
                accion="editar",
                entidad_tipo="gasto",
                entidad_id=gasto.id,
                descripcion=(
                    f"Editó el gasto #{gasto.id} ({gasto.descripcion}): "
                    + ", ".join(f"{c} {antes[c]} → {cambios[c]}" for c in antes)
                ),
                datos_antes=antes,
                datos_despues={c: cambios[c] for c in antes},
                monto=gasto.monto,
            )

        # Si quedó como service con km, re-evaluar (idempotente).
        if gasto.tipo == "service" and gasto.km_al_momento:
            vehiculo = self.vehiculo_repo.get(gasto.vehiculo_id)
            if vehiculo is not None:
                self._apply_service_side_effects(vehiculo, gasto)

        self.db.commit()
        self.db.refresh(gasto)
        return gasto

    def anular(self, gasto_id: int, motivo: str, usuario_id: int | None = None) -> Gasto:
        """
        Da de baja un gasto. **No lo borra.**

        Era el otro borrado físico que quedaba, justificado con "gastos no son
        entidad auditada en F1". Eso dejó de ser cierto: son la mitad del
        reporte de flota y ahora también restan del efectivo del cajón. Borrar
        uno cambiaba los dos números hacia atrás sin dejar nada.
        """
        if not motivo or not motivo.strip():
            raise ValueError("Dar de baja un gasto requiere un motivo")

        gasto = self.get(gasto_id)
        if gasto.anulado:
            raise ValueError("El gasto ya está dado de baja")

        gasto.anulado = True
        gasto.motivo_anulacion = motivo.strip()
        gasto.anulado_por = usuario_id
        gasto.anulado_en = datetime.utcnow()

        auditoria_service.registrar(
            self.db,
            usuario_id=usuario_id,
            accion="anular",
            entidad_tipo="gasto",
            entidad_id=gasto.id,
            descripcion=(
                f"Dio de baja el gasto #{gasto.id} de ${gasto.monto} "
                f"({gasto.tipo}, {gasto.fecha}). Motivo: {motivo}"
            ),
            datos_antes={"monto": gasto.monto, "tipo": gasto.tipo, "fecha": gasto.fecha},
            datos_despues={"anulado": True, "motivo": motivo},
            monto=gasto.monto,
        )

        self.db.commit()
        self.db.refresh(gasto)
        return gasto

    @staticmethod
    def _apply_service_side_effects(vehiculo: Vehiculo, gasto: Gasto) -> None:
        if gasto.tipo != "service" or not gasto.km_al_momento:
            return
        if gasto.km_al_momento > vehiculo.km_actual:
            vehiculo.km_actual = gasto.km_al_momento
        vehiculo.km_proximo_service = gasto.km_al_momento + vehiculo.km_entre_services
