"""
Enums de dominio del sistema Ubicar Rent.
Sin dependencias externas — importables desde cualquier capa.
"""
from enum import Enum


class EstadoVehiculo(str, Enum):
    DISPONIBLE = "disponible"
    ALQUILADO = "alquilado"
    RESERVADO = "reservado"
    EN_TRANSICION = "en_transicion"
    FUERA_DE_SERVICIO = "fuera_de_servicio"


class TipoVehiculo(str, Enum):
    AUTO = "auto"
    CAMIONETA = "camioneta"


class EstadoReserva(str, Enum):
    PENDIENTE = "pendiente"
    CONFIRMADA = "confirmada"
    ACTIVA = "activa"
    VENCIDA = "vencida"  # pasó fecha_fin/hora_fin y el auto no volvió (sin checkin)
    FINALIZADA = "finalizada"
    CANCELADA = "cancelada"


class EstadoEcheq(str, Enum):
    EN_CARTERA = "en_cartera"
    DEPOSITADO = "depositado"
    ENDOSADO = "endosado"
    RECHAZADO = "rechazado"
    COBRADO = "cobrado"
    VENCIDO = "vencido"


class TipoTarifa(str, Enum):
    DIARIA = "diaria"
    SEMANAL = "semanal"
    MENSUAL = "mensual"


class MetodoPago(str, Enum):
    EFECTIVO = "efectivo"
    TRANSFERENCIA = "transferencia"
    TARJETA = "tarjeta"
    CHEQUE = "cheque"
    ECHEQ = "echeq"
    CUENTA_CORRIENTE = "cuenta_corriente"


class TipoCliente(str, Enum):
    PARTICULAR = "particular"
    EMPRESA = "empresa"


class RolUsuario(str, Enum):
    ADMIN = "admin"
    DOCS = "docs"


class TipoGasto(str, Enum):
    SERVICE = "service"
    COMBUSTIBLE = "combustible"
    CUBIERTAS = "cubiertas"
    REPARACION = "reparacion"
    SEGURO = "seguro"
    PATENTE = "patente"
    VTV = "vtv"
    LAVADO = "lavado"
    OTRO = "otro"


class TipoDocumento(str, Enum):
    POLIZA = "poliza"
    VTV = "vtv"
    CLAUSULAS = "clausulas"
    OTRO = "otro"


class EstadoPresupuesto(str, Enum):
    BORRADOR = "borrador"
    ENVIADO = "enviado"
    ACEPTADO = "aceptado"
    VENCIDO = "vencido"


class TipoMovimiento(str, Enum):
    DEBITO = "debito"
    CREDITO = "credito"


class TipoEcheq(str, Enum):
    EMITIDO = "emitido"
    RECIBIDO = "recibido"


class EstadoMulta(str, Enum):
    PENDIENTE = "pendiente"
    IMPUTADA = "imputada"
    COBRADA = "cobrada"
    APELANDO = "apelando"


class EstadoLimpieza(str, Enum):
    LIMPIO = "limpio"
    SUCIO = "sucio"
    REQUIERE_LAVADO_PROFUNDO = "requiere_lavado_profundo"


class TipoGarantia(str, Enum):
    EFECTIVO = "efectivo"
    TARJETA = "tarjeta"
    TRANSFERENCIA = "transferencia"
    NO_APLICA = "no_aplica"


class EstadoGarantia(str, Enum):
    RETENIDA = "retenida"
    DEVUELTA = "devuelta"
    EJECUTADA_PARCIAL = "ejecutada_parcial"


class TipoServicio(str, Enum):
    SERVICE_GENERAL = "service_general"
    ACEITE = "aceite"
    NEUMATICOS = "neumaticos"
    FRENOS = "frenos"
    FILTROS = "filtros"
    CORREA = "correa"
    SUSPENSION = "suspension"
    OTRO = "otro"


class DecisionExcedente(str, Enum):
    COBRAR_COMPLETO = "cobrar_completo"
    COBRAR_PARCIAL = "cobrar_parcial"
    UN_DIA_MAS = "un_dia_mas"        # D-19: contracargo preestablecido de 1 día
    MEDIO_DIA_MAS = "medio_dia_mas"  # D-19: contracargo preestablecido de medio día
    MONTO_MANUAL = "monto_manual"    # D-19: importe negociado puntual
    NO_COBRAR = "no_cobrar"          # bonificado — requiere motivo
