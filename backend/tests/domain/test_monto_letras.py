from decimal import Decimal

from app.domain.monto_letras import monto_a_letras


def test_cero():
    assert monto_a_letras(Decimal("0")) == "Pesos cero"


def test_unidades_y_centavos():
    assert monto_a_letras(Decimal("1")) == "Pesos uno"
    assert monto_a_letras(Decimal("15250.30")) == "Pesos quince mil doscientos cincuenta con 30 centavos"


def test_un_centavo_singular():
    assert monto_a_letras(Decimal("15250.01")) == "Pesos quince mil doscientos cincuenta con 1 centavo"


def test_veintis_especiales():
    assert monto_a_letras(Decimal("21")) == "Pesos veintiuno"


def test_cien_exacto_vs_cientos():
    assert monto_a_letras(Decimal("100")) == "Pesos cien"
    assert monto_a_letras(Decimal("101")) == "Pesos ciento uno"


def test_miles():
    assert monto_a_letras(Decimal("1000")) == "Pesos mil"
    assert monto_a_letras(Decimal("999")) == "Pesos novecientos noventa y nueve"


def test_millones():
    assert monto_a_letras(Decimal("1000000")) == "Pesos un millón"
    assert monto_a_letras(Decimal("2500000.50")) == "Pesos dos millones quinientos mil con 50 centavos"


def test_redondeo_centavos():
    assert monto_a_letras(Decimal("999999.999")) == "Pesos un millón"
