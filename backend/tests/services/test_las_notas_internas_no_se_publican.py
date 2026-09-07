"""
Lo que se escribe en "Notas internas" no le llega al cliente.

**El reporte, textual:**

> *"Este cartel dice 'Notas internas'… pero le llega al cliente en la
> confirmación de reserva. Peligroso. Porque por ahí en la nota interna pongo
> 'al brasilero no se le entiende, que lo atienda Franco', o en este caso
> específico 'le cobramos de más porque medio día' — y cuando Martín lo vendió le
> dijo 'traelo al otro día, no pasa nada'."*

`reserva_pdf` imprimía `Reserva.notas` bajo el título "OBSERVACIONES", y ese PDF
viaja **adjunto al mail de confirmación** (`EmailService._pdf_reserva`). El campo
prometía privacidad y publicaba.

La migración 091 separó los dos textos: `notas` es del equipo, `observaciones`
es del cliente. Este test fija el corte, y también que la marca interna que
`registrar_cobro` deja en `notas` —con la referencia de la transferencia— no
salga impresa.
"""
from datetime import date, time
from decimal import Decimal
from io import BytesIO

import pytest

pypdf = pytest.importorskip("pypdf")

from app.services.reserva_pdf import generar_pdf_reserva  # noqa: E402
from app.services.reserva_service import ReservaService  # noqa: E402

INTERNA = "Al brasilero no se le entiende, que lo atienda Franco"
PARA_EL_CLIENTE = "Retirar por Paraguay 241, tocar timbre del fondo"


def _crear(db, cliente, usuario, vehiculo, **extra):
    kwargs = dict(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 9, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 9, 5),
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


def _texto_del_pdf(reserva, cliente, vehiculo) -> str:
    """
    El texto que se lee al abrir el PDF.

    **Se extrae de verdad y no se buscan bytes en el archivo.** ReportLab
    comprime el stream de contenido, así que un `b"brasilero" not in pdf` pasa
    siempre — incluso cuando la frase está impresa en la primera página. Un test
    que no puede fallar no protege nada, y este protege justamente lo que no se
    puede publicar.
    """
    crudo = generar_pdf_reserva(reserva, cliente=cliente, vehiculo=vehiculo)
    lector = pypdf.PdfReader(BytesIO(crudo))
    return "\n".join(p.extract_text() or "" for p in lector.pages)


class TestElPdfDeConfirmacion:
    def test_no_imprime_las_notas_internas(self, db, cliente, usuario, vehiculo):
        reserva = _crear(db, cliente, usuario, vehiculo, notas=INTERNA)
        pdf = _texto_del_pdf(reserva, cliente, vehiculo)
        assert "brasilero" not in pdf

    def test_si_imprime_las_observaciones(self, db, cliente, usuario, vehiculo):
        reserva = _crear(db, cliente, usuario, vehiculo, observaciones=PARA_EL_CLIENTE)
        pdf = _texto_del_pdf(reserva, cliente, vehiculo)
        assert "timbre" in pdf

    def test_con_las_dos_cargadas_sale_una_sola(self, db, cliente, usuario, vehiculo):
        """El caso real: el mostrador escribe las dos cosas."""
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            notas=INTERNA, observaciones=PARA_EL_CLIENTE,
        )
        pdf = _texto_del_pdf(reserva, cliente, vehiculo)
        assert "timbre" in pdf
        assert "brasilero" not in pdf

    def test_la_referencia_del_cobro_tampoco_sale(self, db, cliente, usuario, vehiculo):
        """
        `registrar_cobro` agrega a `notas` una línea con la referencia de la
        transferencia. Es información de la caja, no del cliente.
        """
        reserva = _crear(db, cliente, usuario, vehiculo)
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("50000"), "transferencia", usuario.id,
            referencia="COMPROBANTE-99887766",
        )
        db.flush()
        db.refresh(reserva)

        assert "99887766" in (reserva.notas or ""), "la marca interna sí se guarda"
        assert "99887766" not in _texto_del_pdf(reserva, cliente, vehiculo)
