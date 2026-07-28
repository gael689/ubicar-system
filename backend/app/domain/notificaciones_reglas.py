"""
Catálogo de reglas del motor de notificaciones (Fase 2, plan maestro §4.2).

Cada regla es una función pura `(db, hoy) -> list[dict]` que devuelve
"candidatos" de notificación con esta forma:

    {
        "tipo": str,             # clave de la regla — ver REGLAS abajo
        "titulo": str,
        "descripcion": str,
        "urgencia": "critica" | "alta" | "media" | "baja",
        "entidad_tipo": str,
        "entidad_id": int,
        "url_destino": str,
        "fecha_objetivo": date | None,
    }

No tocan la tabla `notificaciones` ni la sesión (no hacen commit/flush) —
eso es responsabilidad de `NotificacionService`. Separar esto permite testear
cada regla con datos en memoria y agregar/sacar reglas del catálogo sin
tocar el motor.

Reglas del catálogo original (plan maestro §4.2) que NO están acá porque
dependen de algo que todavía no existe en el sistema:
- "Reserva nueva desde la web": no hay sistema de reservas web (Fase 5).
- "Multa próxima a vencer con descuento por pronto pago": **el descuento por
  pronto pago no se modela** (D-28, decisión explícita). Sí se avisa del
  vencimiento en sí, más abajo.
"""
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from app.models.alquiler import Alquiler
from app.models.cliente import Cliente
from app.models.comprobante import Comprobante
from app.models.cuenta_corriente import MovimientoCuentaCorriente, CuentaCorriente
from app.models.documento import Documento
from app.models.echeq import Echeq
from app.models.multa import Multa
from app.models.reserva import Reserva
from app.models.servicio import Servicio
from app.models.vehiculo import Vehiculo


def _vehiculo_desc(v) -> str:
    return f"{v.patente} {v.marca} {v.modelo}" if v else "?"


def _cliente_nombre(c) -> str:
    return c.nombre_completo if c else "?"


# ── Operación diaria ────────────────────────────────────────────────────────

def entregas_hoy(db: Session, hoy: date) -> list[dict]:
    reservas = (
        db.query(Reserva)
        .outerjoin(Alquiler, Alquiler.reserva_id == Reserva.id)
        .filter(
            Reserva.estado == "confirmada",
            Reserva.fecha_inicio == hoy,
            Alquiler.id.is_(None),
        )
        .all()
    )
    return [
        {
            "tipo": "entrega_hoy",
            "titulo": "Entrega programada hoy",
            "descripcion": f"Reserva #{r.id} — {_vehiculo_desc(r.vehiculo)} — {_cliente_nombre(r.cliente)} a las {r.hora_inicio.strftime('%H:%M')}",
            "urgencia": "alta",
            "entidad_tipo": "reserva",
            "entidad_id": r.id,
            "url_destino": "/reservas",
            "fecha_objetivo": hoy,
        }
        for r in reservas
    ]


def devoluciones_hoy(db: Session, hoy: date) -> list[dict]:
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "activa", Reserva.fecha_fin == hoy, Alquiler.checkin_fecha.is_(None))
        .all()
    )
    return [
        {
            "tipo": "devolucion_hoy",
            "titulo": "Devolución programada hoy",
            "descripcion": f"Alquiler #{a.id} — {_vehiculo_desc(a.reserva.vehiculo)} — {_cliente_nombre(a.reserva.cliente)} a las {a.reserva.hora_fin.strftime('%H:%M')}",
            "urgencia": "alta",
            "entidad_tipo": "alquiler",
            "entidad_id": a.id,
            "url_destino": "/reservas",
            "fecha_objetivo": hoy,
        }
        for a in alquileres
    ]


