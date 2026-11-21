"""
Catálogo de avisos: a qué **módulo** pertenece cada `tipo` y qué hay que hacer.

**Fuente única.** Antes esto vivía en el frontend (`lib/notificaciones.ts`),
como quince "familias" con emoji que había que acordarse de tocar cada vez que
se sumaba una regla — y cuando no se tocaba, el aviso caía en "Otros", que es
donde nadie mira. Ahora el backend manda `modulo`, `modulo_label` y `accion`
con cada aviso y la pantalla sólo los dibuja.

El pedido (21/11/2026): *"hay demasiadas notificaciones desordenadas, las
modularizaría"*. La idea es que alguien del mostrador entienda en tres
segundos qué tiene que atender y de qué área es.

Es puro: no toca la base. `tests/domain/test_avisos_catalogo.py` cruza este
catálogo con las reglas — si alguien agrega una regla sin catalogarla, falla.
"""
from __future__ import annotations

# Clave → etiqueta, **en el orden en que se muestran**.
MODULOS: dict[str, str] = {
    "operacion": "Operación",
    "cobranzas": "Cobranzas",
    "flota": "Flota",
    "clientes": "Clientes",
    "web": "Web y ventas",
    # Reservado para el paquete de Uber: hoy sólo tiene la oportunidad del auto
    # sin chofer, pero el módulo ya existe para que la pantalla no cambie.
    "uber": "Uber",
    "configuracion": "Falta completar",
    "oportunidades": "Oportunidades",
}

MODULO_POR_DEFECTO = "operacion"
ACCION_POR_DEFECTO = "Ver"
MODULO_OPORTUNIDADES = "oportunidades"

# Las oportunidades se reconocen por el prefijo, no por el módulo: la del auto
# de Uber sin chofer es una oportunidad que pertenece al módulo `uber`.
PREFIJO_OPORTUNIDAD = "op_"

