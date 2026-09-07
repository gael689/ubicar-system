"""
El medio día que se vende para la mañana siguiente se cobra.

**El caso, con las palabras de Franco.** Alquiler del 04 al 06, retiro a las
16:30. El Ruso le vendió medio día más, así que el auto vuelve el **07 a las
08:30**:

> *"Si pongo alquiler del 04 a 07 no puedo poner que acordé con el cliente que
> lo devuelve antes. Y si pongo alquiler del 04 a 06 y le pongo late check-in a
> las 8:30, el sistema piensa que son las 8:30 del mismo día que devuelve —
> entonces ese 'late' sería antes de las 16:30 para el sistema, en lugar de
> entender que lo devuelve a las 8:30 del día siguiente."*

Tenía razón, y era peor de lo que se veía. `hora_devolucion_acordada` era un
`Time` suelto y los dos únicos lugares que lo usaban lo combinaban con
`fecha_fin`. La resta contra el check-in real daba **negativa**,
`domain/control_24hs.py` la tomaba como dentro de los 40 minutos de gracia, y
devolvía cargo cero. **El excedente no se cobraba y nada avisaba.**

La migración 092 agregó `fecha_devolucion_acordada`. Estos tests fijan las dos
mitades: que la devolución del día siguiente se entiende, y que la de "lo trae
antes" —que tampoco se podía escribir— también.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.services.alquiler_service import AlquilerService, _devolucion_acordada
from app.services.reserva_service import ReservaService

# El caso real: retiro el 04 a las 16:30, período facturado hasta el 06.
INICIO = date(2026, 9, 4)
FIN = date(2026, 9, 6)
RETIRO = time(16, 30)


@pytest.fixture
def reserva_del_ruso(db, cliente, usuario, vehiculo):
    """La reserva del caso: 04 → 06, y devolución acordada el 07 a las 08:30."""
    def _hacer(**extra):
        kwargs = dict(
            cliente_id=cliente.id,
            vehiculo_id=vehiculo.id,
            fecha_inicio=INICIO,
            hora_inicio=RETIRO,
            fecha_fin=FIN,
            hora_fin=RETIRO,
            lugar_entrega="Paraguay 241",
            lugar_devolucion="Paraguay 241",
            precio_total=Decimal("200000"),
            descuento_motivo="Precio pactado",
            usuario_id=usuario.id,
        )
        kwargs.update(extra)
        reserva, _ = ReservaService(db).create(**kwargs)
        db.flush()
        return reserva
    return _hacer


class TestLaDevolucionAcordada:
    def test_sin_acuerdo_es_el_fin_del_periodo_a_la_hora_del_retiro(self, reserva_del_ruso):
        """La regla de siempre (D-18) no cambia: es el default."""
        reserva = reserva_del_ruso()
        assert _devolucion_acordada(reserva).isoformat() == "2026-09-06T16:30:00"

    def test_al_dia_siguiente_se_entiende_como_el_dia_siguiente(self, reserva_del_ruso):
        """
        **El bug.** Sin fecha, esto daba 2026-09-06T08:30 — ocho horas *antes*
        del horario pactado.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
            cargo_late_checkout=Decimal("25000"),
        )
        assert _devolucion_acordada(reserva).isoformat() == "2026-09-07T08:30:00"

    def test_tambien_admite_que_lo_traiga_antes(self, reserva_del_ruso):
        """
        La otra mitad del reporte: *"no puedo poner que acordé con el cliente
        que lo devuelve antes"*. Ahora sí, y sin cargo.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 6),
            hora_devolucion_acordada=time(9, 0),
        )
        assert _devolucion_acordada(reserva).isoformat() == "2026-09-06T09:00:00"


class TestElExcedenteContraLaDevolucionAcordada:
    def _activa(self, db, usuario, vehiculo, reserva):
        AlquilerService(db).checkout(
            reserva_id=reserva.id,
            checkout_fecha=INICIO,
            checkout_hora=RETIRO,
            checkout_km=vehiculo.km_actual,
            checkout_combustible=100,
            checkout_descripcion=None,
            usuario_id=usuario.id,
            motivo_sin_contrato="Se firma en el mostrador",
        )
        db.flush()
        return reserva.alquiler

    def test_llegar_puntual_a_la_manana_siguiente_no_genera_excedente(
        self, db, usuario, vehiculo, reserva_del_ruso
    ):
        """
        Devuelve el 07 a las 08:30, que es exactamente lo pactado. El medio día
        ya se cobró como `cargo_late_checkout`; el excedente es cero.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
            cargo_late_checkout=Decimal("25000"),
        )
        alquiler = self._activa(db, usuario, vehiculo, reserva)

        resultado = AlquilerService(db).preview_excedente(
            alquiler.id, date(2026, 9, 7), time(8, 30)
        )
        assert resultado.dentro_de_gracia
        assert resultado.cargo_sugerido == Decimal("0")

    def test_llegar_tarde_a_la_manana_siguiente_si_lo_cobra(
        self, db, usuario, vehiculo, reserva_del_ruso
    ):
        """
        **Lo que antes no se cobraba nunca.** Con la hora sola, el punto cero
        era el 06 a las 08:30, así que un check-in el 07 a las 13:00 daba 28
        horas de excedente… o cero, según de qué lado cayera la resta. Ahora el
        punto cero es el 07 a las 08:30 y las cuatro horas y media se cobran.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
            cargo_late_checkout=Decimal("25000"),
        )
        alquiler = self._activa(db, usuario, vehiculo, reserva)

        resultado = AlquilerService(db).preview_excedente(
            alquiler.id, date(2026, 9, 7), time(13, 0)
        )
        assert not resultado.dentro_de_gracia
        # 4h30 menos los 40 minutos de gracia = 3h50 → 3 horas enteras.
        assert resultado.horas_excedidas == 3
        assert resultado.cargo_sugerido > 0

    def test_devolver_el_dia_de_fin_ya_no_se_lee_como_adelanto(
        self, db, usuario, vehiculo, reserva_del_ruso
    ):
        """
        La contracara del bug: traerlo el **06** cuando se pactó el 07 es
        adelantarse casi un día, y eso no cobra nada. Lo que importa es que ya
        no se confunde con lo otro.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
        )
        alquiler = self._activa(db, usuario, vehiculo, reserva)

        resultado = AlquilerService(db).preview_excedente(
            alquiler.id, date(2026, 9, 6), time(16, 30)
        )
        assert resultado.dentro_de_gracia
        assert resultado.cargo_sugerido == Decimal("0")