def checkout_pendiente(db: Session, hoy: date) -> list[dict]:
    ahora = datetime.now()
    reservas = (
        db.query(Reserva)
        .outerjoin(Alquiler, Alquiler.reserva_id == Reserva.id)
        .filter(
            Reserva.estado == "confirmada",
            (Reserva.fecha_inicio < ahora.date())
            | ((Reserva.fecha_inicio == ahora.date()) & (Reserva.hora_inicio <= ahora.time())),
            Alquiler.id.is_(None),
        )
        .all()
    )
    return [
        {
            "tipo": "checkout_pendiente",
            "titulo": "Checkout pendiente",
            "descripcion": f"Reserva #{r.id} — {_vehiculo_desc(r.vehiculo)} — {_cliente_nombre(r.cliente)}",
            "urgencia": "critica",
            "entidad_tipo": "reserva",
            "entidad_id": r.id,
            "url_destino": "/reservas",
            "fecha_objetivo": hoy,
        }
        for r in reservas
    ]


def checkin_vencido(db: Session, hoy: date) -> list[dict]:
    ahora = datetime.now()
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "vencida")
        .all()
    )
    items = []
    for a in alquileres:
        r = a.reserva
        vencimiento_dt = datetime.combine(r.fecha_fin, r.hora_fin)
        if ahora - vencimiento_dt < timedelta(hours=1):
            continue
        horas_atraso = int((ahora - vencimiento_dt).total_seconds() // 3600)
        items.append({
            "tipo": "checkin_vencido",
            "titulo": "Devolución vencida",
            "descripcion": (
                f"Alquiler #{a.id} — {_vehiculo_desc(r.vehiculo)} — {_cliente_nombre(r.cliente)} — "
                f"venció {r.fecha_fin} {r.hora_fin.strftime('%H:%M')} ({horas_atraso}h de atraso)"
            ),
            "urgencia": "critica",
            "entidad_tipo": "alquiler",
            "entidad_id": a.id,
            "url_destino": "/reservas",
            "fecha_objetivo": r.fecha_fin,
        })
    return items


def contrato_no_firmado_entrega_hoy(db: Session, hoy: date) -> list[dict]:
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Alquiler.checkout_fecha == hoy, Alquiler.contrato_firmado.is_(False))
        .all()
    )
    return [
        {
            "tipo": "contrato_no_firmado",
            "titulo": "Contrato sin firmar",
            "descripcion": f"Alquiler #{a.id} — {_vehiculo_desc(a.reserva.vehiculo)} — {_cliente_nombre(a.reserva.cliente)} entregado hoy sin contrato firmado",
            "urgencia": "alta",
            "entidad_tipo": "alquiler",
            "entidad_id": a.id,
            "url_destino": "/reservas",
            "fecha_objetivo": hoy,
        }
        for a in alquileres
    ]


def reserva_pendiente_24hs(db: Session, hoy: date) -> list[dict]:
    limite = datetime.utcnow() - timedelta(hours=24)
    reservas = db.query(Reserva).filter(Reserva.estado == "pendiente", Reserva.created_at < limite).all()
    return [
        {
            "tipo": "reserva_pendiente_24hs",
            "titulo": "Reserva sin confirmar hace más de 24hs",
            "descripcion": f"Reserva #{r.id} — {_vehiculo_desc(r.vehiculo)} — {_cliente_nombre(r.cliente)} — creada {r.created_at.strftime('%d/%m %H:%M')}",
            "urgencia": "media",
            "entidad_tipo": "reserva",
            "entidad_id": r.id,
            "url_destino": "/reservas",
            "fecha_objetivo": hoy,
        }
        for r in reservas
    ]


# ── Cobranzas y finanzas ────────────────────────────────────────────────────

def echeq_proximo_t2(db: Session, hoy: date) -> list[dict]:
    objetivo = hoy + timedelta(days=2)
    echeqs = db.query(Echeq).filter(Echeq.fecha_cobro == objetivo, Echeq.estado == "en_cartera", Echeq.activo == True).all()
    return [
        {
            "tipo": "echeq_proximo",
            "titulo": "Echeq próximo a cobrar",
            "descripcion": f"Echeq de {e.contraparte} — ${e.monto} — se cobra el {e.fecha_cobro}",
            "urgencia": "alta",
            "entidad_tipo": "echeq",
            "entidad_id": e.id,
            "url_destino": "/caja",
            "fecha_objetivo": e.fecha_cobro,
        }
        for e in echeqs
    ]


