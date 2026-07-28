from __future__ import annotations
"""
Service del motor de precios (Fase 5, ítem 57 — plan §7.2).

Su trabajo es traducir: carga de la base las reglas de `tarifas_calendario`,
les resuelve el rango cuando apuntan a una fecha especial, calcula el precio
de la tarifa por banda que sirve de piso, y le entrega todo eso al motor puro
de `domain/precios.py`, que es quien decide.

**Es la única fuente de precios del sistema.** El sistema interno, el
cotizador y la web llaman todos acá — "la idea es acoplar todo a esto".
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.domain.enums import TipoTarifa
from app.domain.precios import (
    Cotizacion,
    DescuentoDuracionInfo,
    ReglaPrecio,
    cotizar,
    resolver_regla_dia,
)
from app.domain.tarifas import (
    TarifaInfo,
    calcular_duracion_dias,
    seleccionar_tarifa,
)
from app.models.categoria import Categoria
from app.models.fecha_especial import FechaEspecial
from app.models.tarifa import Tarifa
from app.models.tarifa_calendario import DescuentoDuracion, TarifaCalendario
from app.models.vehiculo import Vehiculo


class PrecioService:
    def __init__(self, db: Session):
        self.db = db

    # ─── Carga de reglas ──────────────────────────────────────────────────────

    def _cargar_reglas(
        self,
        desde: date,
        hasta: date,
        categoria_id: int | None = None,
        vehiculo_id: int | None = None,
    ) -> list[ReglaPrecio]:
        """
        Trae las reglas activas que pueden tocar el rango pedido.

        El filtro por fechas se hace en SQL sólo para las reglas con rango
        propio; las que heredan de una fecha especial se filtran en Python
        después de resolver el rango, porque el rango real está en la otra
        tabla. Son pocas y se resuelven con un solo JOIN.
        """
        q = (
            self.db.query(TarifaCalendario, FechaEspecial)
            .outerjoin(
                FechaEspecial, TarifaCalendario.fecha_especial_id == FechaEspecial.id
            )
            .filter(TarifaCalendario.activo.is_(True))
        )

        # Una regla de vehículo puntual sólo interesa si estamos cotizando ese
        # vehículo; lo mismo con la categoría. Descartarlas acá evita traer
        # toda la tabla de precios de la flota para cotizar un auto.
        condiciones = [TarifaCalendario.vehiculo_id.is_(None) & TarifaCalendario.categoria_id.is_(None)]
        if vehiculo_id is not None:
            condiciones.append(TarifaCalendario.vehiculo_id == vehiculo_id)
        if categoria_id is not None:
            condiciones.append(TarifaCalendario.categoria_id == categoria_id)
        filtro = condiciones[0]
        for c in condiciones[1:]:
            filtro = filtro | c
        q = q.filter(filtro)

        reglas: list[ReglaPrecio] = []
        for tc, fe in q.all():
            rango_desde, rango_hasta = self._rango_efectivo(tc, fe)
            if rango_desde is None or rango_hasta is None:
                # Regla apuntando a una fecha especial dada de baja: se ignora
                # en vez de romper la cotización. El precio de abajo aplica.
                continue
            if rango_hasta < desde or rango_desde > hasta:
                continue
            reglas.append(
                ReglaPrecio(
                    id=tc.id,
                    nombre=tc.nombre,
                    precio_dia=Decimal(str(tc.precio_dia)),
                    fecha_desde=rango_desde,
                    fecha_hasta=rango_hasta,
                    prioridad=tc.prioridad,
                    categoria_id=tc.categoria_id,
                    vehiculo_id=tc.vehiculo_id,
                    dias_semana=tc.dias_semana,
                    min_dias=tc.min_dias,
                    max_dias=tc.max_dias,
                    canal=tc.canal,
                    es_promocional=tc.es_promocional,
                    precio_referencia=(
                        Decimal(str(tc.precio_referencia))
                        if tc.precio_referencia is not None else None
                    ),
                    etiqueta_promo=tc.etiqueta_promo,
                )
            )
        return reglas

    @staticmethod
    def _rango_efectivo(
        tc: TarifaCalendario, fe: FechaEspecial | None
    ) -> tuple[date | None, date | None]:
        """
        Rango real de la regla: el propio, o el de la fecha especial a la que
        apunta. Esto es el "Navidad 2026 se define una sola vez" del plan: si
        el dueño corrige el rango de la fecha especial, los precios que
        cuelgan de ella se corrigen solos.
        """
        if tc.fecha_especial_id is not None:
            if fe is None or not fe.activo:
                return None, None
            return fe.fecha_desde, fe.fecha_hasta
        return tc.fecha_desde, tc.fecha_hasta

    def _cargar_descuentos(self, categoria_id: int | None) -> list[DescuentoDuracionInfo]:
        q = self.db.query(DescuentoDuracion).filter(DescuentoDuracion.activo.is_(True))
        return [
            DescuentoDuracionInfo(
                id=d.id,
                nombre=d.nombre,
                dias_desde=d.dias_desde,
                dias_hasta=d.dias_hasta,
                porcentaje=Decimal(str(d.porcentaje)),
                categoria_id=d.categoria_id,
            )
            for d in q.all()
            if d.categoria_id is None or d.categoria_id == categoria_id
        ]

    # ─── Tarifa por banda: el piso ────────────────────────────────────────────

    def _precio_banda(
        self, duracion_dias: int, categoria_id: int | None, vehiculo_id: int | None
    ) -> tuple[Decimal | None, str]:
        """
        Precio por día de la tarifa por banda (`domain/tarifas.py`), usado para
        los días que ninguna regla de calendario cubre.

        Acá es donde el sistema viejo pasa a ser un caso particular del motor
        nuevo, en vez de un camino paralelo: si no hay ninguna regla cargada,
        toda la cotización sale de acá y da exactamente lo mismo que antes.
        Devuelve (precio_por_dia, nombre_para_el_desglose).
        """
        q = self.db.query(Tarifa).filter(Tarifa.activo.is_(True))
        if vehiculo_id is not None:
            q = q.filter(
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None))
            )
        else:
            # Cotización por categoría: no hay vehículo puntual al que mirar.
            q = q.filter(Tarifa.vehiculo_id.is_(None))

        tarifas_info = [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
                categoria_id=t.categoria_id,
            )
            for t in q.all()
        ]
        try:
            tarifa = seleccionar_tarifa(duracion_dias, tarifas_info, categoria_id)
        except BusinessRuleError:
            return None, "Sin tarifa configurada"
        return Decimal(str(tarifa.monto)), f"Tarifa {tarifa.tipo.value}"

    # ─── Cotización ───────────────────────────────────────────────────────────

    def calcular(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        categoria_id: int | None = None,
        vehiculo_id: int | None = None,
        canal: str = "mostrador",
    ) -> tuple[Cotizacion, int | None]:
        """
        Cotiza un alquiler. Devuelve (cotización, categoria_id efectiva).

        Si se pasa `vehiculo_id`, la categoría se infiere del vehículo: así la
        web (que reserva por categoría) y el mostrador (que reserva un auto
        puntual) atraviesan exactamente el mismo camino de cálculo.
        """
        if vehiculo_id is not None:
            vehiculo = self.db.get(Vehiculo, vehiculo_id)
            if vehiculo is None:
                raise NotFoundError("Vehículo", vehiculo_id)
            categoria_id = categoria_id or vehiculo.categoria_id
        elif categoria_id is not None:
            if self.db.get(Categoria, categoria_id) is None:
                raise NotFoundError("Categoría", categoria_id)

        duracion = calcular_duracion_dias(fecha_inicio, fecha_fin)
        reglas = self._cargar_reglas(fecha_inicio, fecha_fin, categoria_id, vehiculo_id)
        precio_fallback, nombre_fallback = self._precio_banda(
            duracion, categoria_id, vehiculo_id
        )

        cotizacion = cotizar(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            reglas=reglas,
            precio_fallback=precio_fallback,
            descuentos=self._cargar_descuentos(categoria_id),
            categoria_id=categoria_id,
            vehiculo_id=vehiculo_id,
            canal=canal,
            nombre_fallback=nombre_fallback,
        )
        return cotizacion, categoria_id

    # ─── Vista de calendario (pantalla de administración) ─────────────────────

    def calendario(
        self, desde: date, hasta: date, canal: str = "mostrador",
        categoria_ids: list[int] | None = None,
    ) -> list[dict]:
        """
        Grilla de precios: una fila por categoría, una celda por día.

        Es lo que alimenta la pantalla "Calendario de precios", que tiene que
        ser tan fácil de leer como un Excel — por eso devuelve el precio ya
        resuelto de cada día, no las reglas para que el frontend las
        interprete. Si el frontend resolviera las prioridades por su cuenta,
        habría dos motores de precios y tarde o temprano difieren.
        """
        q = self.db.query(Categoria).filter(Categoria.activo.is_(True))
        if categoria_ids:
            q = q.filter(Categoria.id.in_(categoria_ids))
        categorias = q.order_by(Categoria.orden, Categoria.nombre).all()

        # La duración influye en min_dias/max_dias y en la banda de la tarifa.
        # Para la vista de calendario se usa 1 día: es "cuánto sale UN día",
        # que es lo que el dueño espera ver en una celda.
        duracion_referencia = 1
        total_dias = (hasta - desde).days + 1

        filas = []
        for cat in categorias:
            reglas = self._cargar_reglas(desde, hasta, categoria_id=cat.id)
            precio_banda, nombre_banda = self._precio_banda(
                duracion_referencia, cat.id, None
            )
            dias = []
            for offset in range(total_dias):
                dia = desde + timedelta(days=offset)
                regla = resolver_regla_dia(
                    dia, reglas, duracion_referencia, categoria_id=cat.id, canal=canal
                )
                if regla is not None:
                    dias.append({
                        "fecha": dia,
                        "precio": Decimal(str(regla.precio_dia)),
                        "origen": "calendario",
                        "regla_id": regla.id,
                        "regla_nombre": regla.nombre,
                        "es_promocional": regla.es_promocional,
                        "etiqueta_promo": regla.etiqueta_promo if regla.es_promocional else None,
                    })
                elif precio_banda is not None:
                    dias.append({
                        "fecha": dia,
                        "precio": precio_banda,
                        "origen": "banda",
                        "regla_nombre": nombre_banda,
                    })
                else:
                    # Hueco real: ni regla ni tarifa. Se muestra como tal en vez
                    # de inventar un precio — es justamente lo que el dueño
                    # necesita ver para saber dónde falta cargar.
                    dias.append({"fecha": dia, "precio": None, "origen": "sin_precio"})

            filas.append({
                "categoria_id": cat.id,
                "categoria_nombre": cat.nombre,
                "dias": dias,
            })
        return filas