class TestElContratoLoImprimeBien:
    def test_el_check_in_del_anverso_usa_la_fecha_acordada(
        self, db, usuario, vehiculo, reserva_del_ruso
    ):
        """
        El anverso decía `fecha_fin` con la hora acordada: el 06 a las 08:30,
        o sea una devolución **anterior** al retiro de ese mismo día. El papel
        que el cliente firma no puede decir algo imposible.
        """
        from app.services.contrato_service import ContratoService

        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
        )
        servicio = ContratoService(db).preparar(reserva.id)["servicio"]

        assert servicio["check_in_fecha"] == "2026-09-07"
        assert servicio["check_in_hora"] == "08:30"


class TestExtenderReacomodaLaDevolucion:
    def test_extender_mueve_tambien_la_devolucion_acordada(
        self, db, usuario, vehiculo, reserva_del_ruso
    ):
        """
        `extender()` movía `fecha_fin` y dejaba la devolución acordada donde
        estaba, así que el punto cero del excedente quedaba en un día que ya
        pasó y el check-in cobraba horas que nadie usó.
        """
        reserva = reserva_del_ruso(
            late_checkout=True,
            fecha_devolucion_acordada=date(2026, 9, 7),
            hora_devolucion_acordada=time(8, 30),
        )
        svc = AlquilerService(db)
        svc.checkout(
            reserva_id=reserva.id,
            checkout_fecha=INICIO,
            checkout_hora=RETIRO,
            checkout_km=vehiculo.km_actual,
            checkout_combustible=100,
            checkout_descripcion=None,
            usuario_id=usuario.id,
            motivo_sin_contrato="Se firma en el mostrador",
        )
        db.flush()

        svc.extender(
            alquiler_id=reserva.alquiler.id,
            nueva_fecha_fin=date(2026, 9, 10),
            nueva_hora_fin=time(16, 30),
            precio_manual=Decimal("300000"),
            usuario_id=usuario.id,
        )
        db.flush()
        db.refresh(reserva)

        assert _devolucion_acordada(reserva).isoformat() == "2026-09-10T16:30:00"
