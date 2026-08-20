from __future__ import annotations
"""
Cálculo de edad — lógica pura, sin base.

**Vive acá y no en `recargo_edad.py` porque le sobrevivió.** Nació con el
recargo por franja etaria (D-38), pero cuando ese recargo se reemplazó por una
edad mínima (D-51) la función siguió haciendo falta: es la que decide si un
conductor puede alquilar por la web.
"""
from datetime import date


def calcular_edad(fecha_nacimiento: date, referencia: date) -> int:
    """
    Edad cumplida a la fecha de referencia.

    **La referencia es el día en que retira el auto**, no hoy: alguien que
    cumple 21 la semana que viene y alquila el mes que viene ya tiene la edad
    mínima cuando importa, y rechazarlo por la edad de hoy sería rechazar una
    venta válida.
    """
    edad = referencia.year - fecha_nacimiento.year
    if (referencia.month, referencia.day) < (fecha_nacimiento.month, fecha_nacimiento.day):
        edad -= 1
    return edad
