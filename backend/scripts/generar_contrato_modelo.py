"""
Genera un contrato de ejemplo para revisar o mandar a un abogado.

No toca la base ni crea nada: arma un contrato en memoria con datos de
muestra y escribe el PDF. Sirve para ver exactamente como sale el documento
antes de emitir uno real.

    python -m scripts.generar_contrato_modelo [ruta_de_salida.pdf]

El **clausulado del dorso es el de verdad**: sale de la plantilla vigente en
la base (o de `domain/contrato_clausulado.py` si todavia no hay ninguna
cargada), asi que lo que se lee en el PDF es palabra por palabra lo que va a
firmar un cliente.

Los **datos del frente son inventados** y estan puestos para que se entienda
la estructura: un alquiler de 5 dias con una cobertura contratada y otra
rechazada, para que se vean las dos cosas.

Mientras `empresa.cuit` este vacio (D-C1 sin resolver), el PDF sale marcado
"DOCUMENTO PROVISORIO". Es a proposito: avisa que le faltan los datos del
locador.
"""
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import app.models  # noqa: F401  — registra todos los mapeos antes de usarlos
from app.database import SessionLocal
from app.domain import contrato_clausulado
from app.services.contrato_pdf import generar_pdf_contrato
from app.services.contrato_service import ContratoService

SALIDA_DEFAULT = Path(__file__).resolve().parents[2] / "docs" / "contrato_modelo.pdf"


def snapshot_de_muestra(empresa: dict) -> dict:
    return {
        "empresa": empresa,
        "reserva_id": 1042,
        "alquiler_id": 318,
        "cliente": {
            "id": 128,
            "nombre": "Pérez, Juan Carlos",
            "dni_cuit": "30.123.456",
            "domicilio": "Av. Colón 1450",
            "localidad": "Bahía Blanca",
            "provincia": "Buenos Aires",
            "codigo_postal": "8000",
            "pais": "ARGENTINA",
            "empresa": "",
            "licencia_numero": "30123456",
            "licencia_vencimiento": "2029-04-18",
            "licencia_pais": "ARG",
            "licencia_categoria": "B1",
        },
        "conductor_adicional": {},
        "vehiculo": {
            "id": 7,
            "descripcion": "FIAT CRONOS DRIVE 1.3",
            "patente": "AG591WA",
            "interno": 7,
            "categoria": "Sedán",
        },
        "servicio": {
            "check_out_fecha": "2026-08-10",
            "check_out_hora": "10:00",
            "check_out_lugar": "Paraguay 241",
            "check_out_km": 48250,
            "check_out_combustible": 100,
            "check_in_fecha": "2026-08-15",
            "check_in_hora": "10:00",
            "check_in_lugar": "Paraguay 241",
        },
        "cargos": {
            "lineas": [
                {"concepto": "Días de alquiler", "cantidad": 5,
                 "valor_unitario": 85_000, "total": 425_000},
                {"concepto": "Cobertura Full", "cantidad": 1,
                 "valor_unitario": 12_000, "total": 60_000},
                {"concepto": "Silla para bebé", "cantidad": 1,
                 "valor_unitario": 4_500, "total": 22_500},
            ],
            "descuento": 0,
            "valor_estimado": 507_500,
            "incluye_kilometraje": True,
            "discrimina_iva": True,
        },
        "coberturas": {
            "contratadas": [{"nombre": "Cobertura Full", "franquicia": 350_000}],
            # Una rechazada, para que se vea la constancia de que se ofreció.
            "rechazadas": ["Protección de ruedas y vidrios"],
            "franquicia": 350_000,
        },
        "aceptacion": contrato_clausulado.ACEPTACION,
        "atendido_por": "(nombre de quien atiende)",
    }


def main() -> None:
    salida = Path(sys.argv[1]) if len(sys.argv) > 1 else SALIDA_DEFAULT
    salida.parent.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        svc = ContratoService(db)
        empresa = svc.datos_empresa()

        # El clausulado real: el vigente en la base, o el de dominio si la
        # base todavía no tiene ninguna plantilla cargada.
        try:
            plantilla = svc.plantilla_vigente()
            db.rollback()  # no se persiste nada: esto es sólo una vista previa
        except Exception:
            plantilla = None

        if plantilla is None or not getattr(plantilla, "clausulas", None):
            plantilla = SimpleNamespace(
                version=1,
                titulo=contrato_clausulado.TITULO,
                clausulas=contrato_clausulado.CLAUSULAS,
                vigente_desde=date.today(),
            )

        contrato = SimpleNamespace(
            numero=0,
            prefijo="C",
            numero_formateado="C-00000000  (MODELO)",
            snapshot=snapshot_de_muestra(empresa),
            firmado_por_nombre=None,
            firmado_por_dni=None,
        )

        salida.write_bytes(generar_pdf_contrato(contrato, plantilla, None))
    finally:
        db.close()

    print(f"Contrato modelo generado: {salida}")
    if not (empresa.get("cuit") or "").strip():
        print("\n  Sale marcado DOCUMENTO PROVISORIO porque faltan los datos")
        print("  fiscales del locador. Se cargan en Configuracion > Empresa")
        print("  (claves empresa.razon_social, empresa.cuit, etc.).")


if __name__ == "__main__":
    main()
