"""
El alta rápida tiene que poder usarse más de una vez.

**El caso es el mostrador con alguien enfrente**: llega uno que no está en el
sistema y hay que reservarle ahora. El formulario de reserva lo da de alta con
el nombre y deja `dni_cuit` y `telefono` en `A COMPLETAR`, que es el marcador
que después busca la campana `cliente_sin_completar`.

El problema: `ClienteService.create` valida que el DNI no se repita, y trata
`A COMPLETAR` como si fuera un DNI. Así, **el primer alta rápida funciona y la
segunda falla** con "Ya existe un cliente con el DNI/CUIT A COMPLETAR". El
frontend lo mostraba como *"No pudimos crear el cliente"*, sin decir por qué,
así que desde el mostrador se veía como que el alta rápida simplemente no anda.

`A COMPLETAR` no es un documento: es la ausencia de uno. Dos ausencias no son
un duplicado.
"""
import pytest

from app.core.exceptions import ConflictError
from app.domain.notificaciones_reglas import MARCA_PENDIENTE
from app.schemas.cliente import ClienteCreate, ClienteUpdate
from app.services.cliente_service import ClienteService


def alta_rapida(nombre: str) -> ClienteCreate:
    """Exactamente lo que manda el botón de alta rápida del formulario."""
    return ClienteCreate(
        nombre_completo=nombre,
        dni_cuit=MARCA_PENDIENTE,
        telefono=MARCA_PENDIENTE,
        tipo="particular",
        notas="Alta rápida desde una reserva. Faltan DNI/CUIT y teléfono.",
    )


class TestDosAltasRapidasSeguidas:
    def test_la_segunda_no_choca_con_la_primera(self, db, usuario):
        svc = ClienteService(db)
        primero = svc.create(alta_rapida("Juan Pérez"), usuario_id=usuario.id)
        segundo = svc.create(alta_rapida("Ana Gómez"), usuario_id=usuario.id)

        assert primero.id != segundo.id
        assert segundo.dni_cuit == MARCA_PENDIENTE

    def test_la_campana_los_sigue_reclamando_a_los_dos(self, db, usuario):
        """
        El marcador tiene que sobrevivir intacto: es lo que hace que
        `cliente_sin_completar` los encuentre. Si el arreglo fuera guardar el
        DNI vacío, el alta rápida dejaría de reclamarse y las fichas a medias
        se quedarían así para siempre.
        """
        from datetime import date

        from app.domain.notificaciones_reglas import cliente_sin_completar

        svc = ClienteService(db)
        svc.create(alta_rapida("Juan Pérez"), usuario_id=usuario.id)
        svc.create(alta_rapida("Ana Gómez"), usuario_id=usuario.id)
        db.flush()

        avisos = cliente_sin_completar(db, date.today())
        nombres = " ".join(a["titulo"] for a in avisos)
        assert "Juan Pérez" in nombres
        assert "Ana Gómez" in nombres


class TestElDniDeVerdadSigueSiendoUnico:
    def test_dos_clientes_con_el_mismo_dni_real_se_rechazan(self, db, usuario):
        svc = ClienteService(db)
        svc.create(
            ClienteCreate(nombre_completo="Juan Pérez", dni_cuit="30123456", telefono="291"),
            usuario_id=usuario.id,
        )
        with pytest.raises(ConflictError):
            svc.create(
                ClienteCreate(nombre_completo="Otro Juan", dni_cuit="30123456", telefono="291"),
                usuario_id=usuario.id,
            )

    def test_completar_el_dni_despues_sigue_validando(self, db, usuario):
        """
        El camino real: se completa la ficha del alta rápida y el DNI que se
        carga ya lo tiene otro. Ahí sí hay un duplicado.
        """
        svc = ClienteService(db)
        svc.create(
            ClienteCreate(nombre_completo="Juan Pérez", dni_cuit="30123456", telefono="291"),
            usuario_id=usuario.id,
        )
        rapido = svc.create(alta_rapida("Ana Gómez"), usuario_id=usuario.id)

        with pytest.raises(ConflictError):
            svc.update(rapido.id, ClienteUpdate(dni_cuit="30123456"))
