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

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.domain.enums import TipoTarifa
from app.domain.precios import (
    AdicionalSolicitado,
    Cotizacion,
    DescuentoDuracionInfo,
    ReglaPrecio,
    aplica_descuento_por_duracion,
    cotizar,
    resolver_regla_dia,
)
from app.domain.tarifas import (
    TarifaInfo,
    calcular_duracion_dias,
    cotizar_por_bandas,
)
from app.domain.recargo_edad import RecargoEdadInfo, calcular_edad
from app.models.adicional import Adicional
from app.models.recargo_edad import RecargoEdad
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
    ) -> tuple[Decimal | list[Decimal] | None, str]:
        """
        Precio por día de la tarifa por banda (`domain/tarifas.py`), usado para
        los días que ninguna regla de calendario cubre.

        Acá es donde el sistema viejo pasa a ser un caso particular del motor
        nuevo, en vez de un camino paralelo: si no hay ninguna regla cargada,
        toda la cotización sale de acá y da exactamente lo mismo que antes.

        **Desde D-35 devuelve una lista con un precio por cada día**, porque el
        precio de un día depende del bloque al que pertenece: en un alquiler de
        10 días, los 7 primeros valen 1/7 de la semana y los 3 sueltos valen el
        día completo. Devolver un único promedio haría que el desglose diario
        no sumara el total que se cobra.

        Devuelve (precios, nombre_para_el_desglose).
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
            cot = cotizar_por_bandas(duracion_dias, tarifas_info, categoria_id)
        except BusinessRuleError:
            return None, "Sin tarifa configurada"

        # "1 semana + 3 días" es lo que hay que poder leer en el desglose; con
        # un solo bloque se sigue viendo "Tarifa diaria", como antes.
        if len(cot.bloques) == 1:
            nombre = f"Tarifa {cot.bloques[0].tipo.value}"
        else:
            nombre = "Tarifa " + " + ".join(
                f"{b.cantidad}×{b.tipo.value}" for b in cot.bloques
            )
        return cot.precios_por_dia, nombre

    def _cargar_recargos_edad(self, categoria_id: int | None) -> list[RecargoEdadInfo]:
        """
        Franjas de recargo por edad vigentes (D-38). Trae las generales más las
        de la categoría cotizada — el dominio se encarga de elegir.
        """
        q = self.db.query(RecargoEdad).filter(RecargoEdad.activo.is_(True))
        if categoria_id is not None:
            q = q.filter(
                (RecargoEdad.categoria_id == categoria_id)
                | (RecargoEdad.categoria_id.is_(None))
            )
        else:
            q = q.filter(RecargoEdad.categoria_id.is_(None))

        return [
            RecargoEdadInfo(
                id=r.id,
                nombre=r.nombre,
                edad_desde=r.edad_desde,
                edad_hasta=r.edad_hasta,
                monto=Decimal(str(r.monto)) if r.monto is not None else None,
                porcentaje=Decimal(str(r.porcentaje)) if r.porcentaje is not None else None,
                unidad_cobro=r.unidad_cobro,
                categoria_id=r.categoria_id,
            )
            for r in q.all()
        ]

    # ─── Cotización ───────────────────────────────────────────────────────────

    def _cargar_adicionales(
        self, solicitados: list[tuple[int, int]], subtotal_vehiculo: Decimal | None = None
    ) -> list[AdicionalSolicitado]:
        """
        Resuelve los adicionales pedidos como (id, cantidad) contra la tabla,
        tomando el precio vigente. Valida el tope de unidades acá porque el
        dominio no conoce `max_cantidad` — es una regla del catálogo, no del
        cálculo.

        **Los de `porcentaje_sobre_alquiler` (D-53) necesitan `subtotal_vehiculo`
        para resolver un precio**, y ese número todavía no existe la primera
        vez que se llama (es la salida de `cotizar()`, no la entrada). Sin
        `subtotal_vehiculo` quedan en 0 — `calcular()` hace una segunda pasada
        con el subtotal ya conocido, el mismo patrón que ya usa
        `/public/cotizar` para comparar el escenario de pago total.
        """
        if not solicitados:
            return []

        ids = [aid for aid, _ in solicitados]
        encontrados = {
            a.id: a
            for a in self.db.query(Adicional)
            .filter(Adicional.id.in_(ids), Adicional.activo.is_(True))
            .all()
        }

        resultado: list[AdicionalSolicitado] = []
        for adicional_id, cantidad in solicitados:
            a = encontrados.get(adicional_id)
            if a is None:
                raise NotFoundError("Adicional", adicional_id)
            if a.max_cantidad is not None and cantidad > a.max_cantidad:
                raise BusinessRuleError(
                    "cantidad_excede_maximo",
                    f"'{a.nombre}' admite hasta {a.max_cantidad} unidad(es) por reserva",
                )
            es_porcentaje = a.porcentaje_sobre_alquiler is not None
            if es_porcentaje:
                base = subtotal_vehiculo if subtotal_vehiculo is not None else Decimal("0")
                precio_unitario = base * Decimal(str(a.porcentaje_sobre_alquiler)) / Decimal(100)
            else:
                precio_unitario = Decimal(str(a.precio))
            resultado.append(AdicionalSolicitado(
                id=a.id,
                nombre=a.nombre,
                precio_unitario=precio_unitario,
                unidad_cobro=a.unidad_cobro,
                cantidad=cantidad,
                grupo=a.grupo,
                es_porcentaje=es_porcentaje,
            ))
        return resultado

    def calcular(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        categoria_id: int | None = None,
        vehiculo_id: int | None = None,
        canal: str = "mostrador",
        adicionales: list[tuple[int, int]] | None = None,
        fecha_nacimiento: date | None = None,
        edad_conductor: int | None = None,
        porcentaje_anticipo: int | None = None,
    ) -> tuple[Cotizacion, int | None]:
        """
        Cotiza un alquiler. Devuelve (cotización, categoria_id efectiva).

        Si se pasa `vehiculo_id`, la categoría se infiere del vehículo: así la
        web (que reserva por categoría) y el mostrador (que reserva un auto
        puntual) atraviesan exactamente el mismo camino de cálculo.

        La edad del conductor entra por dos puertas y **la fecha manda**:

        - `fecha_nacimiento` es la vía exacta y la que usan el mostrador y el
          paso 3 de la web. La edad se deriva al día del retiro.
        - `edad_conductor` es lo que la persona declara en el buscador de la
          portada, antes de que exista una ficha de cliente. Alcanza para
          cotizar y evita pedir una fecha de nacimiento a alguien que todavía
          está mirando precios.

        Si llegan las dos, se ignora la declarada: un dato verificable no se
        pisa con uno dicho al pasar.
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
        edad_efectiva = (
            calcular_edad(fecha_nacimiento, fecha_inicio)
            if fecha_nacimiento is not None else edad_conductor
        )

        def _cotizar_con(adicionales_cargados: list[AdicionalSolicitado]) -> Cotizacion:
            return cotizar(
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                reglas=reglas,
                precio_fallback=precio_fallback,
                descuentos=self._cargar_descuentos(categoria_id),
                categoria_id=categoria_id,
                vehiculo_id=vehiculo_id,
                canal=canal,
                nombre_fallback=nombre_fallback,
                adicionales=adicionales_cargados,
                recargos_edad=self._cargar_recargos_edad(categoria_id),
                edad_conductor=edad_efectiva,
                porcentaje_anticipo=porcentaje_anticipo,
            )

        adicionales_cargados = self._cargar_adicionales(adicionales or [])
        cotizacion = _cotizar_con(adicionales_cargados)

        # D-53: si hay coberturas por porcentaje, se resuelven en una segunda
        # pasada contra el `subtotal_vehiculo` que recién ahora se conoce —
        # la primera pasada las dejó en $0 a propósito (ver
        # `_cargar_adicionales`).
        if any(a.es_porcentaje for a in adicionales_cargados):
            adicionales_cargados = self._cargar_adicionales(
                adicionales or [], subtotal_vehiculo=cotizacion.subtotal_vehiculo,
            )
            cotizacion = _cotizar_con(adicionales_cargados)

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
            precios_banda, nombre_banda = self._precio_banda(
                duracion_referencia, cat.id, None
            )
            # La grilla muestra "cuánto sale UN día", así que con duración 1 el
            # desglose por bloques tiene un solo elemento.
            precio_banda = precios_banda[0] if precios_banda else None
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

    # ─── Simulación de una regla antes de guardarla ───────────────────────────

    def simular_regla(
        self,
        fecha_desde: date,
        fecha_hasta: date,
        precio_dia: Decimal,
        categoria_id: int | None = None,
        prioridad: int = 0,
        canal: str = "mostrador",
    ) -> dict:
        """
        Qué pasaría si se cargara esta regla: cuánto sale el rango completo, qué
        descuento por duración le corresponde y en qué días la regla realmente
        va a mandar.

        Es la respuesta a "del 3 al 10 de septiembre, Compacto: ¿$X por día es
        cuánto?" que la pantalla muestra mientras se arrastra sobre el
        calendario. **La cuenta la hace el mismo motor que después cobra**: acá
        sólo se arma una `ReglaPrecio` que todavía no existe en la base y se la
        mete en `cotizar` como una más.

        Dos detalles que no son obvios:

        - El descuento por duración se calcula **siempre**, forzando
          `porcentaje_anticipo=100`. En la web ese descuento se gana pagando el
          100% (D-49), y la pantalla necesita poder decir "si paga todo, sale
          $X" en vez de esconderlo. Que sea condicional viaja aparte, en
          `descuento_condicionado`.
        - `dias_efectivos` sale de resolver cada día con las reglas que ya
          existen **más** la propuesta, usando el desempate real del motor. Sin
          esto, cargar un precio abajo de una promo vigente se vería como
          exitoso y no cambiaría ni un peso.
        """
        dias = (fecha_hasta - fecha_desde).days + 1
        proximo_id = (self.db.query(func.max(TarifaCalendario.id)).scalar() or 0) + 1

        propuesta = ReglaPrecio(
            id=proximo_id,
            nombre="(propuesta)",
            precio_dia=Decimal(str(precio_dia)),
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            prioridad=prioridad,
            categoria_id=categoria_id,
            # 'ambos' para que la propuesta no quede fuera por canal: el canal
            # real lo pone el alta, y acá lo que se simula es el precio.
            canal="ambos",
        )

        cot = cotizar(
            fecha_inicio=fecha_desde,
            fecha_fin=fecha_hasta + timedelta(days=1),
            reglas=[propuesta],
            descuentos=self._cargar_descuentos(categoria_id),
            categoria_id=categoria_id,
            canal=canal,
            porcentaje_anticipo=100,
        )

        existentes = self._cargar_reglas(fecha_desde, fecha_hasta, categoria_id=categoria_id)
        candidatas = existentes + [propuesta]
        dias_efectivos = 0
        pisado_por: list[str] = []
        for offset in range(dias):
            dia = fecha_desde + timedelta(days=offset)
            gana = resolver_regla_dia(
                dia, candidatas, dias, categoria_id=categoria_id, canal=canal
            )
            if gana is not None and gana.id == propuesta.id:
                dias_efectivos += 1
            elif gana is not None and gana.nombre not in pisado_por:
                pisado_por.append(gana.nombre)

        return {
            "dias": dias,
            "precio_dia": Decimal(str(precio_dia)),
            "subtotal": cot.subtotal,
            "descuento_nombre": cot.descuento_nombre,
            "descuento_porcentaje": cot.descuento_porcentaje,
            "descuento_monto": cot.descuento_monto,
            "total": cot.subtotal_vehiculo,
            "precio_dia_con_descuento": cot.precio_dia_promedio,
            "descuento_condicionado": not aplica_descuento_por_duracion(canal, None),
            "dias_efectivos": dias_efectivos,
            "pisado_por": pisado_por,
        }
