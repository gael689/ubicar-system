"""
Pedidos del mostrador sobre la reserva y su PDF (plan 27/09, A1 y A2).

- "Pagado" es todo lo que la reserva cobra —auto más adicionales—, no sólo el
  precio del auto (txt 14).
- El motivo de un precio menor se pide con un mensaje corto y sin montos
  crudos, y una diferencia de centavos no es un descuento (txt 23).
- El PDF de la reserva no imprime "Período facturado", ni "Anticipo abonado"
  ni "Saldo pendiente"; de la categoría, un solo modelo "o similar"; y la
  aclaración libre de la condición de pago (txt 6, 7, 10, 13, 14).
- El PDF archivado en la ficha se rehace al editar, en vez de quedar con los
  datos del alta.
- La devolución una hora o más después del horario de retiro se cobra como
  un día más, sin tilde de late check-in (A1).
"""
from datetime import date, time
from decimal import Decimal
from io import BytesIO

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.adicional import Adicional
from app.models.categoria import Categoria
from app.models.documento import Documento
from app.models.reserva import Reserva
from app.models.tarifa import Tarifa
from app.services.reserva_documento_service import ReservaDocumentoService
from app.services.reserva_service import ReservaService

pypdf = pytest.importorskip("pypdf")

from app.services.reserva_pdf import generar_pdf_reserva  # noqa: E402


def _crear(db, cliente, usuario, vehiculo, **extra):
    kwargs = dict(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 5),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="Precio pactado",
        usuario_id=usuario.id,
    )
    kwargs.update(extra)
    reserva, _ = ReservaService(db).create(**kwargs)
    db.flush()
    return reserva


def _texto(reserva, cliente, vehiculo) -> str:
    crudo = generar_pdf_reserva(reserva, cliente=cliente, vehiculo=vehiculo)
    lector = pypdf.PdfReader(BytesIO(crudo))
    return "\n".join(p.extract_text() or "" for p in lector.pages)


@pytest.fixture()
def gps(db):
    a = Adicional(
        codigo="gps", nombre="GPS", grupo="extra", precio=Decimal("5000"),
        unidad_cobro="unico", activo=True,
    )
    db.add(a)
    db.flush()
    return a


@pytest.fixture()
def tarifa_diaria(db, vehiculo):
    t = Tarifa(
        tipo="diaria", monto=Decimal("10000"), vehiculo_id=vehiculo.id, activo=True,
    )
    db.add(t)
    db.flush()
    return t


class TestPagadoEsElTotal:
    def test_al_crear_incluye_los_adicionales(self, db, cliente, usuario, vehiculo, gps):
        """
        La pantalla mandaba como anticipo sólo el precio del auto: la reserva
        quedaba "pagada" y con el GPS pendiente para siempre.
        """
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            adicionales=[(gps.id, 1)],
            estado_pago="pagado",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 9, 27),
            anticipo_medio_pago="efectivo",
        )
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("105000")
        assert ReservaService(db).saldo_pendiente(reserva) == 0

    def test_al_editar_a_pagado_tambien(self, db, cliente, usuario, vehiculo, gps):
        reserva = _crear(db, cliente, usuario, vehiculo, adicionales=[(gps.id, 1)])
        reserva, _ = ReservaService(db).update(
            reserva.id, usuario.id, estado_pago="pagado", anticipo_monto=Decimal("100000"),
        )
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("105000")

    def test_una_sena_parcial_no_se_toca(self, db, cliente, usuario, vehiculo, gps):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            adicionales=[(gps.id, 1)],
            estado_pago="anticipo",
            anticipo_monto=Decimal("30000"),
            anticipo_medio_pago="efectivo",
        )
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("30000")


class TestMotivoDelDescuento:
    def test_el_mensaje_es_corto_y_sin_montos(
        self, db, cliente, usuario, vehiculo, tarifa_diaria
    ):
        with pytest.raises(BusinessRuleError) as e:
            _crear(
                db, cliente, usuario, vehiculo,
                precio_total=Decimal("30000"), descuento_motivo=None,
            )
        assert e.value.rule == "descuento_sin_motivo"
        assert str(e.value) == "[descuento_sin_motivo] El precio es menor al de lista: indicá el motivo."

    def test_centavos_de_diferencia_no_son_un_descuento(
        self, db, cliente, usuario, vehiculo, tarifa_diaria
    ):
        # Lista: 4 días × $10.000 = $40.000.
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            precio_total=Decimal("39999.50"), descuento_motivo=None,
        )
        assert reserva.descuento_autorizado_por is None


class TestElDiaExtraPorHorario:
    def test_devolver_dos_horas_despues_cobra_un_dia_mas(
        self, db, cliente, usuario, vehiculo, tarifa_diaria
    ):
        """Sin tilde de late check-in: el precio de lista ya lo trae."""
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            hora_fin=time(12, 0), precio_total=None, descuento_motivo=None,
        )
        assert Decimal(str(reserva.precio_lista)) == Decimal("50000")
        assert Decimal(str(reserva.precio_total)) == Decimal("50000")
        assert reserva.late_checkout is False
        assert Decimal(str(reserva.cargo_late_checkout)) == 0

    def test_dentro_de_la_hora_no(self, db, cliente, usuario, vehiculo, tarifa_diaria):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            hora_fin=time(10, 45), precio_total=None, descuento_motivo=None,
        )
        assert Decimal(str(reserva.precio_lista)) == Decimal("40000")


