"""
Crear una reserva contesta **sin esperar al PDF ni a Resend**.

**El bug, en las palabras del mostrador:**

> *"Hago el contrato rápido, me dice Sin conexión, pero cuando llego a la PC me
> aparece para terminar de editarlo."*

Pasó dos veces. No era la conexión: `POST /reservas` dibujaba el PDF de
confirmación, lo subía al storage y mandaba el mail con el SDK de Resend —que
es síncrono y no tiene timeout— **adentro del request**. Con la señal de un
celular en el mostrador eso pasaba de los 15 segundos que esperaba axios, el
panel abortaba y mostraba "sin conexión con el servidor". La reserva ya estaba
creada y confirmada: por eso aparecía después en la computadora.

Lo que estos tests fijan es la forma de la solución, no el síntoma:

1. El endpoint **agenda** el trabajo pesado y contesta.
2. Ese trabajo, cuando corre, sigue haciendo lo mismo que antes.

Si alguien vuelve a poner el mail adentro del request, el primer test falla.
"""
from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from fastapi import BackgroundTasks

from app.routers.reservas import _archivar_pdf_y_avisar, create_reserva
from app.schemas.reserva import ReservaCreate


@pytest.fixture()
def payload(cliente, vehiculo) -> ReservaCreate:
    manana = date.today() + timedelta(days=1)
    return ReservaCreate(
        vehiculo_id=vehiculo.id,
        cliente_id=cliente.id,
        fecha_inicio=manana,
        hora_inicio=time(10, 0),
        fecha_fin=manana + timedelta(days=2),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("140000"),
    )


class TestElRequestNoEsperaANadieDeAfuera:
    def test_contesta_con_el_pdf_y_el_mail_todavia_sin_hacer(
        self, db, usuario, payload, monkeypatch
    ):
        """
        Lo esencial: mientras el endpoint corre, **nadie dibuja un PDF ni habla
        con Resend**. Las dos cosas quedan agendadas para después de la
        respuesta.
        """
        tocado: list[str] = []
        monkeypatch.setattr(
            "app.services.reserva_documento_service.generar_pdf_reserva",
            lambda *a, **k: tocado.append("pdf") or b"%PDF-",
        )
        monkeypatch.setattr(
            "app.services.notificaciones.enviar_email",
            lambda *a, **k: tocado.append("mail"),
        )

        background = BackgroundTasks()
        respuesta = create_reserva(
            payload=payload, background=background, db=db, current_user=usuario
        )

        assert respuesta["data"]["id"] > 0
        assert tocado == [], (
            "El endpoint volvió a hacer el trabajo lento adentro del request. "
            "Eso es lo que hacía que el mostrador viera 'sin conexión' con la "
            "reserva ya creada."
        )

        # Y quedó agendado, que es la otra mitad: no alcanza con no hacerlo.
        assert len(background.tasks) == 1
        assert background.tasks[0].func is _archivar_pdf_y_avisar
        assert background.tasks[0].args == (respuesta["data"]["id"], usuario.id)

    def test_la_reserva_queda_creada_igual(self, db, usuario, payload):
        """Mover el trabajo de lugar no puede cambiar lo que se graba."""
        from app.models.reserva import Reserva

        respuesta = create_reserva(
            payload=payload, background=BackgroundTasks(), db=db, current_user=usuario
        )
        reserva = db.get(Reserva, respuesta["data"]["id"])
        assert reserva is not None
        assert reserva.cliente_id == payload.cliente_id
        assert reserva.vehiculo_id == payload.vehiculo_id


class TestLoQueQuedoAgendadoSigueHaciendoSuTrabajo:
    def test_archiva_el_pdf_en_la_ficha_del_cliente(
        self, db, usuario, payload, monkeypatch
    ):
        """
        La tarea abre su propia sesión —la del request ya se cerró—, así que se
        la apunta a la base del test.
        """
        from app.models.documento import Documento

        respuesta = create_reserva(
            payload=payload, background=BackgroundTasks(), db=db, current_user=usuario
        )
        reserva_id = respuesta["data"]["id"]
        db.commit()

        monkeypatch.setattr("app.database.SessionLocal", lambda: db)
        # `db.close()` al final de la tarea cerraría la sesión del test.
        monkeypatch.setattr(type(db), "close", lambda self: None)

        _archivar_pdf_y_avisar(reserva_id, usuario.id)

        archivados = (
            db.query(Documento)
            .filter(Documento.cliente_id == payload.cliente_id, Documento.tipo == "reserva")
            .all()
        )
        assert len(archivados) == 1, "El PDF de confirmación dejó de archivarse."

    def test_una_reserva_borrada_no_la_hace_explotar(self, db, usuario, monkeypatch):
        """
        Corre cuando ya no hay a quién devolverle un error: lo único que puede
        hacer ante cualquier problema es no levantar.
        """
        monkeypatch.setattr("app.database.SessionLocal", lambda: db)
        monkeypatch.setattr(type(db), "close", lambda self: None)

        _archivar_pdf_y_avisar(999_999, usuario.id)   # no existe: no levanta