def echeq_vence_hoy(db: Session, hoy: date) -> list[dict]:
    echeqs = db.query(Echeq).filter(Echeq.fecha_cobro == hoy, Echeq.estado == "en_cartera", Echeq.activo == True).all()
    return [
        {
            "tipo": "echeq_vence_hoy",
            "titulo": "Echeq vence hoy",
            "descripcion": f"Echeq de {e.contraparte} — ${e.monto} — vence hoy",
            "urgencia": "critica",
            "entidad_tipo": "echeq",
            "entidad_id": e.id,
            "url_destino": "/caja",
            "fecha_objetivo": e.fecha_cobro,
        }
        for e in echeqs
    ]


def echeq_sin_acreditar(db: Session, hoy: date) -> list[dict]:
    echeqs = db.query(Echeq).filter(Echeq.fecha_cobro < hoy, Echeq.estado == "en_cartera", Echeq.activo == True).all()
    return [
        {
            "tipo": "echeq_sin_acreditar",
            "titulo": "Echeq sin acreditar",
            "descripcion": f"Echeq de {e.contraparte} — ${e.monto} — debía cobrarse el {e.fecha_cobro} y sigue en cartera",
            "urgencia": "critica",
            "entidad_tipo": "echeq",
            "entidad_id": e.id,
            "url_destino": "/caja",
            "fecha_objetivo": e.fecha_cobro,
        }
        for e in echeqs
    ]


def echeq_rechazado(db: Session, hoy: date) -> list[dict]:
    echeqs = db.query(Echeq).filter(Echeq.estado == "rechazado", Echeq.activo == True).all()
    return [
        {
            "tipo": "echeq_rechazado",
            "titulo": "Echeq rechazado",
            "descripcion": f"Echeq de {e.contraparte} — ${e.monto} — {e.motivo_rechazo or 'sin motivo registrado'}",
            "urgencia": "critica",
            "entidad_tipo": "echeq",
            "entidad_id": e.id,
            "url_destino": "/caja",
            "fecha_objetivo": None,
        }
        for e in echeqs
    ]


def cc_vencimiento_proximo(db: Session, hoy: date) -> list[dict]:
    objetivos = {hoy + timedelta(days=3): "T-3", hoy: "T-0"}
    movs = (
        db.query(MovimientoCuentaCorriente)
        .filter(
            MovimientoCuentaCorriente.tipo == "debito",
            MovimientoCuentaCorriente.anulado == False,
            MovimientoCuentaCorriente.fecha_vencimiento.in_(list(objetivos.keys())),
        )
        .all()
    )
    items = []
    for m in movs:
        cliente = m.cuenta_corriente.cliente
        items.append({
            "tipo": "cc_vencimiento_proximo",
            "titulo": "Vencimiento de cuenta corriente",
            "descripcion": f"{_cliente_nombre(cliente)} — {m.concepto} — ${m.monto} — vence {m.fecha_vencimiento} ({objetivos[m.fecha_vencimiento]})",
            "urgencia": "alta",
            "entidad_tipo": "movimiento_cc",
            "entidad_id": m.id,
            "url_destino": f"/clientes/{cliente.id}",
            "fecha_objetivo": m.fecha_vencimiento,
        })
    return items


_BUCKETS_CC_VENCIDA = [(30, "critica"), (15, "critica"), (7, "alta"), (1, "alta")]


