"""
Router de Usuarios — por ahora sólo "yo".

Existe por el pie del contrato (plan 27/09, A4): *"Usted fue atendido por"*
sale del nombre del usuario, y cuando Clerk no lo manda el sistema no tenía
dónde corregirlo. `core/deps.py` intenta completarlo solo desde Clerk; esto es
la salida manual para cuando Clerk tampoco lo sabe.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, nombre_presentable
from app.core.responses import ok
from app.models.usuario import Usuario

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


class ActualizarMiUsuario(BaseModel):
    nombre: str

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Escribí tu nombre y apellido")
        return v[:255]


def _yo(u: Usuario) -> dict:
    return {
        "id": u.id,
        "nombre": u.nombre,
        "email": u.email,
        "rol": u.rol,
        # La pantalla lo usa para pedir el nombre sólo cuando hace falta.
        "nombre_presentable": nombre_presentable(u),
    }


@router.get("/me")
def mi_usuario(current_user: Usuario = Depends(get_current_user)):
    return ok(_yo(current_user))


@router.patch("/me")
def actualizar_mi_usuario(
    payload: ActualizarMiUsuario,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    usuario = db.get(Usuario, current_user.id) or current_user
    usuario.nombre = payload.nombre
    db.commit()
    db.refresh(usuario)
    return ok(_yo(usuario), "Nombre actualizado")
