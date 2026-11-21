"""
Oportunidades 💡: las reglas, y cómo las trata el motor.

El pedido (21/11/2026): *"que el sistema sugiera oportunidades […] que diga
cuando está un auto parado hace mucho tiempo"*.

Tres cosas se prueban acá:

1. **Cada regla**: un caso que dispara, uno que no, y el borde.
2. **El motor**: una oportunidad es una sola fila mientras siga valiendo, un
   "No me sirve" la calla por semanas, y una regla que revienta no tumba los
   avisos de siempre ni borra lo que ya estaba.
3. **La campana no las cuenta**: tienen su propio endpoint.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest

from app.domain import oportunidades_reglas as op
from app.models.alquiler import Alquiler
from app.models.notificacion import Notificacion
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services import notificacion_service as ns
from app.services.notificacion_service import NotificacionService

HOY = date(2026, 11, 20)  # viernes
API = "/api/v1"


# ── Andamiaje ────────────────────────────────────────────────────────────────

def _hace(dias: int) -> datetime:
    return datetime.combine(HOY - timedelta(days=dias), time(9, 0))


@pytest.fixture()
def categoria(db):
    from app.models.categoria import Categoria

    c = Categoria(codigo="pickup", nombre="Pick-up")
    db.add(c)
    db.flush()
    return c


@pytest.fixture()
def hacer_auto(db):
    """Autos cargados hace rato, para que "parado" dependa sólo de las reservas."""
    n = {"i": 0}

    def _hacer(*, dias_de_alta=60, **extra):
        n["i"] += 1
        datos = dict(
            patente=f"OP{n['i']:03d}AA", marca="Toyota", modelo="Hilux", anio=2024,
            tipo="camioneta", color="gris", estado="disponible", km_actual=1000,
            created_at=_hace(dias_de_alta), estado_desde=_hace(dias_de_alta),
        )
        datos.update(extra)
        v = Vehiculo(**datos)
        db.add(v)
        db.flush()
        return v

    return _hacer


@pytest.fixture()
def hacer_cliente(db):
    from app.models.cliente import Cliente

    n = {"i": 0}

    def _hacer(nombre="Juan Pérez", telefono="2915551234", **extra):
        n["i"] += 1
        c = Cliente(
            nombre_completo=nombre, dni_cuit=f"2000000{n['i']}", telefono=telefono,
            tipo="particular", **extra,
        )
        db.add(c)
        db.flush()
        return c

    return _hacer


@pytest.fixture()
def reservar(db, usuario):
    """Una reserva sobre el auto y el cliente que se le pasen."""

    def _hacer(vehiculo, cliente, inicio, fin, estado="confirmada", **extra):
        r = Reserva(
            vehiculo_id=vehiculo.id if vehiculo else None, cliente_id=cliente.id,
            fecha_inicio=inicio, hora_inicio=time(10, 0),
            fecha_fin=fin, hora_fin=time(10, 0),
            lugar_entrega="Local", lugar_devolucion="Local",
            estado=estado, usuario_id=usuario.id,
            precio_total=Decimal(str(extra.pop("precio_total", "100000"))),
            **extra,
        )
        db.add(r)
        db.flush()
        return r

    return _hacer


@pytest.fixture()
def entregar(db, usuario):
    def _hacer(reserva, checkin_fecha=None):
        a = Alquiler(
            reserva_id=reserva.id, checkout_fecha=reserva.fecha_inicio,
            checkout_hora=time(10, 0), checkout_km=1000, checkout_combustible=100,
            checkin_fecha=checkin_fecha, decidido_por=usuario.id,
        )
        db.add(a)
        db.flush()
        return a

    return _hacer


@pytest.fixture()
def con_precio(monkeypatch, categoria):
    """El precio diario de la categoría, sin armar tarifas: $50.000."""
    monkeypatch.setattr(op, "_precios_del_dia", lambda _db, _hoy: {categoria.id: Decimal("50000")})


def _dia(n: int) -> date:
    return HOY + timedelta(days=n)


# ── 1. Auto parado ───────────────────────────────────────────────────────────

class TestAutoParado:
    def test_un_auto_que_volvio_hace_18_dias_y_no_tiene_nada_a_la_vista(
        self, db, hacer_auto, hacer_cliente, reservar, entregar, categoria, con_precio,
    ):
        auto = hacer_auto(categoria_id=categoria.id)
        r = reservar(auto, hacer_cliente(), _dia(-25), _dia(-18), estado="finalizada")
        entregar(r, checkin_fecha=_dia(-18))

        (c,) = op.auto_parado(db, HOY)
        assert c["tipo"] == "op_auto_parado"
        assert c["entidad_tipo"] == "vehiculo" and c["entidad_id"] == auto.id
        assert c["url_destino"] == f"/flota/{auto.id}"
        assert "18 días" in c["titulo"]
        assert c["descripcion"] == "Hace 18 días que no sale · sin reservas a la vista"
        assert c["urgencia"] == "baja"
        assert c["datos"]["impacto"] == 18 * 50000
        assert c["datos"]["impacto_label"] == "≈ $900.000 sin facturar"
        assert c["datos"]["accion"] == "Ver el auto"

    def test_el_borde_a_los_10_dias_si_a_los_9_no(
        self, db, hacer_auto, hacer_cliente, reservar,
    ):
        cliente = hacer_cliente()
        justo, casi = hacer_auto(), hacer_auto()
        reservar(justo, cliente, _dia(-15), _dia(-10), estado="finalizada")
        reservar(casi, cliente, _dia(-15), _dia(-9), estado="finalizada")

        assert [c["entidad_id"] for c in op.auto_parado(db, HOY)] == [justo.id]

    def test_con_una_reserva_en_los_proximos_7_dias_no_es_oportunidad(
        self, db, hacer_auto, hacer_cliente, reservar,
    ):
        cliente = hacer_cliente()
        cerca, lejos = hacer_auto(), hacer_auto()
        reservar(cerca, cliente, _dia(5), _dia(8))
        reservar(lejos, cliente, _dia(20), _dia(25))

        assert [c["entidad_id"] for c in op.auto_parado(db, HOY)] == [lejos.id]

    def test_nunca_salio_se_cuenta_desde_el_alta(self, db, hacer_auto):
        hacer_auto(dias_de_alta=40)
        (c,) = op.auto_parado(db, HOY)
        assert "nunca salió" in c["descripcion"]
        assert c["datos"]["dias_parado"] == 40
        # Pasó de los 30 días: sube un escalón.
        assert c["urgencia"] == "media"
        # Sin categoría no hay precio: sale sin monto, no con uno inventado.
        assert "impacto" not in c["datos"]

    def test_el_que_volvio_ayer_del_taller_no_lleva_un_mes_parado(self, db, hacer_auto):
        v = hacer_auto(dias_de_alta=90)
        v.estado_desde = _hace(1)
        db.flush()
        assert op.auto_parado(db, HOY) == []

    def test_no_cuenta_el_que_esta_afuera_ni_el_de_uber_ni_el_fuera_de_servicio(
        self, db, hacer_auto, hacer_cliente, reservar, entregar,
    ):
        cliente = hacer_cliente()
        afuera = hacer_auto()
        # Devolución atrasada: terminó en los papeles, sigue en la calle.
        entregar(reservar(afuera, cliente, _dia(-20), _dia(-12), estado="vencida"))
        hacer_auto(destino="uber")
        hacer_auto(estado="fuera_de_servicio")
        hacer_auto(activo=False)

        assert op.auto_parado(db, HOY) == []

    def test_el_umbral_se_puede_cambiar_desde_configuracion(self, db, hacer_auto):
        from app.models.configuracion import Configuracion

        hacer_auto(dias_de_alta=12)
        assert len(op.auto_parado(db, HOY)) == 1
        db.add(Configuracion(
            clave="oportunidades.auto_parado_dias", valor="15", tipo="int",
            categoria="Oportunidades", descripcion="x",
        ))
        db.flush()
        assert op.auto_parado(db, HOY) == []


# ── 2. Extensión posible ─────────────────────────────────────────────────────

class TestExtensionPosible:
    def test_termina_manana_y_el_auto_queda_libre(
        self, db, hacer_auto, hacer_cliente, reservar, entregar, categoria, con_precio,
    ):
        auto = hacer_auto(categoria_id=categoria.id)
        a = entregar(reservar(auto, hacer_cliente("Ana Gómez"), _dia(-3), _dia(1), estado="activa"))

        (c,) = op.extension_posible(db, HOY)
        assert c["entidad_tipo"] == "alquiler" and c["entidad_id"] == a.id
        assert c["titulo"] == "Ofrecele extender a Ana Gómez"
        assert "vuelve mañana" in c["descripcion"]
        assert c["datos"]["impacto"] == 150000
        assert c["datos"]["whatsapp"].startswith("https://wa.me/2915551234?text=Hola%20Ana")

    def test_si_el_auto_tiene_otra_reserva_enseguida_no_se_ofrece(
        self, db, hacer_auto, hacer_cliente, reservar, entregar,
    ):
        auto, cliente = hacer_auto(), hacer_cliente()
        entregar(reservar(auto, cliente, _dia(-3), _dia(0), estado="activa"))
        reservar(auto, cliente, _dia(2), _dia(6))
        assert op.extension_posible(db, HOY) == []

    def test_el_borde_una_reserva_a_los_4_dias_no_molesta_y_sin_telefono_no_hay_link(
        self, db, hacer_auto, hacer_cliente, reservar, entregar,
    ):
        auto, cliente = hacer_auto(), hacer_cliente(telefono="-")
        entregar(reservar(auto, cliente, _dia(-3), _dia(0), estado="activa"))
        reservar(auto, cliente, _dia(4), _dia(6))
        (c,) = op.extension_posible(db, HOY)
        assert "whatsapp" not in c["datos"]

    def test_el_que_termina_en_tres_dias_todavia_no(
        self, db, hacer_auto, hacer_cliente, reservar, entregar,
    ):
        entregar(reservar(hacer_auto(), hacer_cliente(), _dia(-3), _dia(3), estado="activa"))
        assert op.extension_posible(db, HOY) == []


# ── 3. Clientes para volver a contactar ──────────────────────────────────────

class TestClienteParaRecontactar:
    def test_alquilo_varias_veces_y_hace_meses_que_no_aparece(
        self, db, hacer_auto, hacer_cliente, reservar,
    ):
        auto, c = hacer_auto(), hacer_cliente("Carla Ruiz")
        for desde in (-400, -300, -200, -150):
            reservar(auto, c, _dia(desde), _dia(desde + 3), estado="finalizada")

        (o,) = op.cliente_para_recontactar(db, HOY)
        assert o["entidad_id"] == c.id and o["url_destino"] == f"/clientes/{c.id}"
        assert o["descripcion"] == "Alquiló 4 veces, la última hace 4 meses."
        assert o["datos"]["impacto"] == 100000
        assert "wa.me/2915551234" in o["datos"]["whatsapp"]

    def test_no_entran_el_de_un_solo_alquiler_el_reciente_ni_el_que_ya_reservo(
        self, db, hacer_auto, hacer_cliente, reservar,
    ):
        auto = hacer_auto()
        uno = hacer_cliente("Uno")
        reservar(auto, uno, _dia(-200), _dia(-197), estado="finalizada")
        reciente = hacer_cliente("Reciente")
        for desde in (-200, -40):
            reservar(auto, reciente, _dia(desde), _dia(desde + 3), estado="finalizada")
        con_reserva = hacer_cliente("Con reserva")
        for desde in (-300, -200):
            reservar(auto, con_reserva, _dia(desde), _dia(desde + 3), estado="finalizada")
        reservar(auto, con_reserva, _dia(30), _dia(33))
        muy_viejo = hacer_cliente("Muy viejo")
        for desde in (-900, -700):
            reservar(auto, muy_viejo, _dia(desde), _dia(desde + 3), estado="finalizada")

        assert op.cliente_para_recontactar(db, HOY) == []

    def test_el_borde_de_los_90_dias(self, db, hacer_auto, hacer_cliente, reservar):
        auto = hacer_auto()
        justo, casi = hacer_cliente("Justo"), hacer_cliente("Casi")
        for c, ultima in ((justo, -90), (casi, -89)):
            reservar(auto, c, _dia(-300), _dia(-297), estado="finalizada")
            reservar(auto, c, _dia(ultima - 3), _dia(ultima), estado="finalizada")
        assert [o["entidad_id"] for o in op.cliente_para_recontactar(db, HOY)] == [justo.id]

    def test_solo_los_15_mejores_y_sin_los_que_deben(
        self, db, hacer_auto, hacer_cliente, reservar, monkeypatch,
    ):
        auto = hacer_auto()
        clientes = [hacer_cliente(f"Cliente {i}") for i in range(18)]
        for i, c in enumerate(clientes):
            # El último es el que más alquiló: tiene que quedar primero.
            for k in range(2 + (1 if i == 17 else 0)):
                reservar(auto, c, _dia(-300 + k * 10), _dia(-297 + k * 10), estado="finalizada")
        deudor = clientes[0]
        monkeypatch.setattr(op.cobranza, "clientes_con_deuda", lambda _db: {deudor.id})

        items = op.cliente_para_recontactar(db, HOY)
        assert len(items) == 15
        assert items[0]["entidad_id"] == clientes[17].id
        assert deudor.id not in {o["entidad_id"] for o in items}


# ── 4. Fecha fuerte con autos libres ─────────────────────────────────────────

class TestFechaFuerte:
    @pytest.fixture()
    def feriado(self, db):
        from app.models.fecha_especial import FechaEspecial

        def _hacer(nombre="Inmaculada Concepción", desde=date(2026, 12, 7), hasta=None, tipo="feriado"):
            f = FechaEspecial(nombre=nombre, fecha_desde=desde, fecha_hasta=hasta or desde, tipo=tipo)
            db.add(f)
            db.flush()
            return f

        return _hacer

    def test_feriado_con_mas_de_media_flota_libre(
        self, db, hacer_auto, hacer_cliente, reservar, feriado,
    ):
        autos = [hacer_auto() for _ in range(4)]
        # Lunes 7/12: se mira el fin de semana largo entero (5 al 7).
        f = feriado()
        reservar(autos[0], hacer_cliente(), date(2026, 12, 5), date(2026, 12, 8))

        (c,) = op.fecha_fuerte_con_autos_libres(db, HOY)
        assert c["entidad_tipo"] == "fecha_especial" and c["entidad_id"] == f.id
        assert c["titulo"] == "Inmaculada Concepción (7/12): 3 de 4 autos libres"
        assert "del 5/12 al 7/12" in c["descripcion"]
        assert c["url_destino"] == "/ocupacion"

    def test_con_la_mitad_reservada_ya_no(self, db, hacer_auto, hacer_cliente, reservar, feriado):
        autos = [hacer_auto() for _ in range(4)]
        feriado()
        cliente = hacer_cliente()
        for a in autos[:2]:
            reservar(a, cliente, date(2026, 12, 5), date(2026, 12, 8))
        assert op.fecha_fuerte_con_autos_libres(db, HOY) == []

    def test_las_reservas_web_sin_auto_asignado_tambien_ocupan(
        self, db, hacer_auto, hacer_cliente, reservar, feriado, categoria,
    ):
        autos = [hacer_auto(categoria_id=categoria.id) for _ in range(4)]
        feriado()
        cliente = hacer_cliente()
        reservar(autos[0], cliente, date(2026, 12, 5), date(2026, 12, 8))
        reservar(None, cliente, date(2026, 12, 6), date(2026, 12, 8), categoria_id=categoria.id)
        assert op.fecha_fuerte_con_autos_libres(db, HOY) == []

    def test_fuera_del_horizonte_las_temporadas_y_las_repetidas_no(
        self, db, hacer_auto, feriado,
    ):
        hacer_auto()
        feriado("Navidad", date(2026, 12, 25))                      # a 35 días
        feriado("Temporada alta", _dia(5), _dia(60), tipo="temporada")
        largo = feriado("Finde largo", date(2026, 12, 5), date(2026, 12, 8), tipo="fin_semana_largo")
        feriado("Feriado adentro", date(2026, 12, 8))               # ya cubierto por el de arriba

        assert [c["entidad_id"] for c in op.fecha_fuerte_con_autos_libres(db, HOY)] == [largo.id]


# ── 5. Demanda de la web sin cupo ────────────────────────────────────────────

class TestDemandaSinCupo:
    @pytest.fixture()
    def buscar(self, db):
        from app.models.busqueda_sin_resultado import BusquedaSinResultado

        def _hacer(categoria_id, motivo="sin_cupo", hace=1, inicio=None, fin=None):
            b = BusquedaSinResultado(
                categoria_id=categoria_id, motivo=motivo, boton_elegido="whatsapp",
                fecha_inicio=inicio, fecha_fin=fin, created_at=_hace(hace),
            )
            db.add(b)
            db.flush()
            return b

        return _hacer

    def test_tres_busquedas_de_la_misma_categoria(self, db, buscar, categoria):
        for _ in range(3):
            buscar(categoria.id, inicio=date(2026, 12, 12), fin=date(2026, 12, 15))

        (c,) = op.demanda_sin_cupo(db, HOY)
        assert c["titulo"] == "3 búsquedas en la web no encontraron Pick-up (12/12–15/12)"
        assert c["entidad_tipo"] == "categoria" and c["entidad_id"] == categoria.id
        assert c["datos"]["accion"] == "Ver bandeja de la web"
        assert c["url_destino"] == "/reservas-web"

    def test_con_dos_no_alcanza_y_las_viejas_no_cuentan(self, db, buscar, categoria):
        buscar(categoria.id)
        buscar(categoria.id)
        buscar(categoria.id, hace=20)
        assert op.demanda_sin_cupo(db, HOY) == []

    def test_si_el_motivo_son_las_reglas_de_venta_manda_a_esa_pantalla(self, db, buscar):
        for _ in range(4):
            buscar(None, motivo="anticipacion")
        buscar(None, motivo="sin_cupo")

        (c,) = op.demanda_sin_cupo(db, HOY)
        assert c["titulo"] == "5 búsquedas en la web quedaron sin resultado"
        assert c["descripcion"].startswith("4 por fecha muy cercana · 1 sin cupo.")
        assert c["url_destino"] == "/canal-web"


# ── 6. Cotización sin cerrar ─────────────────────────────────────────────────

class TestCotizacionSinCerrar:
    @pytest.fixture()
    def cotizar(self, db, usuario):
        from app.models.presupuesto import Presupuesto

        def _hacer(cliente, hace=4, inicio=None, fin=None, total="240000", **extra):
            p = Presupuesto(
                cliente_id=cliente.id if cliente else None,
                fecha_inicio=(inicio or _dia(10)).isoformat(),
                fecha_fin=(fin or _dia(14)).isoformat(),
                dias=4, tarifa_unitaria=Decimal("60000"), descuento=0,
                total=Decimal(total), created_by=usuario.id, created_at=_hace(hace), **extra,
            )
            db.add(p)
            db.flush()
            return p

        return _hacer

    def test_cotizo_hace_4_dias_y_no_reservo(self, db, cotizar, hacer_cliente):
        p = cotizar(hacer_cliente("Pedro Sosa"))
        (c,) = op.cotizacion_sin_cerrar(db, HOY)
        assert c["entidad_tipo"] == "presupuesto" and c["entidad_id"] == p.id
        assert c["titulo"] == "Seguí la cotización de Pedro Sosa: $240.000"
        assert c["datos"]["impacto"] == 240000
        assert "whatsapp" in c["datos"]

    def test_si_despues_reservo_esta_cerrada(self, db, cotizar, hacer_cliente, hacer_auto, reservar):
        cliente = hacer_cliente()
        cotizar(cliente)
        reservar(hacer_auto(), cliente, _dia(10), _dia(14))
        assert op.cotizacion_sin_cerrar(db, HOY) == []

    def test_bordes_de_la_ventana_y_casos_que_no_se_siguen(self, db, cotizar, hacer_cliente):
        cotizar(hacer_cliente("Ayer"), hace=1)            # muy reciente
        cotizar(hacer_cliente("Viejo"), hace=11)          # ya se enfrió
        cotizar(None)                                     # sin cliente: no hay a quién seguir
        cotizar(hacer_cliente("Pasada"), inicio=_dia(-1), fin=_dia(2))   # la fecha ya pasó
        cotizar(hacer_cliente("Aceptada"), estado="aceptado")
        dos = cotizar(hacer_cliente("Dos días"), hace=2)
        diez = cotizar(hacer_cliente("Diez días"), hace=10)

        ids = {c["entidad_id"] for c in op.cotizacion_sin_cerrar(db, HOY)}
        assert ids == {dos.id, diez.id}


# ── 7. Categoría casi completa ───────────────────────────────────────────────

class TestOcupacionAlta:
    def test_todos_los_autos_de_la_categoria_reservados(
        self, db, hacer_auto, hacer_cliente, reservar, categoria,
    ):
        autos = [hacer_auto(categoria_id=categoria.id) for _ in range(2)]
        cliente = hacer_cliente()
        for a in autos:
            reservar(a, cliente, _dia(3), _dia(7))

        (c,) = op.ocupacion_alta(db, HOY)
        assert c["entidad_tipo"] == "categoria" and c["entidad_id"] == categoria.id
        assert c["titulo"] == f"Pick-up completa del {_dia(3).day}/11 al {_dia(6).day}/11"
        assert c["descripcion"].startswith("2 de 2 autos reservados.")
        assert c["url_destino"] == "/precios"

    def test_con_la_mitad_no_y_con_un_solo_auto_tampoco(
        self, db, hacer_auto, hacer_cliente, reservar, categoria,
    ):
        from app.models.categoria import Categoria

        autos = [hacer_auto(categoria_id=categoria.id) for _ in range(2)]
        cliente = hacer_cliente()
        reservar(autos[0], cliente, _dia(3), _dia(7))
        sola = Categoria(codigo="furgon", nombre="Furgón")
        db.add(sola)
        db.flush()
        reservar(hacer_auto(categoria_id=sola.id), cliente, _dia(3), _dia(7))

        assert op.ocupacion_alta(db, HOY) == []

    def test_el_borde_6_de_7_es_85_por_ciento(
        self, db, hacer_auto, hacer_cliente, reservar, categoria,
    ):
        autos = [hacer_auto(categoria_id=categoria.id) for _ in range(7)]
        cliente = hacer_cliente()
        for a in autos[:5]:
            reservar(a, cliente, _dia(2), _dia(3))
        assert op.ocupacion_alta(db, HOY) == []          # 5 de 7 = 71 %
        reservar(autos[5], cliente, _dia(2), _dia(3))
        (c,) = op.ocupacion_alta(db, HOY)                # 6 de 7 = 85,7 %
        assert c["titulo"] == f"Pick-up casi completa el {_dia(2).day}/11"


# ── 8. Pedir la reseña ───────────────────────────────────────────────────────

class TestPedirResena:
    @pytest.fixture()
    def devolver(self, hacer_auto, hacer_cliente, reservar, entregar, hacer_pago):
        def _hacer(nombre, cuando=0, pagado=True):
            cliente = hacer_cliente(nombre)
            r = reservar(hacer_auto(), cliente, _dia(cuando - 4), _dia(cuando), estado="finalizada")
            a = entregar(r, checkin_fecha=_dia(cuando))
            if pagado:
                hacer_pago(cliente_id=cliente.id, monto="100000", alquiler_id=a.id)
            return a

        return _hacer

    def test_un_solo_aviso_con_la_lista_adentro(self, db, devolver):
        devolver("Ana Gómez")
        devolver("Luis Paz", cuando=-1)

        (c,) = op.pedir_resena(db, HOY)
        assert c["titulo"] == "2 clientes devolvieron sin problemas: pediles la reseña en Google"
        assert (c["entidad_tipo"], c["entidad_id"]) == ("resenas", 0)
        assert [x["nombre"] for x in c["datos"]["clientes"]] == ["Ana Gómez", "Luis Paz"]
        # Sin el link cargado, el mensaje pide la reseña pero no incluye ninguno.
        assert "http" not in c["datos"]["clientes"][0]["whatsapp"].split("text=")[1]

    def test_con_el_link_de_google_cargado_va_en_el_mensaje(self, db, devolver):
        from app.models.configuracion import Configuracion

        db.add(Configuracion(
            clave=op.CLAVE_URL_RESENAS, valor="https://g.page/r/ubicar", tipo="string",
            categoria="Oportunidades", descripcion="x",
        ))
        devolver("Ana Gómez")
        db.flush()
        (c,) = op.pedir_resena(db, HOY)
        assert "g.page" in c["datos"]["clientes"][0]["whatsapp"]

    def test_no_se_le_pide_al_que_debe_ni_al_que_devolvio_con_danios_o_multa(
        self, db, devolver, usuario,
    ):
        from app.models.danio import Danio
        from app.models.multa import Multa

        devolver("Debe", pagado=False)
        con_danio = devolver("Rayó")
        db.add(Danio(
            vehiculo_id=con_danio.reserva.vehiculo_id, alquiler_id=con_danio.id,
            momento="checkin", zona="puerta", tipo="rayon",
        ))
        con_multa = devolver("Multado")
        db.add(Multa(
            alquiler_id=con_multa.id, patente="OP001AA",
            fecha_infraccion=_dia(-2), monto=Decimal("50000"),
        ))
        devolver("Anteayer", cuando=-2)
        db.flush()

        assert op.pedir_resena(db, HOY) == []


# ── 9 y 10. Prospectos y Uber ────────────────────────────────────────────────

class TestProspectosSinContactar:
    def _cargar(self, db, cantidad, **extra):
        from app.models.prospecto import Prospecto

        base = db.query(Prospecto).count()
        for i in range(cantidad):
            datos = dict(nombre=f"Empresa {base + i}", email=f"e{base + i}@x.com", estado="nuevo")
            datos.update(extra)
            db.add(Prospecto(**datos))
        db.flush()

    def test_con_20_avisa_y_con_19_no(self, db):
        self._cargar(db, 19)
        assert op.prospectos_sin_contactar(db, HOY) == []
        self._cargar(db, 1)
        (c,) = op.prospectos_sin_contactar(db, HOY)
        assert c["titulo"] == "Tenés 20 empresas listas para escribirles"
        assert c["url_destino"] == "/prospectos"

    def test_no_cuentan_los_sin_mail_los_contactados_ni_los_que_pidieron_que_no(self, db):
        self._cargar(db, 19)
        self._cargar(db, 5, email=None)
        self._cargar(db, 5, estado="contactado")
        self._cargar(db, 5, no_contactar=True)
        assert op.prospectos_sin_contactar(db, HOY) == []


class TestAutoUberLibre:
    def test_auto_de_uber_sin_alquiler_vigente(self, db, hacer_auto, hacer_cliente, reservar):
        libre, con_chofer = hacer_auto(destino="uber"), hacer_auto(destino="uber")
        cliente = hacer_cliente()
        reservar(libre, cliente, _dia(-60), _dia(-30), estado="finalizada",
                 tipo="uber", uber_valor_semana=Decimal("280000"))
        reservar(con_chofer, cliente, _dia(-10), _dia(60), estado="activa", tipo="uber")
        hacer_auto()  # el de alquiler no entra acá

        (c,) = op.auto_uber_libre(db, HOY)
        assert c["tipo"] == "op_auto_uber_libre" and c["entidad_id"] == libre.id
        assert c["datos"]["impacto_label"] == "≈ $280.000 por semana"


# ── El motor ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def motor(db, monkeypatch):
    """El motor con las reglas reemplazadas por listas que el test controla."""
    estado = {"avisos": [], "oportunidades": [], "fallidos": set()}
    monkeypatch.setattr(ns, "evaluar_todas", lambda _db, _hoy: list(estado["avisos"]))
    monkeypatch.setattr(
        ns, "evaluar_oportunidades",
        lambda _db, _hoy: (list(estado["oportunidades"]), set(estado["fallidos"])),
    )

    def correr(dia, oportunidades=(), avisos=(), fallidos=()):
        estado.update(avisos=list(avisos), oportunidades=list(oportunidades), fallidos=set(fallidos))
        r = NotificacionService(db).generar(hoy=dia)
        db.flush()
        return r

    return correr


def _parado(dia, entidad_id=7, dias=12, impacto=600000):
    return {
        "tipo": "op_auto_parado", "titulo": f"Hilux: {dias} días parado",
        "descripcion": f"Hace {dias} días que no sale", "urgencia": "baja",
        "entidad_tipo": "vehiculo", "entidad_id": entidad_id,
        "url_destino": f"/flota/{entidad_id}", "fecha_objetivo": dia,
        "datos": {"impacto": impacto, "impacto_label": "≈ $600.000 sin facturar", "accion": "Ver el auto"},
    }


def _aviso(dia, tipo="checkin_vencido", urgencia="critica", entidad_id=1):
    return {
        "tipo": tipo, "titulo": "Devolución vencida", "descripcion": "d", "urgencia": urgencia,
        "entidad_tipo": "alquiler", "entidad_id": entidad_id,
        "url_destino": "/reservas", "fecha_objetivo": dia,
    }


def _filas(db, tipo="op_auto_parado"):
    return db.query(Notificacion).filter(Notificacion.tipo == tipo).order_by(Notificacion.id).all()


def _abiertas(db, tipo="op_auto_parado"):
    return [n for n in _filas(db, tipo) if n.estado in ns.ESTADOS_ACTIVOS]


HOY_REAL = date.today()


class TestEstadoContinuo:
    def test_una_sola_fila_mientras_siga_parado_con_el_texto_y_el_monto_al_dia(self, db, motor):
        for i in range(5):
            dia = HOY_REAL + timedelta(days=i)
            motor(dia, [_parado(dia, dias=12 + i, impacto=600000 + i * 50000)])

        (n,) = _filas(db)
        assert n.titulo == "Hilux: 16 días parado"
        assert n.datos["impacto"] == 800000

    def test_cuando_deja_de_aplicar_se_resuelve_sola(self, db, motor):
        motor(HOY_REAL, [_parado(HOY_REAL)])
        motor(HOY_REAL + timedelta(days=1), [])
        assert _filas(db)[0].estado == "resuelta"

    def test_no_me_sirve_la_calla_por_tres_semanas_y_despues_vuelve(self, db, motor):
        motor(HOY_REAL, [_parado(HOY_REAL)])
        NotificacionService(db).descartar(_abiertas(db)[0].id)

        # A la semana —el plazo de un aviso común— todavía no.
        for dias in (1, ns.REAVISO_DIAS + 1, op.REAVISO_DIAS_POR_TIPO["op_auto_parado"]):
            dia = HOY_REAL + timedelta(days=dias)
            motor(dia, [_parado(dia)])
            assert _abiertas(db) == [], dias

        dia = HOY_REAL + timedelta(days=op.REAVISO_DIAS_POR_TIPO["op_auto_parado"] + 1)
        motor(dia, [_parado(dia)])
        assert len(_abiertas(db)) == 1

    def test_el_plazo_corre_desde_el_descarte_no_desde_que_nacio(self, db, motor):
        """Un auto que ya llevaba 40 días sugerido: descartarlo hoy lo calla
        desde hoy, aunque la fila sea vieja."""
        motor(HOY_REAL, [_parado(HOY_REAL)])
        (n,) = _abiertas(db)
        n.created_at = datetime.utcnow() - timedelta(days=40)
        NotificacionService(db).descartar(n.id)
        db.flush()

        manana = HOY_REAL + timedelta(days=1)
        motor(manana, [_parado(manana)])
        assert _abiertas(db) == []

    def test_cada_tipo_tiene_su_plazo(self):
        assert ns.reaviso_dias("service_km_vencido") == ns.REAVISO_DIAS == 7
        assert ns.reaviso_dias("op_auto_parado") == 21
        assert ns.reaviso_dias("op_pedir_resena") == 1
        assert op.TIPOS_OPORTUNIDAD <= ns.TIPOS_DE_ESTADO_CONTINUO

    def test_posponer_no_crea_otra(self, db, motor):
        motor(HOY_REAL, [_parado(HOY_REAL)])
        NotificacionService(db).posponer(_abiertas(db)[0].id, datetime.utcnow() + timedelta(days=7))
        manana = HOY_REAL + timedelta(days=1)
        motor(manana, [_parado(manana)])
        assert len(_filas(db)) == 1


class TestUnaReglaQueFallaNoTumbaNada:
    def test_las_demas_reglas_corren_y_se_informa_cual_fallo(self, db):
        def rota(_db, _hoy):
            raise RuntimeError("se rompió")

        def sana(_db, hoy):
            return [_parado(hoy)]

        candidatos, fallidos = op.evaluar_oportunidades(
            db, HOY, reglas=[("op_demanda_sin_cupo", rota), ("op_auto_parado", sana)],
        )
        assert [c["tipo"] for c in candidatos] == ["op_auto_parado"]
        assert fallidos == {"op_demanda_sin_cupo"}

    def test_una_consulta_que_falla_no_deja_la_sesion_inutilizable(self, db, vehiculo):
        from sqlalchemy import text

        def rota(_db, _hoy):
            _db.execute(text("SELECT * FROM una_tabla_que_no_existe"))
            return []

        _, fallidos = op.evaluar_oportunidades(db, HOY, reglas=[("op_auto_parado", rota)])
        assert fallidos == {"op_auto_parado"}
        assert db.query(Vehiculo).count() == 1

    def test_el_motor_sigue_avisando_lo_de_siempre(self, db, monkeypatch):
        def rota(_db, _hoy):
            raise RuntimeError("se rompió")

        monkeypatch.setattr(ns, "evaluar_todas", lambda _db, hoy: [_aviso(hoy)])
        monkeypatch.setattr(op, "REGLAS_OPORTUNIDAD", [("op_auto_parado", rota)])

        r = NotificacionService(db).generar(hoy=HOY_REAL)
        assert r["creadas"] == 1
        assert len(_abiertas(db, "checkin_vencido")) == 1

    def test_lo_que_ya_estaba_sugerido_no_se_resuelve_por_un_fallo(self, db, motor):
        motor(HOY_REAL, [_parado(HOY_REAL)])
        # Hoy la regla no pudo calcularse: no hay candidatos, pero tampoco es
        # cierto que el auto dejó de estar parado.
        motor(HOY_REAL + timedelta(days=1), [], fallidos={"op_auto_parado"})
        assert len(_abiertas(db)) == 1


# ── Endpoints ────────────────────────────────────────────────────────────────

class TestEndpoints:
    @pytest.fixture()
    def cargado(self, db, motor):
        """Dos avisos de la campana y tres oportunidades (una del módulo Uber)."""
        uber = _parado(HOY_REAL, entidad_id=9, impacto=280000)
        uber.update(tipo="op_auto_uber_libre", titulo="Auto de Uber sin chofer")
        sin_monto = _parado(HOY_REAL, entidad_id=3)
        sin_monto.update(tipo="op_ocupacion_alta", entidad_tipo="categoria",
                         titulo="Pick-up casi completa", datos={"accion": "Ver precios"})
        motor(
            HOY_REAL,
            oportunidades=[sin_monto, uber, _parado(HOY_REAL, impacto=600000)],
            avisos=[
                _aviso(HOY_REAL),
                _aviso(HOY_REAL, tipo="echeq_sin_acreditar", urgencia="media", entidad_id=2),
            ],
        )
        db.commit()

    def test_la_campana_no_cuenta_las_oportunidades(self, client, cargado):
        d = client.get(f"{API}/notificaciones").json()["data"]
        assert d["total"] == 2 and d["criticas"] == 1 and d["urgentes"] == 1
        assert {i["tipo"] for i in d["items"]} == {"checkin_vencido", "echeq_sin_acreditar"}
        assert d["por_modulo"] == [
            {"modulo": "operacion", "label": "Operación", "total": 1, "urgentes": 1},
            {"modulo": "cobranzas", "label": "Cobranzas", "total": 1, "urgentes": 0},
        ]

    def test_cada_aviso_trae_su_modulo_y_su_accion(self, client, cargado):
        items = client.get(f"{API}/notificaciones").json()["data"]["items"]
        echeq = next(i for i in items if i["tipo"] == "echeq_sin_acreditar")
        assert (echeq["modulo"], echeq["modulo_label"], echeq["accion"]) == (
            "cobranzas", "Cobranzas", "Marcar acreditado",
        )
        assert echeq["datos"] is None

    def test_filtrar_por_modulo_no_mueve_los_contadores_de_los_otros(self, client, cargado):
        d = client.get(f"{API}/notificaciones", params={"modulo": "cobranzas"}).json()["data"]
        assert [i["tipo"] for i in d["items"]] == ["echeq_sin_acreditar"]
        assert d["total"] == 1 and d["urgentes"] == 0
        assert [m["modulo"] for m in d["por_modulo"]] == ["operacion", "cobranzas"]

        varios = client.get(f"{API}/notificaciones", params={"modulo": "cobranzas,operacion"}).json()["data"]
        assert varios["total"] == 2

    def test_pidiendo_el_modulo_oportunidades_si_vienen(self, client, cargado):
        d = client.get(f"{API}/notificaciones", params={"modulo": "oportunidades"}).json()["data"]
        assert {i["tipo"] for i in d["items"]} == {"op_auto_parado", "op_ocupacion_alta"}

    def test_oportunidades_ordenadas_por_impacto_con_el_total(self, client, cargado):
        d = client.get(f"{API}/oportunidades").json()["data"]
        assert [i["tipo"] for i in d["items"]] == [
            "op_auto_parado", "op_auto_uber_libre", "op_ocupacion_alta",
        ]
        assert d["total"] == 3 and d["impacto_total"] == 880000
        primera = d["items"][0]
        assert primera["modulo"] == "oportunidades" and primera["accion"] == "Ver el auto"
        assert primera["datos"]["impacto_label"] == "≈ $600.000 sin facturar"
        assert d["items"][1]["modulo"] == "uber"

    def test_leer_posponer_y_descartar_las_sacan_de_la_lista(self, client, cargado):
        ids = [i["id"] for i in client.get(f"{API}/oportunidades").json()["data"]["items"]]
        assert client.post(f"{API}/notificaciones/{ids[0]}/leer").status_code == 200
        hasta = (datetime.utcnow() + timedelta(days=7)).isoformat()
        assert client.post(f"{API}/notificaciones/{ids[1]}/posponer", json={"hasta": hasta}).status_code == 200
        assert client.post(f"{API}/notificaciones/{ids[2]}/descartar").status_code == 200

        d = client.get(f"{API}/oportunidades").json()["data"]
        assert d["total"] == 0 and d["impacto_total"] == 0

    def test_leer_todas_de_un_modulo_y_despues_todo(self, client, cargado):
        r = client.post(f"{API}/notificaciones/leer-todas", json={"modulo": "cobranzas"})
        assert r.json()["data"] == {"marcadas": 1}
        d = client.get(f"{API}/notificaciones").json()["data"]
        assert [i["tipo"] for i in d["items"]] == ["checkin_vencido"]

        assert client.post(f"{API}/notificaciones/leer-todas").json()["data"] == {"marcadas": 1}
        assert client.get(f"{API}/notificaciones").json()["data"]["total"] == 0
        # "Leer todo" es de la campana: las oportunidades siguen donde estaban.
        assert client.get(f"{API}/oportunidades").json()["data"]["total"] == 3

    def test_el_acuse_es_de_quien_lo_hace(self, db, client, cargado):
        from app.models.usuario import Usuario

        client.post(f"{API}/notificaciones/leer-todas")
        otro = Usuario(email="otro@ubicarrent.test", nombre="Otro", rol="admin", auth_sub="test:otro")
        db.add(otro)
        db.flush()
        assert len(NotificacionService(db).list_activas(usuario_id=otro.id)) == 2

    def test_el_historial_filtra_por_modulo(self, client, cargado):
        r = client.get(f"{API}/notificaciones/historial",
                       params={"solo_resueltas": False, "modulo": "uber"}).json()
        assert [i["tipo"] for i in r["data"]] == ["op_auto_uber_libre"]

    def test_generar_corre_tambien_las_oportunidades(self, client, db, hacer_auto):
        hacer_auto(dias_de_alta=40)
        db.commit()
        assert client.post(f"{API}/notificaciones/generar").status_code == 200
        d = client.get(f"{API}/oportunidades").json()["data"]
        assert [i["tipo"] for i in d["items"]] == ["op_auto_parado"]
        # La campana puede tener lo suyo (al auto le falta la categoría), pero
        # ninguna oportunidad.
        campana = client.get(f"{API}/notificaciones").json()["data"]["items"]
        assert not [i for i in campana if i["tipo"].startswith("op_")]