def cc_vencida(db: Session, hoy: date) -> list[dict]:
    movs = (
        db.query(MovimientoCuentaCorriente)
        .filter(
            MovimientoCuentaCorriente.tipo == "debito",
            MovimientoCuentaCorriente.anulado == False,
            MovimientoCuentaCorriente.fecha_vencimiento < hoy,
        )
        .all()
    )
    items = []
    for m in movs:
        dias = (hoy - m.fecha_vencimiento).days
        bucket = next(((umbral, urg) for umbral, urg in _BUCKETS_CC_VENCIDA if dias >= umbral), None)
        if bucket is None:
            continue
        umbral, urgencia = bucket
        cliente = m.cuenta_corriente.cliente
        items.append({
            "tipo": "cc_vencida",
            "titulo": f"Deuda vencida hace +{umbral} días",
            "descripcion": f"{_cliente_nombre(cliente)} — {m.concepto} — ${m.monto} — vencido hace {dias} días",
            "urgencia": urgencia,
            "entidad_tipo": "movimiento_cc",
            "entidad_id": m.id,
            "url_destino": f"/clientes/{cliente.id}",
            # Se agrega el bucket a la fecha objetivo para que cada escalón
            # dispare su propia notificación (dedupe por tipo+entidad+fecha).
            "fecha_objetivo": m.fecha_vencimiento + timedelta(days=umbral),
        })
    return items


def cliente_supera_limite_credito(db: Session, hoy: date) -> list[dict]:
    cuentas = (
        db.query(CuentaCorriente)
        .filter(CuentaCorriente.limite_credito.isnot(None), CuentaCorriente.saldo > CuentaCorriente.limite_credito)
        .all()
    )
    return [
        {
            "tipo": "limite_credito_superado",
            "titulo": "Límite de crédito superado",
            "descripcion": f"{_cliente_nombre(cc.cliente)} — saldo ${cc.saldo} supera el límite de ${cc.limite_credito}",
            "urgencia": "alta",
            "entidad_tipo": "cliente",
            "entidad_id": cc.cliente_id,
            "url_destino": f"/clientes/{cc.cliente_id}",
            "fecha_objetivo": hoy,
        }
        for cc in cuentas
    ]


def saldo_pendiente_al_finalizar(db: Session, hoy: date) -> list[dict]:
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "finalizada")
        .all()
    )
    items = []
    for a in alquileres:
        r = a.reserva
        monto_total = (
            float(r.precio_total or 0)
            + float(r.cargo_late_checkout or 0)
            + float(a.cargo_excedente or 0)
            + float(r.total_adicionales)
        )
        monto_abonado = sum(float(p.monto) for p in a.pagos)
        saldo_pendiente = monto_total - monto_abonado
        if saldo_pendiente > 0 and r.fecha_fin < hoy:
            dias_vencido = (hoy - r.fecha_fin).days
            items.append({
                "tipo": "saldo_pendiente_alquiler",
                "titulo": "Saldo pendiente al finalizar",
                "descripcion": f"Reserva #{r.id} finalizada adeuda ${saldo_pendiente:,.2f} ({dias_vencido} días vencido)",
                "urgencia": "alta" if dias_vencido > 3 else "media",
                "entidad_tipo": "alquiler",
                "entidad_id": a.id,
                "url_destino": "/caja",
                "fecha_objetivo": r.fecha_fin,
            })
    return items


def garantia_sin_resolver(db: Session, hoy: date) -> list[dict]:
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(
            Reserva.estado == "finalizada",
            Alquiler.garantia_tipo.isnot(None),
            Alquiler.garantia_tipo != "no_aplica",
            Alquiler.garantia_estado == "retenida",
        )
        .all()
    )
    items = []
    for a in alquileres:
        if not a.checkin_fecha or (hoy - a.checkin_fecha).days < 3:
            continue
        items.append({
            "tipo": "garantia_sin_resolver",
            "titulo": "Garantía sin resolver",
            "descripcion": f"Alquiler #{a.id} — Garantía {a.garantia_tipo} de ${a.garantia_monto} retenida hace {(hoy - a.checkin_fecha).days} días",
            "urgencia": "media",
            "entidad_tipo": "alquiler",
            "entidad_id": a.id,
            "url_destino": "/reservas",
            "fecha_objetivo": a.checkin_fecha,
        })
    return items


