"""
El semáforo previo a la entrega, sobre datos sueltos.

**Un solo criterio, dos puertas.** `evaluar_pre_checkout` evalúa una reserva
guardada; el formulario de alta necesita lo mismo *antes* de guardar, que es
cuando todavía se puede corregir. Hasta ahora esa segunda lista la armaba el
frontend a mano, y dos listas que dicen parecido son dos listas que en algún
momento dicen distinto.

`evaluar_datos_pre_checkout` es el criterio, y `evaluar_pre_checkout` pasó a
ser un caso particular suyo. Lo que estos tests fijan es que la severidad no se
corra: sólo el auto fuera de servicio, la VTV/póliza vencida, el solape y la
cuenta bloqueada son **bloqueantes**; el resto informa y se puede guardar igual
("el sistema informa, la persona decide").
"""
from datetime import date, timedelta
from types import SimpleNamespace

from app.domain.bloqueos import evaluar_datos_pre_checkout

HOY = date(2026, 8, 20)
AYER = HOY - timedelta(days=1)
MANANA = HOY + timedelta(days=1)


class DbSinCuentas:
    """
    Doble mínimo: el único uso de `db` en el semáforo es buscar la cuenta
    corriente del cliente. Sin cuenta, no hay ítem de deuda.
    """
    def query(self, *_):
        return self

    def filter(self, *_):
        return self

    def first(self):
        return None


def _vehiculo(**kw):
    base = dict(estado="disponible", vtv_vencimiento=MANANA, poliza_vencimiento=MANANA)
    return SimpleNamespace(**{**base, **kw})


def _cliente(**kw):
    base = dict(id=1, nombre_completo="Juan Pérez", licencia_vencimiento=MANANA)
    return SimpleNamespace(**{**base, **kw})


def _evaluar(**kw):
    return evaluar_datos_pre_checkout(DbSinCuentas(), hoy=HOY, **kw)


def _codigos(items):
    return {i.codigo for i in items}


class TestVerde:
    def test_todo_en_orden_da_verde(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(), cliente=_cliente(), garantia_tipo="tarjeta",
        )
        assert semaforo == "verde"
        assert items == []


class TestLoQueBloquea:
    def test_vehiculo_fuera_de_servicio(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(estado="fuera_de_servicio"),
            cliente=_cliente(), garantia_tipo="tarjeta",
        )
        assert semaforo == "rojo"
        assert "vehiculo_fuera_servicio" in _codigos(items)

    def test_vtv_vencida(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(vtv_vencimiento=AYER),
            cliente=_cliente(), garantia_tipo="tarjeta",
        )
        assert semaforo == "rojo"
        assert "vtv_vencida" in _codigos(items)

    def test_poliza_vencida(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(poliza_vencimiento=AYER),
            cliente=_cliente(), garantia_tipo="tarjeta",
        )
        assert semaforo == "rojo"
        assert "poliza_vencida" in _codigos(items)

    def test_solape_pendiente(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(), cliente=_cliente(), garantia_tipo="tarjeta",
            bloqueada_por_solape=True,
        )
        assert semaforo == "rojo"
        assert "solape_pendiente" in _codigos(items)


class TestLoQueSoloAvisa:
    def test_sin_garantia_avisa_pero_deja_seguir(self):
        semaforo, items = _evaluar(vehiculo=_vehiculo(), cliente=_cliente())
        assert semaforo == "amarillo"
        assert "sin_garantia" in _codigos(items)

    def test_no_aplica_es_lo_mismo_que_sin_definir(self):
        """
        `no_aplica` es el valor con el que arranca el formulario y la etiqueta
        que se ve dice "Sin garantía". El resto del sistema ya los trata igual
        (la plantilla del mail de check-out esconde la fila en los dos casos),
        así que el semáforo no puede decir otra cosa.
        """
        _, items = _evaluar(
            vehiculo=_vehiculo(), cliente=_cliente(), garantia_tipo="no_aplica",
        )
        assert "sin_garantia" in _codigos(items)

    def test_licencia_vencida_del_cliente(self):
        semaforo, items = _evaluar(
            vehiculo=_vehiculo(),
            cliente=_cliente(licencia_vencimiento=AYER),
            garantia_tipo="tarjeta",
        )
        assert semaforo == "amarillo"
        assert "licencia_vencida" in _codigos(items)

    def test_manda_la_licencia_del_conductor_designado(self):
        """Si maneja otro, el riesgo es el suyo — igual que en el check-out."""
        _, items = _evaluar(
            vehiculo=_vehiculo(),
            cliente=_cliente(licencia_vencimiento=AYER),
            conductor=SimpleNamespace(
                nombre_completo="Ana Gómez", licencia_vencimiento=MANANA
            ),
            garantia_tipo="tarjeta",
        )
        assert "licencia_vencida" not in _codigos(items)


class TestElAltaTodaviaNoTieneContrato:
    def test_sin_alquiler_no_reclama_la_firma(self):
        """
        `contrato_firmado=None` es "todavía no hay alquiler". Reclamar una firma
        que no puede existir sería ruido en la pantalla donde menos sobra.
        """
        _, items = _evaluar(
            vehiculo=_vehiculo(), cliente=_cliente(), garantia_tipo="tarjeta",
            contrato_firmado=None,
        )
        assert "contrato_no_firmado" not in _codigos(items)

    def test_con_alquiler_sin_firmar_si_lo_reclama(self):
        _, items = _evaluar(
            vehiculo=_vehiculo(), cliente=_cliente(), garantia_tipo="tarjeta",
            contrato_firmado=False,
        )
        assert "contrato_no_firmado" in _codigos(items)


class TestSinAutoElegido:
    def test_reservar_por_categoria_no_evalua_el_vehiculo(self):
        """
        Reservar sin auto es válido (D-02). El semáforo no puede inventar
        problemas de un auto que todavía no se eligió.
        """
        semaforo, items = _evaluar(cliente=_cliente(), garantia_tipo="tarjeta")
        assert semaforo == "verde"
        assert items == []
