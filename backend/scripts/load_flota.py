"""
Script para limpiar y cargar la flota de vehículos.

Uso:
    docker compose exec backend python -m scripts.load_flota
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal
from app.models.vehiculo import Vehiculo


def main() -> None:
    db = SessionLocal()
    try:
        # Limpiar tablas relacionadas en orden inverso de dependencias
        print("  - Limpiando datos relacionados...")
        
        # Limpiar en orden: alquileres -> reservas -> gastos -> tarifas -> vehículos
        db.execute(text("DELETE FROM alquileres"))
        db.execute(text("DELETE FROM reservas"))
        db.execute(text("DELETE FROM gastos"))
        db.execute(text("DELETE FROM tarifas"))
        db.execute(text("DELETE FROM vehiculos"))
        
        db.commit()
        print("  - Datos limpios")

        # Nueva flota de vehículos
        vehiculos = [
            {
                "patente": "AF977FD",
                "marca": "Toyota",
                "modelo": "Hilux Dx",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Blanca",
                "km_actual": 15000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH216KO",
                "marca": "Toyota",
                "modelo": "Hilux Dx",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Roja",
                "km_actual": 12000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH491AI",
                "marca": "Foton",
                "modelo": "Tunland G7 AT",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Negro",
                "km_actual": 8000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH478LC",
                "marca": "Foton",
                "modelo": "Tunland G7 AT",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Gris",
                "km_actual": 7500,
                "km_entre_services": 10000,
            },
            {
                "patente": "AE269ZH",
                "marca": "Volkswagen",
                "modelo": "Amarok",
                "anio": 2022,
                "tipo": "camioneta",
                "color": "Blanca",
                "km_actual": 25000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH067LW",
                "marca": "Chevrolet",
                "modelo": "Cronos Drive 1.3 AT",
                "anio": 2023,
                "tipo": "auto",
                "color": "Blanco",
                "km_actual": 5000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH462EG",
                "marca": "Chevrolet",
                "modelo": "Cronos Drive 1.3 AT",
                "anio": 2023,
                "tipo": "auto",
                "color": "Gris",
                "km_actual": 4500,
                "km_entre_services": 10000,
            },
            {
                "patente": "AG902AQ",
                "marca": "Volkswagen",
                "modelo": "Virtus 1.6",
                "anio": 2022,
                "tipo": "auto",
                "color": "Blanco",
                "km_actual": 18000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AG591WA",
                "marca": "Chevrolet",
                "modelo": "Cronos Drive 1.3",
                "anio": 2022,
                "tipo": "auto",
                "color": "Blanco",
                "km_actual": 22000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH021RK",
                "marca": "Chevrolet",
                "modelo": "Cronos Drive 1.3 AT",
                "anio": 2023,
                "tipo": "auto",
                "color": "Rojo",
                "km_actual": 3000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AF865DD",
                "marca": "Toyota",
                "modelo": "Etios 1.5 XLS AT",
                "anio": 2021,
                "tipo": "auto",
                "color": "Gris",
                "km_actual": 35000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH734CO",
                "marca": "Titano",
                "modelo": "Endurance MT",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Blanca",
                "km_actual": 6000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH799NM",
                "marca": "Toyota",
                "modelo": "Hilux Dx AT",
                "anio": 2023,
                "tipo": "camioneta",
                "color": "Blanca",
                "km_actual": 9000,
                "km_entre_services": 10000,
            },
            {
                "patente": "AH762UL",
                "marca": "Chevrolet",
                "modelo": "Argo Drive MT",
                "anio": 2022,
                "tipo": "auto",
                "color": "Blanco",
                "km_actual": 16000,
                "km_entre_services": 10000,
            },
            {
                "patente": "PMH625",
                "marca": "Chevrolet",
                "modelo": "Corsa Classic",
                "anio": 2020,
                "tipo": "auto",
                "color": "Blanco",
                "km_actual": 45000,
                "km_entre_services": 10000,
            },
        ]

        # Insertar nuevos vehículos
        for v_data in vehiculos:
            v = Vehiculo(
                **v_data,
                estado="disponible",
                activo=True,
                km_proximo_service=v_data["km_actual"] + v_data["km_entre_services"],
                created_at=datetime.utcnow(),
            )
            db.add(v)

        db.commit()
        print(f"  + Cargados {len(vehiculos)} vehículos nuevos")
        print("Flota recargada exitosamente")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