def factura_pendiente_emitir(db: Session, hoy: date) -> list[dict]:
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "finalizada", Alquiler.checkin_fecha.isnot(None))
        .all()
    )
    items = []
    for a in alquileres:
        r = a.reserva
        tiene_comprobante = (
            db.query(Comprobante)
            .filter(
                Comprobante.alquiler_id == a.id,
                Comprobante.tipo.in_(["factura_a", "factura_b", "factura_c"]),
                Comprobante.estado != "anulada",
            )
            .first()
        )
        if tiene_comprobante:
            continue
        items.append({
            "tipo": "factura_pendiente_emitir",
            "titulo": "Factura pendiente de emitir",
            "descripcion": f"Alquiler #{a.id} cerrado el {a.checkin_fecha} sin comprobante emitido — {_cliente_nombre(r.cliente)}",
            "urgencia": "media",
            "entidad_tipo": "alquiler",
            "entidad_id": a.id,
            "url_destino": f"/clientes/{r.cliente_id}",
            "fecha_objetivo": a.checkin_fecha,
        })
    return items


# ── Flota y documentación ───────────────────────────────────────────────────

_UMBRALES_DOC = [(1, "critica"), (7, "alta"), (15, "media"), (30, "baja")]


def doc_vehiculo_vencimiento(db: Session, hoy: date) -> list[dict]:
    # VTV y póliza tienen su propia regla (vtv_vencimiento/poliza_vencimiento,
    # Fase 3 ítem 38 — leen el campo del vehículo, no el Documento genérico).
    # Ésta cubre el resto de los tipos (clausulas, otro).
    docs = (
        db.query(Documento)
        .filter(
            Documento.vehiculo_id.isnot(None),
            Documento.cliente_id.is_(None),
            Documento.tipo.notin_(["vtv", "poliza"]),
        )
        .all()
    )
    return _reglas_documentos_lista(docs, hoy, "vehiculo", lambda d: d.vehiculo_id, "flota")


def vtv_vencimiento(db: Session, hoy: date) -> list[dict]:
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.vtv_vencimiento.isnot(None)).all()
    return _reglas_vencimiento_vehiculo(vehiculos, hoy, "vtv_vencimiento", "VTV", lambda v: v.vtv_vencimiento)


def poliza_vencimiento(db: Session, hoy: date) -> list[dict]:
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.poliza_vencimiento.isnot(None)).all()
    return _reglas_vencimiento_vehiculo(vehiculos, hoy, "poliza_vencimiento", "Póliza", lambda v: v.poliza_vencimiento)


def _reglas_vencimiento_vehiculo(vehiculos, hoy: date, tipo: str, label: str, get_fecha) -> list[dict]:
    items = []
    for v in vehiculos:
        vh = get_fecha(v)
        if vh < hoy:
            items.append({
                "tipo": tipo,
                "titulo": f"{label} vencida",
                "descripcion": f"{_vehiculo_desc(v)} — {label} vencida el {vh}",
                "urgencia": "critica",
                "entidad_tipo": "vehiculo",
                "entidad_id": v.id,
                "url_destino": f"/flota/{v.id}",
                "fecha_objetivo": vh,
            })
            continue
        dias = (vh - hoy).days
        umbral = next((u for u, _ in _UMBRALES_DOC if dias <= u), None)
        if umbral is None:
            continue
        urgencia = dict(_UMBRALES_DOC)[umbral]
        items.append({
            "tipo": tipo,
            "titulo": f"{label} por vencer",
            "descripcion": f"{_vehiculo_desc(v)} — {label} vence el {vh} (T-{umbral})",
            "urgencia": urgencia,
            "entidad_tipo": "vehiculo",
            "entidad_id": v.id,
            "url_destino": f"/flota/{v.id}",
            "fecha_objetivo": vh,
        })
    return items


def doc_cliente_vencimiento(db: Session, hoy: date) -> list[dict]:
    docs = db.query(Documento).filter(Documento.cliente_id.isnot(None)).all()
    return _reglas_documentos_lista(docs, hoy, "cliente", lambda d: d.cliente_id, "clientes")


