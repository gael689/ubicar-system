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
from app.domain.recargo_edad import vista_con_recargo_incluido
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.hold import Hold
from app.models.categoria import Categoria
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services.precio_service import PrecioService

# Estados de reserva que ocupan una unidad. Mismos que domain/solapamientos
# más "pendiente": todavía no está confirmada, pero alguien la está esperando
# y venderla dos veces es el problema que estamos evitando.
# Los tres estados web de la migración 047 quedan AFUERA a propósito:
# `pendiente_pago` ya ocupa vía su hold (contarlo también sería descontar el
# cupo dos veces), y `sin_disponibilidad` / `revision_sin_cupo` son solicitudes
# sin cupo asignado — si ocuparan, una solicitud que no se pudo cumplir
# bloquearía un auto que sí está libre.
ESTADOS_QUE_OCUPAN = ("pendiente", "confirmada", "activa", "vencida")


def _url_publica(key: str | None) -> str | None:
    """
    La URL desde la que el navegador puede leer un archivo.

    Vive acá y no en el router porque es la misma cuenta que hace falta en
    cualquier respuesta que exponga un archivo: quien consume la API no tiene
    por qué saber si los archivos están en disco o en un bucket.
    """
    if not key:
        return None
    from app.core.deps import get_storage

    try:
        return get_storage().public_url(key)
    except Exception:
        # Un storage mal configurado no puede tumbar la consulta de
        # disponibilidad, que es lo que la web necesita para vender.
        return None


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

    def _cargar_ocupaciones(
        self, desde: date, hasta: date, excluir_hold_token: str | None = None
    ) -> list[OcupacionCategoria]:
        """
        Todo lo que ocupa una unidad en el rango, normalizado.

        Se traen los tres orígenes en consultas acotadas por fecha en vez de
        recorrer la flota entera: el costo es el de las reservas del período,
        no el del histórico.

        `excluir_hold_token` saca un hold del cálculo. Lo usa el webhook de
        Mercado Pago al re-verificar el cupo: en ese momento el hold del propio
        cliente **sigue vigente** (se consume después), así que contarlo lo
        haría competir contra sí mismo. Sin esto, toda venta web de la última
        unidad cae a revisión manual — justo el caso que más importa.
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

        # Holds vigentes (ítem 61). **El filtro por `expira_en` es lo que hace
        # que un hold abandonado deje de ocupar sin que corra ningún job**: la
        # expiración se evalúa acá, en el mismo instante de la consulta.
        q_holds = self.db.query(Hold).filter(
            Hold.estado == "vigente",
            Hold.expira_en > datetime.utcnow(),
            Hold.fecha_inicio <= hasta,
            Hold.fecha_fin >= desde,
        )
        if excluir_hold_token:
            q_holds = q_holds.filter(Hold.token != excluir_hold_token)
        holds = q_holds.all()
        for h in holds:
            ocupaciones.append(OcupacionCategoria(
                inicio=datetime.combine(h.fecha_inicio, h.hora_inicio),
                fin=datetime.combine(h.fecha_fin, h.hora_fin),
                categoria_id=h.categoria_id,
                origen="hold",
            ))

        return ocupaciones

    def consultar(
        self,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        solo_web: bool = True,
        categoria_ids: list[int] | None = None,
        excluir_hold_token: str | None = None,
        edad_conductor: int | None = None,
    ) -> list[dict]:
        """
        Cupo y precio por categoría para el rango pedido.

        Devuelve **todas** las categorías publicables, con o sin cupo: las que
        no tienen se muestran deshabilitadas en la web, no se ocultan — eso
        convierte, y evita que el cliente crea que no trabajamos el segmento.

        `edad_conductor` hace que **el precio salga con el recargo por edad ya
        incluido desde esta primera pantalla**. Antes el recargo aparecía
        recién en el paso 3, cuando se pedían los datos: el cliente elegía una
        categoría con un precio y en el paso siguiente veía otro. Un precio que
        se mueve después de mostrado es la peor forma de perder una reserva, y
        además obligaba a rotular el aumento para justificarlo.

        Es la edad **declarada** en el buscador, no derivada de una fecha de
        nacimiento: en la portada todavía no hay cliente, y pedir un documento
        de identidad para ver una lista de precios espanta a cualquiera. La
        exacta se calcula en el paso 3, cuando se carga la fecha real.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)

        q = self.db.query(Categoria).filter(Categoria.activo.is_(True))
        if solo_web:
            q = q.filter(Categoria.visible_web.is_(True))
        if categoria_ids:
            # Lo usa HoldService, que sólo necesita el cupo de la categoría
            # que se está por tomar.
            q = q.filter(Categoria.id.in_(categoria_ids))
        categorias = q.order_by(Categoria.orden, Categoria.nombre).all()

        flota = self._cargar_flota()
        ocupaciones = self._cargar_ocupaciones(fecha_inicio, fecha_fin, excluir_hold_token)
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
                    edad_conductor=edad_conductor,
                )
                # `total` ya trae el recargo adentro; el promedio por día y el
                # precio de referencia, no. Ver `vista_con_recargo_incluido`.
                promedio, referencia = vista_con_recargo_incluido(
                    cotizacion.precio_dia_promedio,
                    cotizacion.total_referencia,
                    cotizacion.recargo_edad,
                    cotizacion.duracion_dias,
                )
                # El mismo alquiler cotizado como si pagara el 100% por
                # adelantado. Es lo que la tarjeta muestra como precio grande,
                # con el de lista tachado al lado: los **dos números son
                # reales** —el tachado es lo que efectivamente paga quien seña
                # parcialmente—, así que el tachado no es un ancla inventada.
                pago_total = None
                try:
                    c100, _ = precio_service.calcular(
                        fecha_inicio=fecha_inicio,
                        fecha_fin=fecha_fin,
                        categoria_id=cat.id,
                        canal="web",
                        edad_conductor=edad_conductor,
                        porcentaje_anticipo=100,
                    )
                    if c100.descuento_monto and c100.total < cotizacion.total:
                        pago_total = {
                            "total": c100.total,
                            "precio_dia_promedio": vista_con_recargo_incluido(
                                c100.precio_dia_promedio, None,
                                c100.recargo_edad, c100.duracion_dias,
                            )[0],
                            "descuento_monto": c100.descuento_monto,
                            "descuento_porcentaje": c100.descuento_porcentaje,
                            "descuento_nombre": c100.descuento_nombre,
                        }
                except Exception:
                    # Que falle el precio promocional no puede tumbar la grilla:
                    # sin él la tarjeta muestra el de lista y se vende igual.
                    pago_total = None

                precio = {
                    "total": cotizacion.total,
                    "precio_dia_promedio": promedio,
                    "dias": cotizacion.duracion_dias,
                    "total_referencia": referencia,
                    "pago_total": pago_total,
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
                # La URL ya resuelta, igual que hace `VehiculoService.to_response`.
                # Antes se devolvía sólo la clave y la web armaba a mano
                # `<backend>/static/<clave>` — que funciona con storage local y
                # **se rompe entero el día que los archivos vivan en un bucket**,
                # porque entonces el dominio es otro. Resolverla acá deja a la web
                # sin tener que saber dónde están guardados los archivos.
                "foto_url": _url_publica(cat.foto_key),
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