# tipo → (módulo, acción sugerida). La acción va en imperativo y corta: es el
# texto del botón.
CATALOGO: dict[str, tuple[str, str]] = {
    # ── Operación: entregas, devoluciones, contratos ─────────────────────────
    "checkout_pendiente": ("operacion", "Entregar el auto"),
    "checkin_vencido": ("operacion", "Registrar la devolución"),
    "contrato_no_firmado": ("operacion", "Reenviar el contrato"),
    "contrato_sin_firmar_auto_afuera": ("operacion", "Hacer firmar el contrato"),
    "contrato_sin_emitir": ("operacion", "Emitir el contrato"),
    # Sólo historial: nace resuelta, no suma a la campana.
    "contrato_firmado": ("operacion", "Ver el contrato"),
    # Ya no se generan; quedan por el historial.
    "entrega_hoy": ("operacion", "Entregar el auto"),
    "devolucion_hoy": ("operacion", "Registrar la devolución"),
    "reserva_pendiente_24hs": ("operacion", "Confirmar la reserva"),

    # ── Cobranzas: echeqs, cuenta corriente, saldos, garantías ───────────────
    "echeq_proximo": ("cobranzas", "Ver el echeq"),
    "echeq_vence_hoy": ("cobranzas", "Depositar el echeq"),
    "echeq_sin_acreditar": ("cobranzas", "Marcar acreditado"),
    "echeq_rechazado": ("cobranzas", "Reclamar el pago"),
    "cc_vencimiento_proximo": ("cobranzas", "Avisar al cliente"),
    "cc_vencida": ("cobranzas", "Reclamar el pago"),
    "limite_credito_superado": ("cobranzas", "Revisar la cuenta"),
    "saldo_pendiente_alquiler": ("cobranzas", "Cobrar el saldo"),
    "garantia_sin_resolver": ("cobranzas", "Resolver la garantía"),
    "factura_pendiente_emitir": ("cobranzas", "Emitir la factura"),
    "multa_imputada_sin_cobrar": ("cobranzas", "Cobrar la multa"),

    # ── Flota: papeles del auto, service, multas del auto ────────────────────
    "doc_vehiculo_vencido": ("flota", "Renovar el documento"),
    "doc_vehiculo_por_vencer": ("flota", "Renovar el documento"),
    "vtv_vencimiento": ("flota", "Renovar la VTV"),
    "poliza_vencimiento": ("flota", "Renovar la póliza"),
    "service_km_vencido": ("flota", "Agendar el service"),
    "service_km_proximo": ("flota", "Agendar el service"),
    "service_fecha_vencido": ("flota", "Agendar el service"),
    "service_fecha_proximo": ("flota", "Agendar el service"),
    "vehiculo_fuera_servicio_prolongado": ("flota", "Revisar el auto"),
    "multa_pendiente_imputar": ("flota", "Imputar la multa"),
    "multa_por_vencer": ("flota", "Pagar la multa"),
    "multa_vencida": ("flota", "Pagar la multa"),

    # ── Clientes: licencias, documentos y datos ──────────────────────────────
    "doc_cliente_vencido": ("clientes", "Pedir el documento"),
    "doc_cliente_por_vencer": ("clientes", "Pedir el documento"),
    "licencia_cliente_por_vencer": ("clientes", "Avisar al cliente"),
    "licencia_vencida_reserva_futura": ("clientes", "Pedir la licencia nueva"),
    "cliente_sin_completar": ("clientes", "Completar los datos"),

    # ── Web y ventas ─────────────────────────────────────────────────────────
    "reserva_web_nueva": ("web", "Atender la reserva"),
    "reserva_web_sin_atender": ("web", "Atender la reserva"),
    "reserva_web_sin_asignar": ("web", "Asignar un auto"),
    "reserva_web_esperando_transferencia": ("web", "Revisar el pago"),
    "solicitud_contacto": ("web", "Llamar al cliente"),
    "pago_web_devuelto": ("web", "Revisar la reserva"),
    # Una categoría publicada que la web no puede vender: es venta que no
    # entra hoy, no un dato por completar.
    "categoria_web_sin_precio": ("web", "Cargar el precio"),

    # ── Falta completar: huecos de datos y precios ───────────────────────────
    "fecha_especial_sin_precio": ("configuracion", "Cargar el precio"),
    "categoria_sin_precio": ("configuracion", "Cargar el precio"),
    "categoria_precio_generico": ("configuracion", "Revisar el precio"),
    "categoria_sin_franquicia": ("configuracion", "Cargar la franquicia"),
    "vehiculo_sin_categoria": ("configuracion", "Asignar la categoría"),
    "datos_empresa_sin_cargar": ("configuracion", "Completar los datos"),
    "datos_por_completar": ("configuracion", "Completar los datos"),

    # ── Oportunidades (`domain/oportunidades_reglas.py`) ─────────────────────
    "op_auto_parado": ("oportunidades", "Ver el auto"),
    "op_extension_posible": ("oportunidades", "Ofrecer la extensión"),
    "op_cliente_para_recontactar": ("oportunidades", "Ver el cliente"),
    "op_fecha_fuerte_con_autos_libres": ("oportunidades", "Ver ocupación"),
    "op_demanda_sin_cupo": ("oportunidades", "Ver bandeja de la web"),
    "op_cotizacion_sin_cerrar": ("oportunidades", "Seguir la cotización"),
    "op_ocupacion_alta": ("oportunidades", "Ver precios"),
    "op_pedir_resena": ("oportunidades", "Pedir las reseñas"),
    "op_prospectos_sin_contactar": ("oportunidades", "Ver prospectos"),
    "op_auto_uber_libre": ("uber", "Ver el auto"),

    # ── Uber: los emite el paquete de Uber (cobro semanal y contratos) ───────
    "uber_semana_vence_hoy": ("uber", "Cobrar la semana"),
    "uber_semana_atrasada": ("uber", "Cobrar lo atrasado"),
    "uber_km_excedido": ("uber", "Ver el contrato"),
    "uber_contrato_por_terminar": ("uber", "Renovar o coordinar devolución"),
}


def modulo_de(tipo: str) -> str:
    """El módulo del aviso. Un tipo que nadie catalogó cae en Operación: es
    preferible que aparezca en el módulo que más se mira a que se pierda."""
    return CATALOGO.get(tipo, (MODULO_POR_DEFECTO, ACCION_POR_DEFECTO))[0]


def accion_de(tipo: str) -> str:
    return CATALOGO.get(tipo, (MODULO_POR_DEFECTO, ACCION_POR_DEFECTO))[1]


def etiqueta_de(modulo: str) -> str:
    return MODULOS.get(modulo, modulo)


def es_oportunidad(tipo: str) -> bool:
    return tipo.startswith(PREFIJO_OPORTUNIDAD)


def tipos_de_modulo(modulo: str) -> set[str]:
    """Los `tipo` catalogados de un módulo — para filtrar en la base."""
    return {t for t, (m, _) in CATALOGO.items() if m == modulo}


def orden_de(modulo: str) -> int:
    claves = list(MODULOS)
    return claves.index(modulo) if modulo in claves else len(claves)