def _reglas_documentos_lista(docs, hoy: date, entidad_tipo: str, get_id, url_base: str) -> list[dict]:
    items = []
    for d in docs:
        if not d.vigencia_hasta:
            continue
        vh = d.vigencia_hasta
        entidad_id = get_id(d)
        if vh < hoy:
            items.append({
                "tipo": f"doc_{entidad_tipo}_vencido",
                "titulo": f"Documento vencido ({d.tipo})",
                "descripcion": f"{d.nombre} — vencido el {vh}",
                "urgencia": "critica",
                "entidad_tipo": entidad_tipo,
                "entidad_id": entidad_id,
                "url_destino": f"/{url_base}/{entidad_id}",
                "fecha_objetivo": vh,
            })
            continue
        dias = (vh - hoy).days
        umbral = next((u for u, _ in _UMBRALES_DOC if dias <= u), None)
        if umbral is None:
            continue
        urgencia = dict(_UMBRALES_DOC)[umbral]
        items.append({
            "tipo": f"doc_{entidad_tipo}_por_vencer",
            "titulo": f"Documento por vencer ({d.tipo})",
            "descripcion": f"{d.nombre} — vence el {vh} (T-{umbral})",
            "urgencia": urgencia,
            "entidad_tipo": entidad_tipo,
            "entidad_id": entidad_id,
            "url_destino": f"/{url_base}/{entidad_id}",
            "fecha_objetivo": vh,
        })
    return items


def service_km(db: Session, hoy: date) -> list[dict]:
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.km_proximo_service > 0).all()
    items = []
    for v in vehiculos:
        restantes = v.km_proximo_service - v.km_actual
        if restantes <= 0:
            items.append({
                "tipo": "service_km_vencido",
                "titulo": "Service vencido",
                "descripcion": f"{_vehiculo_desc(v)} — {abs(restantes)} km pasados del próximo service",
                "urgencia": "alta",
                "entidad_tipo": "vehiculo",
                "entidad_id": v.id,
                "url_destino": f"/flota/{v.id}",
                "fecha_objetivo": hoy,
            })
        elif restantes < 1000:
            items.append({
                "tipo": "service_km_proximo",
                "titulo": "Service próximo",
                "descripcion": f"{_vehiculo_desc(v)} — faltan {restantes} km para el próximo service",
                "urgencia": "media",
                "entidad_tipo": "vehiculo",
                "entidad_id": v.id,
                "url_destino": f"/flota/{v.id}",
                "fecha_objetivo": hoy,
            })
    return items


def service_fecha(db: Session, hoy: date) -> list[dict]:
    servicios = (
        db.query(Servicio)
        .filter(Servicio.activo == True, Servicio.proxima_fecha.isnot(None))
        .all()
    )
    items = []
    for s in servicios:
        v = s.vehiculo
        if s.proxima_fecha < hoy:
            items.append({
                "tipo": "service_fecha_vencido",
                "titulo": "Service vencido por fecha",
                "descripcion": f"{_vehiculo_desc(v)} — service programado para {s.proxima_fecha}, ya pasó",
                "urgencia": "alta",
                "entidad_tipo": "vehiculo",
                "entidad_id": s.vehiculo_id,
                "url_destino": f"/flota/{s.vehiculo_id}",
                "fecha_objetivo": s.proxima_fecha,
            })
        elif (s.proxima_fecha - hoy).days <= 15:
            items.append({
                "tipo": "service_fecha_proximo",
                "titulo": "Service próximo por fecha",
                "descripcion": f"{_vehiculo_desc(v)} — service programado para {s.proxima_fecha}",
                "urgencia": "media",
                "entidad_tipo": "vehiculo",
                "entidad_id": s.vehiculo_id,
                "url_destino": f"/flota/{s.vehiculo_id}",
                "fecha_objetivo": s.proxima_fecha,
            })
    return items


def licencia_cliente_por_vencer(db: Session, hoy: date) -> list[dict]:
    clientes = (
        db.query(Cliente)
        .filter(Cliente.activo == True, Cliente.licencia_vencimiento.isnot(None), Cliente.licencia_vencimiento >= hoy)
        .all()
    )
    items = []
    for c in clientes:
        dias = (c.licencia_vencimiento - hoy).days
        if dias <= 7:
            umbral = 7
        elif dias <= 30:
            umbral = 30
        else:
            continue
        items.append({
            "tipo": "licencia_cliente_por_vencer",
            "titulo": "Licencia de cliente por vencer",
            "descripcion": f"{_cliente_nombre(c)} — vence el {c.licencia_vencimiento} (T-{umbral})",
            "urgencia": "media",
            "entidad_tipo": "cliente",
            "entidad_id": c.id,
            "url_destino": f"/clientes/{c.id}",
            "fecha_objetivo": c.licencia_vencimiento,
        })
    return items


