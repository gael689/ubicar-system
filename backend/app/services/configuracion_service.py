"""
ConfiguracionService — parámetros de negocio editables (Fase 3, ítem 40).

`get_int`/`get_decimal` son lo que consumen los sitios que antes usaban una
constante hardcodeada (ver domain/control_24hs.py) — si la clave no existe
en la tabla por algún motivo, caen al default que se les pasa, así que un
`configuracion` vacío nunca puede romper un cálculo en producción.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.configuracion import Configuracion


class ConfiguracionService:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[Configuracion]:
        return self.db.query(Configuracion).order_by(Configuracion.categoria, Configuracion.clave).all()

    def get(self, clave: str) -> Configuracion:
        conf = self.db.query(Configuracion).filter(Configuracion.clave == clave).first()
        if not conf:
            raise NotFoundError("Configuración", clave)
        return conf

    def set_valor(self, clave: str, valor: str, usuario_id: int | None) -> Configuracion:
        conf = self.get(clave)
        conf.valor = valor
        conf.updated_por = usuario_id
        self.db.flush()
        return conf

    def get_str(self, clave: str, default: str = "") -> str:
        """
        El valor como texto, o el default si la clave no existe.

        **Un valor vacío también devuelve el default.** Muchas claves nacen en
        blanco a propósito —los datos fiscales de la empresa, por ejemplo— y
        para quien consulta, "cargada pero vacía" y "no existe" son lo mismo.
        """
        conf = self.db.query(Configuracion).filter(Configuracion.clave == clave).first()
        if not conf or not (conf.valor or "").strip():
            return default
        return conf.valor.strip()

    def get_int(self, clave: str, default: int) -> int:
        conf = self.db.query(Configuracion).filter(Configuracion.clave == clave).first()
        if not conf:
            return default
        try:
            return int(conf.valor)
        except ValueError:
            return default

    def get_decimal(self, clave: str, default: Decimal) -> Decimal:
        conf = self.db.query(Configuracion).filter(Configuracion.clave == clave).first()
        if not conf:
            return default
        try:
            return Decimal(conf.valor)
        except Exception:
            return default
