from __future__ import annotations
"""
Service de disponibilidad por cupo (Fase 6, ítem 60).

Traduce entre la base y el motor puro de `domain/disponibilidad.py`: carga la
flota, las reservas, los bloqueos y los holds, los normaliza a
`OcupacionCategoria` y devuelve el cupo por categoría, ya con el precio del
motor de precios.

**La web no calcula nada por su cuenta**: precio y disponibilidad salen de
acá, que son los mismos endpoints que consume el sistema interno.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.disponibilidad import (
    CupoCategoria,
    OcupacionCategoria,
    VehiculoDisponible,
    calcular_cupos,
)
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.categoria import Categoria
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services.precio_service import PrecioService

# Estados de reserva que ocupan una unidad. Mismos que domain/solapamientos
# más "pendiente": todavía no está confirmada, pero alguien la está esperando
# y venderla dos veces es el problema que estamos evitando.
ESTADOS_QUE_OCUPAN = ("pendiente", "confirmada", "activa", "vencida")


class DisponibilidadService:
    def __init__(self, db: Session):
        self.db = db

    def _cargar_flota(self) -> list[VehiculoDisponible]:
        vehiculos = (
            self.db.query(Vehiculo)
            .filter(Vehiculo.activo.is_(True))
            .all()
        )
        return [VehiculoDisponible(id=v.id, categoria_id=v.categoria_id) for v in vehiculos]

    def _cargar_ocupaciones(self, desde: date, hasta: date) -> list[OcupacionCategoria]:
        """
        Todo lo que ocupa una unidad en el rango, normalizado.

        Se traen los tres orígenes en consultas acotadas por fecha en vez de
        recorrer la flota entera: el costo es el de las reservas del período,
        no el del histórico.
        """
        ocupaciones: list[OcupacionCategoria] = []

        reservas = (
            self.db.query(Reserva)
            .filter(
                Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
                Reserva.fecha_inicio <= hasta,
                Reserva.fecha_fin >= desde,
            )
            .all()
        )
        for r in reservas:
            ocupaciones.append(OcupacionCategoria(
                inicio=datetime.combine(r.fecha_inicio, r.hora_inicio),
                fin=datetime.combine(r.fecha_fin, r.hora_fin),
                categoria_id=r.categoria_id,
                vehiculo_id=r.vehiculo_id,
                origen="reserva",
            ))

        bloqueos = (
            self.db.query(BloqueoVehiculo)
            .filter(
                BloqueoVehiculo.activo.is_(True),
                BloqueoVehiculo.fecha_desde <= hasta,
                BloqueoVehiculo.fecha_hasta >= desde,
            )
            .all()
        )
        for b in bloqueos:
            ocupaciones.append(OcupacionCategoria(
                # Rango inclusivo → termina a las 00:00 del día siguiente,
                # igual que en ReservaService._cargar_ventanas_bloqueos.
                inicio=datetime.combine(b.fecha_desde, time.min),
                fin=datetime.combine(b.fecha_hasta + timedelta(days=1), time.min),
                vehiculo_id=b.vehiculo_id,
                origen="bloqueo",
            ))

        # Holds: todavía no existe la tabla (ítem 61). Cuando entre, se suman
        # acá con `origen="hold"` filtrando `expira_en > now()` — el motor de
        # cupo ya los contempla, no hay que tocarlo.

        return ocupaciones

    def consultar(
        self,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        solo_web: bool = True,
    ) -> list[dict]:
        """
        Cupo y precio por categoría para el rango pedido.

        Devuelve **todas** las categorías publicables, con o sin cupo: las que
        no tienen se muestran deshabilitadas en la web, no se ocultan — eso
        convierte, y evita que el cliente crea que no trabajamos el segmento.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)

        q = self.db.query(Categoria).filter(Categoria.activo.is_(True))
        if solo_web:
            q = q.filter(Categoria.visible_web.is_(True))
        categorias = q.order_by(Categoria.orden, Categoria.nombre).all()

        flota = self._cargar_flota()
        ocupaciones = self._cargar_ocupaciones(fecha_inicio, fecha_fin)
        cupos = {
            c.categoria_id: c
            for c in calcular_cupos(
                inicio_dt, fin_dt, flota, ocupaciones,
                categoria_ids=[c.id for c in categorias],
            )
        }

        precio_service = PrecioService(self.db)
        resultado = []
        for cat in categorias:
            cupo: CupoCategoria = cupos[cat.id]

            # El precio se cotiza siempre, aunque no haya cupo: la web muestra
            # "desde $X" también en las categorías agotadas, que es lo que
            # invita a probar otra fecha en vez de irse.
            precio = None
            try:
                cotizacion, _ = precio_service.calcular(
                    fecha_inicio=fecha_inicio,
                    fecha_fin=fecha_fin,
                    categoria_id=cat.id,
                    canal="web",
                )
                precio = {
                    "total": cotizacion.total,
                    "precio_dia_promedio": cotizacion.precio_dia_promedio,
                    "dias": cotizacion.duracion_dias,
                    "total_referencia": cotizacion.total_referencia,
                    "tiene_promocion": cotizacion.tiene_promocion,
                    "promociones": cotizacion.promociones,
                    "desglose": [
                        {"fecha": d.fecha, "precio": d.precio,
                         "es_promocional": d.es_promocional}
                        for d in cotizacion.dias
                    ],
                }
            except Exception:
                # Sin precio configurado la categoría no se puede vender, pero
                # tampoco puede romper la consulta entera de las demás.
                precio = None

            resultado.append({
                "categoria_id": cat.id,
                "codigo": cat.codigo,
                "nombre": cat.nombre,
                "descripcion": cat.descripcion,
                "ejemplo_modelos": cat.ejemplo_modelos,
                "foto_key": cat.foto_key,
                "pasajeros": cat.pasajeros,
                "valijas": cat.valijas,
                "transmision": cat.transmision,
                "aire_acondicionado": cat.aire_acondicionado,
                "disponibles": cupo.disponibles,
                "hay_cupo": cupo.hay_cupo and precio is not None,
                "ultima_unidad": cupo.ultima_unidad,
                "precio": precio,
            })
        return resultado

    def vehiculos_libres(
        self, categoria_id: int, fecha_inicio: date, hora_inicio: time,
        fecha_fin: date, hora_fin: time,
    ) -> list[int]:
        """
        Qué autos concretos de la categoría están libres en el rango.

        Es lo que necesita la bandeja de reservas web para **sugerir** qué
        vehículo asignar al aceptar una reserva que vino sin auto.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)
        cupos = calcular_cupos(
            inicio_dt, fin_dt,
            self._cargar_flota(),
            self._cargar_ocupaciones(fecha_inicio, fecha_fin),
            categoria_ids=[categoria_id],
        )
        return cupos[0].vehiculos_libres if cupos else []