class TestElPdfDeLaReserva:
    def test_sin_anticipo_ni_saldo_ni_periodo_facturado(self, db, cliente, usuario, vehiculo):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="anticipo",
            anticipo_monto=Decimal("30000"),
            anticipo_medio_pago="efectivo",
            fecha_devolucion_acordada=date(2026, 10, 6),
            hora_devolucion_acordada=time(8, 30),
        )
        pdf = _texto(reserva, cliente, vehiculo)
        # "Anticipo abonado" queda una sola vez: es el estado del recuadro,
        # no la fila con el monto.
        assert pdf.count("Anticipo abonado") == 1
        assert "Saldo pendiente" not in pdf
        assert "Período facturado" not in pdf
        # El estado sigue en el recuadro del total.
        assert "ESTADO" in pdf

    def test_pagado_no_dice_pendiente(self, db, cliente, usuario, vehiculo):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("100000"),
            anticipo_medio_pago="efectivo",
        )
        pdf = _texto(reserva, cliente, vehiculo)
        assert "pendiente" not in pdf.lower()

    def test_un_solo_modelo_o_similar(self, db, cliente, usuario):
        cat = Categoria(
            codigo="COMP", nombre="Compacto", ejemplo_modelos="Fiat Cronos, Chevrolet Onix, Peugeot 208",
        )
        db.add(cat)
        db.flush()
        reserva = Reserva(
            categoria_id=cat.id, cliente_id=cliente.id,
            fecha_inicio=date(2026, 10, 1), hora_inicio=time(10, 0),
            fecha_fin=date(2026, 10, 5), hora_fin=time(10, 0),
            lugar_entrega="Local", lugar_devolucion="Local",
            estado="confirmada", usuario_id=usuario.id, precio_total=Decimal("100000"),
        )
        db.add(reserva)
        db.flush()
        pdf = _texto(reserva, cliente, None)
        assert "Fiat Cronos o similar" in pdf
        assert "Onix" not in pdf

    def test_imprime_la_aclaracion_de_la_condicion_de_pago(
        self, db, cliente, usuario, vehiculo
    ):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            condicion_pago_texto="Paga la empresa contra factura",
        )
        assert reserva.condicion_pago_texto == "Paga la empresa contra factura"
        pdf = _texto(reserva, cliente, vehiculo)
        assert "Paga la empresa contra factura" in pdf

    def test_la_aclaracion_se_edita_y_se_borra(self, db, cliente, usuario, vehiculo):
        reserva = _crear(db, cliente, usuario, vehiculo, condicion_pago_texto="Algo")
        svc = ReservaService(db)
        reserva, _ = svc.update(reserva.id, usuario.id, condicion_pago_texto="Otra cosa")
        assert reserva.condicion_pago_texto == "Otra cosa"
        reserva, _ = svc.update(reserva.id, usuario.id, condicion_pago_texto="")
        assert reserva.condicion_pago_texto is None


class StorageEnMemoria:
    def __init__(self):
        self.archivos: dict[str, bytes] = {}

    def upload(self, key, content, content_type):
        self.archivos[key] = content
        return key

    def read(self, key):
        return self.archivos[key]

    def delete(self, key):
        self.archivos.pop(key, None)

    def public_url(self, key):
        return f"/static/{key}"


class TestElPdfArchivadoSeRehace:
    def test_reemplaza_el_archivado_en_vez_de_agregar(self, db, cliente, usuario, vehiculo):
        storage = StorageEnMemoria()
        svc = ReservaDocumentoService(db, storage)
        reserva = _crear(db, cliente, usuario, vehiculo)
        primero = svc.generar_y_archivar(reserva, usuario.id)
        key_vieja = primero.archivo_key

        otro = svc.regenerar_archivado(reserva, usuario.id)

        docs = db.query(Documento).filter_by(cliente_id=cliente.id, tipo="reserva").all()
        assert len(docs) == 1
        assert otro.id == primero.id
        assert otro.archivo_key != key_vieja
        assert key_vieja not in storage.archivos, "el archivo viejo queda huérfano"
        assert otro.archivo_key in storage.archivos

    def test_no_confunde_la_reserva_1_con_la_12(self, db, cliente, usuario, vehiculo):
        storage = StorageEnMemoria()
        svc = ReservaDocumentoService(db, storage)
        reserva = _crear(db, cliente, usuario, vehiculo)
        ajeno = Documento(
            cliente_id=cliente.id, tipo="reserva", nombre="otra",
            archivo_key=f"clientes/{cliente.id}/reservas/{reserva.id}0-abc.pdf",
            cargado_por=usuario.id,
        )
        db.add(ajeno)
        db.flush()
        assert svc._archivado(reserva) is None

    def test_sin_archivado_previo_y_sin_crear_no_inventa(self, db, cliente, usuario, vehiculo):
        svc = ReservaDocumentoService(db, StorageEnMemoria())
        reserva = _crear(db, cliente, usuario, vehiculo)
        assert svc.regenerar_archivado(reserva, usuario.id, crear_si_falta=False) is None
        assert db.query(Documento).filter_by(tipo="reserva").count() == 0
