from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.models.vehiculo import Vehiculo
from app.models.documento import Documento
from app.models.cliente import Cliente
from app.models.echeq import Echeq


def obtener_alertas(db: Session) -> list[dict]:
    alertas = []
    hoy = date.today()

    # VTV y pólizas por vencer (30, 15, 7 días)
    umbrales_doc = [7, 15, 30]
    for umbral in umbrales_doc:
        fecha_limite = hoy + timedelta(days=umbral)
        docs = (
            db.query(Documento)
            .filter(Documento.vigencia_hasta <= fecha_limite, Documento.vigencia_hasta >= hoy)
            .all()
        )
        for doc in docs:
            alertas.append({
                "tipo": f"{doc.tipo}_vencimiento",
                "titulo": f"{doc.tipo.upper()} por vencer",
                "descripcion": f"Vence el {doc.vigencia_hasta}",
                "urgencia": "alta" if umbral <= 7 else "media" if umbral <= 15 else "baja",
                "entidad_id": doc.vehiculo_id,
                "entidad_tipo": "vehiculo",
            })

    # Licencias de clientes (30 días)
    fecha_limite_lic = hoy + timedelta(days=30)
    clientes_por_vencer = (
        db.query(Cliente)
        .filter(Cliente.licencia_vencimiento <= fecha_limite_lic, Cliente.activo == True)
        .all()
    )
    for cliente in clientes_por_vencer:
        alertas.append({
            "tipo": "licencia_vencimiento",
            "titulo": f"Licencia de {cliente.nombre_completo} por vencer",
            "descripcion": f"Vence el {cliente.licencia_vencimiento}",
            "urgencia": "media",
            "entidad_id": cliente.id,
            "entidad_tipo": "cliente",
        })

    # Echeqs próximos (7 días)
    fecha_limite_echeq = hoy + timedelta(days=7)
    echeqs = (
        db.query(Echeq)
        .filter(Echeq.fecha_cobro <= fecha_limite_echeq, Echeq.estado == "pendiente")
        .all()
    )
    for echeq in echeqs:
        alertas.append({
            "tipo": "echeq_vencimiento",
            "titulo": f"Echeq de {echeq.contraparte} próximo a vencer",
            "descripcion": f"Vence el {echeq.fecha_cobro}",
            "urgencia": "alta",
            "entidad_id": echeq.id,
            "entidad_tipo": "echeq",
        })

    return alertas


def iniciar_scheduler(app):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler()

    @scheduler.scheduled_job(CronTrigger(hour=8, minute=0))
    async def revisar_alertas():
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            alertas = obtener_alertas(db)
            # TODO: enviar alertas por email/WhatsApp
            print(f"[Scheduler] {len(alertas)} alertas generadas")
        finally:
            db.close()

    scheduler.start()
    return scheduler
