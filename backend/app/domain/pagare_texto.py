"""
El texto del pagaré, resuelto. Lógica pura: sin base, sin PDF.

**Es el texto que pidió Ubicar el 12/09/2026, con tres correcciones de forma y
ninguna de fondo:**

1. *"hago/hacemos constatar expresamente qué"* → *"hago/hacemos constar
   expresamente que"*. "Hacer constar" es la fórmula (dejar asentado);
   "constatar" es comprobar un hecho, y el "qué" con tilde es interrogativo.
2. *"satisfaccion"* → *"satisfacción"*.
3. Los singulares y plurales —*pagaré(mos)*, *mi/nuestro*, *hago/hacemos*,
   *amplío/ampliamos*, *suscriptor(es)*— **se resuelven** según cuántos firman.
   Un papel que dice "pagaré(mos)" con los paréntesis impresos se lee como un
   formulario sin completar.

**Lo que se agregó: el título "PAGARÉ".** El art. 101 del Decreto-Ley 5965/63
pide la denominación del título inserta en el texto. El verbo "pagaré" del
cuerpo probablemente alcance, pero hay discusión, y un encabezado cuesta una
línea y la cierra.

**Lo que no se tocó**: los artículos citados (50 "sin protesto", 36 ampliación
del plazo de presentación) y la estructura. Cualquier cambio de redacción legal
es decisión del abogado de Finar, no del sistema — ver `docs/PAGARE.md`.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.domain.monto_letras import monto_a_letras

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# El documento se llama **"Franquicia"** para quien lo ve y lo firma (pedido de
# Ubicar, 23/09/2026). El cuerpo sigue diciendo "pagaré" —"A la vista pagaré
# solidariamente y sin protesto"—: es el texto legal, y el art. 101 pide la
# denominación del título inserta en el texto. El encabezado es lo que se
# renombra; la redacción legal no se toca sin el abogado.
TITULO = "FRANQUICIA"

# La declaración que el cliente tilda en el link antes de firmar. Va aparte de
# las del contrato: aceptar las cláusulas del alquiler no es aceptar firmar un
# título que se puede cobrar por vía ejecutiva, y quien firma tiene que leer
# eso dicho con todas las letras.
ACEPTACION = {
    "clave": "pagare",
    "titulo": "Franquicia",
    "texto": (
        "Leí la Franquicia y entiendo que firmo un pagaré a la vista por el monto "
        "indicado, que puede ser presentado al cobro sin necesidad de otro "
        "trámite, junto con {codeudores}."
    ),
}


def encabezado_fecha(lugar: str, dia: date) -> str:
    """'Bahía Blanca, 12 de septiembre de 2026'."""
    return f"{lugar}, {dia.day} de {MESES[dia.month - 1]} de {dia.year}"


def monto_numerico(monto) -> str:
    """'140.000,00' — el formato argentino, sin el signo (lo pone quien imprime)."""
    v = Decimal(str(monto)).quantize(Decimal("0.01"))
    entero, dec = f"{v:.2f}".split(".")
    con_puntos = f"{int(entero):,}".replace(",", ".")
    return f"{con_puntos},{dec}"


def texto_aceptacion(cantidad_codeudores: int) -> dict:
    otros = (
        "mi co-deudor, que firma conmigo" if cantidad_codeudores == 1
        else f"mis {cantidad_codeudores} co-deudores, que firman conmigo"
        if cantidad_codeudores > 1 else "nadie más: firmo solo"
    )
    return {**ACEPTACION, "texto": ACEPTACION["texto"].format(codeudores=otros)}


def cuerpo(
    *,
    beneficiario: str,
    monto,
    lugar_pago: str,
    interes_compensatorio: str,
    interes_punitorio: str,
    firmantes: int,
) -> str:
    """El párrafo del pagaré, con singular o plural resuelto."""
    plural = firmantes > 1
    pagare = "pagaremos" if plural else "pagaré"
    caracter = "nuestro carácter de suscriptores" if plural else "mi carácter de suscriptor"
    hago = "hacemos" if plural else "hago"
    amplio = "ampliamos" if plural else "amplío"
    letras = monto_a_letras(Decimal(str(monto)))

    return (
        f"A la vista {pagare} solidariamente y sin protesto (Art. 50 - Dec. Ley "
        f"5965/63), a {beneficiario} o a su orden, la cantidad de {letras} por "
        f"igual valor recibido en efectivo, en este acto a entera satisfacción. "
        f"En {caracter} {hago} constar expresamente que, con sujeción a lo que "
        f"establece el artículo 36 del Dec. Ley N° 5965/63, {amplio} el plazo de "
        f"presentación para el pago de este pagaré hasta cinco años, a contar "
        f"desde la fecha. El presente documento es pagadero en {lugar_pago}. El "
        f"crédito documentado en el presente pagaré devengará un interés "
        f"compensatorio del {interes_compensatorio} anual vencido y un interés "
        f"punitorio del {interes_punitorio} anual vencido."
    )