def licencia_vencida_con_reserva_futura(db: Session, hoy: date) -> list[dict]:
    clientes_vencidos = (
        db.query(Cliente)
        .filter(Cliente.activo == True, Cliente.licencia_vencimiento.isnot(None), Cliente.licencia_vencimiento < hoy)
        .all()
    )
    if not clientes_vencidos:
        return []
    ids = [c.id for c in clientes_vencidos]
    reservas = (
        db.query(Reserva)
        .filter(
            Reserva.cliente_id.in_(ids),
            Reserva.estado.in_(["pendiente", "confirmada"]),
            Reserva.fecha_inicio >= hoy,
        )
        .all()
    )
    by_cliente = {c.id: c for c in clientes_vencidos}
    return [
        {
            "tipo": "licencia_vencida_reserva_futura",
            "titulo": "Licencia vencida con reserva futura",
            "descripcion": f"{_cliente_nombre(by_cliente[r.cliente_id])} tiene la reserva #{r.id} el {r.fecha_inicio} con la licencia vencida",
            "urgencia": "alta",
            "entidad_tipo": "reserva",
            "entidad_id": r.id,
            "url_destino": "/reservas",
            "fecha_objetivo": r.fecha_inicio,
        }
        for r in reservas
    ]


def vehiculo_fuera_de_servicio_prolongado(db: Session, hoy: date) -> list[dict]:
    limite = datetime.utcnow() - timedelta(days=7)
    vehiculos = (
        db.query(Vehiculo)
        .filter(Vehiculo.activo == True, Vehiculo.estado == "fuera_de_servicio", Vehiculo.estado_desde < limite)
        .all()
    )
    return [
        {
            "tipo": "vehiculo_fuera_servicio_prolongado",
            "titulo": "Vehículo fuera de servicio hace más de 7 días",
            "descripcion": f"{_vehiculo_desc(v)} — fuera de servicio desde {v.estado_desde.strftime('%d/%m/%Y')}",
            "urgencia": "media",
            "entidad_tipo": "vehiculo",
            "entidad_id": v.id,
            "url_destino": f"/flota/{v.id}",
            "fecha_objetivo": hoy,
        }
        for v in vehiculos
    ]


# ── Multas ───────────────────────────────────────────────────────────────────

def multa_pendiente_imputar(db: Session, hoy: date) -> list[dict]:
    multas = db.query(Multa).filter(Multa.estado == "pendiente", Multa.activo == True).all()
    return [
        {
            "tipo": "multa_pendiente_imputar",
            "titulo": "Multa pendiente de imputar",
            "descripcion": f"Multa #{m.id} — ${m.monto} — {(m.descripcion or '')[:50]}",
            "urgencia": "media",
            "entidad_tipo": "multa",
            "entidad_id": m.id,
            "url_destino": "/multas",
            "fecha_objetivo": m.fecha_infraccion,
        }
        for m in multas
    ]


def multa_imputada_sin_cobrar(db: Session, hoy: date) -> list[dict]:
    limite = datetime.utcnow() - timedelta(days=15)
    multas = (
        db.query(Multa)
        .filter(Multa.estado == "imputada", Multa.activo == True, Multa.fecha_imputada.isnot(None), Multa.fecha_imputada < limite)
        .all()
    )
    return [
        {
            "tipo": "multa_imputada_sin_cobrar",
            "titulo": "Multa imputada sin cobrar hace más de 15 días",
            "descripcion": f"Multa #{m.id} — ${m.monto} — imputada el {m.fecha_imputada.strftime('%d/%m/%Y')}",
            "urgencia": "media",
            "entidad_tipo": "multa",
            "entidad_id": m.id,
            "url_destino": "/multas",
            "fecha_objetivo": hoy,
        }
        for m in multas
    ]


