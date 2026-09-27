"""
Reservas fantasma: una reserva sin check-out no es un auto en la calle.

El reloj pasaba a `activa` toda reserva confirmada apenas llegaba la hora de
retiro, saliera o no el auto. El calendario la mostraba ocupando la unidad, el
aviso de check-out pendiente se apagaba, y pasada la devolución quedaba
`vencida`: "no volvió" un auto que nunca se fue.

Y el script de limpieza (`scripts/limpiar_reservas_sin_contrato.py`) que
cancela —no borra— las que quedaron colgadas, sin tocar las que tienen plata.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.reserva import Reserva
from app.services.reserva_service import ReservaService
from scripts import limpiar_reservas_sin_contrato as limpieza

HOY = date.today()


def _estado(db, reserva):
    db.expire_all()
    return db.get(Reserva, reserva.id).estado


class TestElRelojNoInventaEntregas:
    def test_sin_check_out_sigue_confirmada(self, db, hacer_reserva):
        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=1),
                          fecha_fin=HOY + timedelta(days=2))
        ReservaService(db).sincronizar_estados_por_horario()
        assert _estado(db, r) == "confirmada"

    def test_con_check_out_pasa_a_activa(self, db, hacer_reserva, hacer_alquiler):
        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=1),
                          fecha_fin=HOY + timedelta(days=2))
        hacer_alquiler(r, checkout_fecha=HOY - timedelta(days=1))
        ReservaService(db).sincronizar_estados_por_horario()
        assert _estado(db, r) == "activa"

    def test_vencida_solo_si_el_auto_salio(self, db, hacer_reserva, hacer_alquiler):
        salio = hacer_reserva(estado="activa", fecha_inicio=HOY - timedelta(days=5),
                              fecha_fin=HOY - timedelta(days=1))
        hacer_alquiler(salio, checkout_fecha=HOY - timedelta(days=5))
        fantasma = hacer_reserva(estado="activa", fecha_inicio=HOY - timedelta(days=5),
                                 fecha_fin=HOY - timedelta(days=1))
        ReservaService(db).sincronizar_estados_por_horario()
        assert _estado(db, salio) == "vencida"
        # La fantasma no avanza: la levanta el script de limpieza.
        assert _estado(db, fantasma) == "activa"

    def test_el_aviso_de_check_out_pendiente_sigue_sonando(self, db, hacer_reserva):
        from app.domain.notificaciones_reglas import checkout_pendiente

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=1),
                          fecha_fin=HOY + timedelta(days=2))
        ReservaService(db).sincronizar_estados_por_horario()
        assert [c["entidad_id"] for c in checkout_pendiente(db, HOY)] == [r.id]


class TestLaLimpieza:
    def _ids(self, lista):
        return sorted(r.id for r in lista)

    def test_elige_las_terminadas_sin_contrato_ni_alquiler(self, db, hacer_reserva, hacer_alquiler):
        pasada = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                               fecha_fin=HOY - timedelta(days=8))
        fantasma = hacer_reserva(estado="activa", fecha_inicio=HOY - timedelta(days=10),
                                 fecha_fin=HOY - timedelta(days=8))
        # No: todavía no terminó.
        hacer_reserva(estado="confirmada", fecha_inicio=HOY + timedelta(days=1),
                      fecha_fin=HOY + timedelta(days=3))
        # No: el auto salió.
        con_alquiler = hacer_reserva(estado="vencida", fecha_inicio=HOY - timedelta(days=10),
                                     fecha_fin=HOY - timedelta(days=8))
        hacer_alquiler(con_alquiler, checkout_fecha=HOY - timedelta(days=10))
        # No: ya cerrada.
        hacer_reserva(estado="finalizada", fecha_inicio=HOY - timedelta(days=10),
                      fecha_fin=HOY - timedelta(days=8))

        sel = limpieza.seleccionar(db, HOY)
        assert self._ids(sel.a_cancelar) == sorted([pasada.id, fantasma.id])
        assert sel.con_plata == []

    def test_una_con_contrato_no_se_toca(self, db, hacer_reserva):
        from app.models.contrato import Contrato

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        db.add(Contrato(reserva_id=r.id))
        db.flush()
        assert limpieza.seleccionar(db, HOY).a_cancelar == []

    def test_un_contrato_anulado_no_la_salva(self, db, hacer_reserva):
        from app.models.contrato import Contrato

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        db.add(Contrato(reserva_id=r.id, anulado=True))
        db.flush()
        assert self._ids(limpieza.seleccionar(db, HOY).a_cancelar) == [r.id]

    def test_las_web_colgadas_segun_antiguedad(self, db, hacer_reserva):
        vieja = hacer_reserva(estado="sin_disponibilidad", origen="web",
                              fecha_inicio=HOY + timedelta(days=20), fecha_fin=HOY + timedelta(days=22),
                              created_at=datetime.now() - timedelta(days=10))
        hacer_reserva(estado="pendiente_pago", origen="web",
                      fecha_inicio=HOY + timedelta(days=20), fecha_fin=HOY + timedelta(days=22),
                      created_at=datetime.now() - timedelta(days=2))
        assert self._ids(limpieza.seleccionar(db, HOY, dias_web=7).a_cancelar) == [vieja.id]
        assert len(limpieza.seleccionar(db, HOY, dias_web=1).a_cancelar) == 2

    def test_las_que_tienen_plata_van_aparte(self, db, hacer_reserva, cliente, usuario):
        from app.models.pago import Pago

        con_pago = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                                 fecha_fin=HOY - timedelta(days=8))
        db.add(Pago(cliente_id=cliente.id, reserva_id=con_pago.id, monto=Decimal("5000"),
                    medio_pago="efectivo", fecha=HOY, cobrado_por=usuario.id))
        con_sena = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                                 fecha_fin=HOY - timedelta(days=8), anticipo_monto=Decimal("1000"))
        pago_anulado = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                                     fecha_fin=HOY - timedelta(days=8))
        db.add(Pago(cliente_id=cliente.id, reserva_id=pago_anulado.id, monto=Decimal("5000"),
                    medio_pago="efectivo", fecha=HOY, cobrado_por=usuario.id, anulado=True))
        db.flush()

        sel = limpieza.seleccionar(db, HOY)
        assert self._ids(sel.a_cancelar) == [pago_anulado.id]
        plata = {r.id: motivos for r, motivos in sel.con_plata}
        assert plata == {con_pago.id: ["pagos"], con_sena.id: ["seña anotada en la reserva"]}

    def test_cancelar_no_borra_y_deja_el_motivo(self, db, hacer_reserva):
        from app.models.notificacion import Notificacion
        from app.services.notificacion_service import NotificacionService

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        NotificacionService(db).generar_una({
            "tipo": "reserva_web_nueva", "titulo": "t", "descripcion": "d", "urgencia": "alta",
            "entidad_tipo": "reserva", "entidad_id": r.id, "url_destino": "/x",
            "fecha_objetivo": r.fecha_inicio,
        })

        assert limpieza.cancelar(db, limpieza.seleccionar(db, HOY).a_cancelar) == 1

        db.expire_all()
        r = db.get(Reserva, r.id)
        assert r is not None
        assert r.estado == "cancelada"
        assert r.motivo_cancelacion == limpieza.MOTIVO
        assert db.query(Notificacion).filter(Notificacion.entidad_id == r.id).one().estado == "resuelta"
        # Idempotente: una segunda pasada no encuentra nada.
        assert limpieza.seleccionar(db, HOY).a_cancelar == []
