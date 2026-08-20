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
    MARGEN_ROTACION_HORAS,
    OcupacionCategoria,
    VehiculoDisponible,
    calcular_cupos,
    con_preparacion,
    proponer_entrega_por_rotacion,
)
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

# Cuánto tarda el equipo en dejar listo un auto que vuelve. Vive en
# `configuracion` (migración 061) porque es un dato del mostrador, no del
# código: en temporada puede ser más.
CLAVE_MARGEN_ROTACION = "disponibilidad.margen_rotacion_horas"


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
        self,
        desde: date,
        hasta: date,
        excluir_hold_token: str | None = None,
        excluir_reserva_id: int | None = None,
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

        `excluir_reserva_id` hace lo mismo con una reserva: lo usa
        `unidades_libres` cuando se está por **cambiar** el auto de una reserva
        que ya tiene uno. Sin esto, el auto que hoy tiene asignado figura
        ocupado por ella misma y desaparece de la lista, que es justo el que
        hay que poder dejar como está.
        """
        ocupaciones: list[OcupacionCategoria] = []

        q_reservas = self.db.query(Reserva).filter(
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= desde,
        )
        if excluir_reserva_id is not None:
            q_reservas = q_reservas.filter(Reserva.id != excluir_reserva_id)
        reservas = q_reservas.all()
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

        `edad_conductor` **ya no cambia el precio**: se retiró el recargo por
        franja etaria (D-38). Se sigue recibiendo porque la edad decide otra
        cosa — si la persona puede alquilar por la web (`alquiler.edad_minima`,
        D-51), que se valida en el router antes de llegar acá.

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

        # **Un auto que vuelve no está listo en el mismo instante.** Los rangos
        # adyacentes no solapan —regla de siempre del calendario—, así que sin
        # esto una unidad devuelta a las 10:00 figuraba libre para entregar a
        # las 10:00, y el sitio la vendía sin un minuto para limpiarla. El
        # problema aparecía en el mostrador, con el cliente enfrente.
        #
        # Se aplica acá, en el único lugar del que cuelgan los tres caminos de
        # venta web (la grilla, el hold y la re-verificación del webhook), para
        # que **el cupo que se muestra sea el mismo que después se acepta**.
        # El mostrador no pasa por acá: `ReservaService` usa
        # `domain/solapamientos`, así que quien sabe lo que hace puede seguir
        # cargando una entrega pegada a una devolución.
        margen_rotacion = self._margen_rotacion()
        ocupadas = con_preparacion(ocupaciones, margen_rotacion)

        cupos = {
            c.categoria_id: c
            for c in calcular_cupos(
                inicio_dt, fin_dt, flota, ocupadas,
                categoria_ids=[c.id for c in categorias],
            )
        }

        precio_service = PrecioService(self.db)
        resultado = []
        for cat in categorias:
            cupo: CupoCategoria = cupos[cat.id]

            # Sin cupo a la hora pedida, ¿hay una unidad que vuelve ese mismo
            # día? El motor decide; acá sólo se traduce a algo mostrable.
            # **Se calcula únicamente cuando no hay cupo**: con unidades libres
            # esto ni se pregunta, así que no cuesta nada en el caso normal.
            rotacion = None
            if not cupo.hay_cupo:
                # Las ocupaciones **sin preparar**: el motor la suma él mismo, y
                # necesita la devolución real para poder explicarle al cliente
                # de dónde sale el horario. Pasarle `ocupadas` contaría el
                # margen dos veces y ofrecería las 14:00 por un auto que vuelve
                # a las 10:00.
                propuesta = proponer_entrega_por_rotacion(
                    cat.id, inicio_dt, fin_dt, flota, ocupaciones,
                    margen_horas=margen_rotacion,
                )
                if propuesta is not None:
                    rotacion = {
                        "fecha_entrega": propuesta.entrega.date(),
                        "hora_entrega": propuesta.entrega.strftime("%H:%M"),
                        # Por qué esa hora y no otra. Sin esto el cliente ve un
                        # horario corrido sin explicación y lo lee como un error.
                        "hora_devolucion_unidad": (
                            propuesta.devolucion_unidad.strftime("%H:%M")
                        ),
                        "margen_horas": propuesta.margen_horas,
                    }

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
                # Ya no hay que reponer nada: al retirarse el recargo por edad
                # (D-38), el promedio por día y el precio de referencia son
                # directamente consistentes con el total.
                promedio = cotizacion.precio_dia_promedio
                referencia = cotizacion.total_referencia
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
                            "precio_dia_promedio": c100.precio_dia_promedio,
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
                # D-51/D-59: lo que le queda al cliente si no contrata ninguna
                # cobertura — hoy es el escenario de **mayor** riesgo, no $0
                # como antes. La web lo muestra en el paso de adicionales para
                # que "no elegir nada" se vea como lo que es.
                "franquicia_base": (
                    float(cat.franquicia_base) if cat.franquicia_base is not None else None
                ),
                "disponibles": cupo.disponibles,
                "hay_cupo": cupo.hay_cupo and precio is not None,
                "ultima_unidad": cupo.ultima_unidad,
                # Entrega más tarde ese mismo día sobre la unidad que vuelve.
                # `None` siempre que haya cupo — y también cuando no hay cupo
                # pero no vuelve nada ese día, que es el "no" de verdad.
                # Sin precio la categoría no se puede vender, y tampoco ofrecer.
                "rotacion": rotacion if precio is not None else None,
                "precio": precio,
            })
        return resultado

    def _margen_rotacion(self) -> float:
        """
        Horas de preparación entre que un auto vuelve y se puede volver a
        entregar. Sale de `configuracion`: cuánto lleva limpiar y revisar un
        auto lo sabe el mostrador, no el código.
        """
        from app.services.configuracion_service import ConfiguracionService

        try:
            return float(
                ConfiguracionService(self.db).get_decimal(
                    CLAVE_MARGEN_ROTACION, Decimal(str(MARGEN_ROTACION_HORAS))
                )
            )
        except Exception:
            # Un valor mal cargado no puede tumbar la consulta de la que cuelga
            # toda la web: se cae al default del dominio.
            return float(MARGEN_ROTACION_HORAS)

    def vehiculos_libres(
        self, categoria_id: int, fecha_inicio: date, hora_inicio: time,
        fecha_fin: date, hora_fin: time,
    ) -> list[int]:
        """
        Qué autos concretos de la categoría están libres en el rango.

        Es lo que necesita la bandeja de reservas web para **sugerir** qué
        vehículo asignar al aceptar una reserva que vino sin auto.

        Cuenta la preparación igual que `consultar`: sugerir un auto que se
        devuelve a la misma hora en que hay que entregarlo es sugerir el que no
        va a estar listo.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)
        cupos = calcular_cupos(
            inicio_dt, fin_dt,
            self._cargar_flota(),
            con_preparacion(
                self._cargar_ocupaciones(fecha_inicio, fecha_fin),
                self._margen_rotacion(),
            ),
            categoria_ids=[categoria_id],
        )
        return cupos[0].vehiculos_libres if cupos else []

    def unidades_libres(
        self,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        categoria_ids: list[int] | None = None,
        excluir_reserva_id: int | None = None,
    ) -> dict[int, list[int]]:
        """
        Qué autos concretos están libres en el rango, **de todas las
        categorías en una sola pasada**.

        Es lo que necesita el operador para asignarle un auto a una reserva
        que entró por la web: la web vende una categoría (D-02) y el auto
        puntual se decide acá. Un desplegable con la flota entera obliga a
        saberse de memoria qué está afuera; esto muestra sólo lo que está
        libre de verdad.

        Devuelve todas las categorías —no sólo la pedida— porque **dar un
        upgrade es una decisión comercial válida** y muchas veces la única
        forma de no perder la venta. Quién es la categoría pedida lo sabe
        quien llama; acá se devuelve el mapa completo.

        `vehiculos_libres` sale de `calcular_cupos`, que resta únicamente las
        ocupaciones **de una unidad concreta**. Las que son por categoría
        (otra reserva sin auto asignado, o un hold web) bajan el cupo pero no
        sacan ningún auto de la lista: no se puede saber cuál van a terminar
        tomando. Por eso asignar siempre revalida contra el auto elegido — ver
        `ReservaService.asignar_vehiculo`.

        Cuenta la preparación igual que `consultar`: un auto que se devuelve a
        la misma hora en que hay que entregarlo no está listo.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)
        if categoria_ids is None:
            categoria_ids = [
                c.id for c in self.db.query(Categoria.id)
                .filter(Categoria.activo.is_(True)).all()
            ]
        if not categoria_ids:
            return {}

        cupos = calcular_cupos(
            inicio_dt, fin_dt,
            self._cargar_flota(),
            con_preparacion(
                self._cargar_ocupaciones(
                    fecha_inicio, fecha_fin, excluir_reserva_id=excluir_reserva_id
                ),
                self._margen_rotacion(),
            ),
            categoria_ids=categoria_ids,
        )
        return {c.categoria_id: c.vehiculos_libres for c in cupos}