def multa_por_vencer(db: Session, hoy: date) -> list[dict]:
    """
    Multa con vencimiento cerca y todavía sin resolver (D-28).

    La ventana sale de `configuracion` (`multas.dias_aviso_vencimiento`,
    default 7) porque es un número que el negocio ajusta. Se lee con un import
    diferido para que este módulo siga siendo importable sin sesión, como el
    resto del catálogo.
    """
    from app.services.configuracion_service import ConfiguracionService

    dias = ConfiguracionService(db).get_int("multas.dias_aviso_vencimiento", 7)
    limite = hoy + timedelta(days=dias)

    multas = (
        db.query(Multa)
        .filter(
            Multa.activo == True,
            Multa.estado.in_(["pendiente", "imputada"]),
            Multa.fecha_vencimiento.isnot(None),
            Multa.fecha_vencimiento >= hoy,
            Multa.fecha_vencimiento <= limite,
        )
        .all()
    )
    return [
        {
            "tipo": "multa_por_vencer",
            "titulo": f"Multa vence en {(m.fecha_vencimiento - hoy).days} día(s)",
            "descripcion": (
                f"Multa #{m.id} — ${m.monto} — {m.patente} — "
                f"vence el {m.fecha_vencimiento.strftime('%d/%m/%Y')}"
            ),
            # Alta y no media: pasado el vencimiento la multa cuesta más plata,
            # y eso es exactamente lo que este aviso existe para evitar.
            "urgencia": "alta",
            "entidad_tipo": "multa",
            "entidad_id": m.id,
            "url_destino": "/multas",
            "fecha_objetivo": m.fecha_vencimiento,
        }
        for m in multas
    ]


def multa_vencida(db: Session, hoy: date) -> list[dict]:
    """Multa que ya venció y sigue sin resolverse. Ya se está perdiendo plata."""
    multas = (
        db.query(Multa)
        .filter(
            Multa.activo == True,
            Multa.estado.in_(["pendiente", "imputada"]),
            Multa.fecha_vencimiento.isnot(None),
            Multa.fecha_vencimiento < hoy,
        )
        .all()
    )
    return [
        {
            "tipo": "multa_vencida",
            "titulo": f"Multa VENCIDA hace {(hoy - m.fecha_vencimiento).days} día(s)",
            "descripcion": (
                f"Multa #{m.id} — ${m.monto} — {m.patente} — "
                f"venció el {m.fecha_vencimiento.strftime('%d/%m/%Y')}"
            ),
            "urgencia": "critica",
            "entidad_tipo": "multa",
            "entidad_id": m.id,
            "url_destino": "/multas",
            "fecha_objetivo": m.fecha_vencimiento,
        }
        for m in multas
    ]


# ── Catálogo completo ────────────────────────────────────────────────────────

REGLAS = [
    entregas_hoy,
    devoluciones_hoy,
    checkout_pendiente,
    checkin_vencido,
    contrato_no_firmado_entrega_hoy,
    reserva_pendiente_24hs,
    echeq_proximo_t2,
    echeq_vence_hoy,
    echeq_sin_acreditar,
    echeq_rechazado,
    cc_vencimiento_proximo,
    cc_vencida,
    cliente_supera_limite_credito,
    saldo_pendiente_al_finalizar,
    garantia_sin_resolver,
    factura_pendiente_emitir,
    doc_vehiculo_vencimiento,
    vtv_vencimiento,
    poliza_vencimiento,
    doc_cliente_vencimiento,
    service_km,
    service_fecha,
    licencia_cliente_por_vencer,
    licencia_vencida_con_reserva_futura,
    vehiculo_fuera_de_servicio_prolongado,
    multa_pendiente_imputar,
    multa_imputada_sin_cobrar,
    multa_por_vencer,
    multa_vencida,
]


def evaluar_todas(db: Session, hoy: date | None = None) -> list[dict]:
    hoy = hoy or date.today()
    candidatos: list[dict] = []
    for regla in REGLAS:
        candidatos.extend(regla(db, hoy))
    return candidatos
