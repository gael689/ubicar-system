"""
Clausulado del contrato de alquiler — versión 2.

**Esto es el contenido de la plantilla v1, no la fuente de verdad en runtime.**
Se carga una vez a `contrato_plantillas` (ver `ContratoService.asegurar_plantilla`)
y de ahí en más el clausulado vive en la base, versionado: un contrato firmado
tiene que poder reimprimirse exactamente como se firmó, aunque después se
corrija una cláusula.

**Origen (D-33).** Se adopta el clausulado del contrato modelo aportado por el
usuario, completo y en el mismo orden, con las correcciones documentadas en
`docs/PLAN_CONTRATOS.md` §4 — los pasajes que, copiados literal, serían falsos
o inaplicables:

1. `{{LOCADOR}}` reemplaza al nombre de la persona física del original. Es un
   placeholder y no un literal para que cambiar de persona física a sociedad
   sea un valor de configuración, no reescribir 13 cláusulas.
2. ~~Los productos de cobertura no se nombran.~~ **Revertido en la v2.**
   Cuando se escribió la v1, Ubicar no vendía coberturas con nombre y
   mencionarlas habría dejado reclamar una que no existía. Ahora sí las vende:
   Mid Cover, Top Cover y Super Top Cover. La cláusula 5 las nombra y las
   define, y el anverso las referencia con los mismos asteriscos —que es lo
   que hace que un asterisco en el anverso lleve a algún lado.
3. Jurisdicción: **Bahía Blanca**, no Capital Federal (cláusula 13).
4. El pie fiscal es de Ubicar; se resuelve desde `configuracion`.
5. La numeración rota de la cláusula 12 (un "4." huérfano) se corrige: pasa a
   ser un párrafo más de Previsiones Generales.
6. "mequear" (typo de "chequear" impreso en el original) → "verificar".
7. El "formulario de accidente incluido con los papeles del vehículo" no
   existe en Ubicar: la obligación se reformula como comunicación por escrito
   por los medios de contacto (D-C5).

**Qué cambió en la v2 (agosto 2026).** Todo en la cláusula 5:

a. **Se nombran las tres coberturas** con sus marcas de nota al pie —
   `Mid Cover*`, `Top Cover**`, `Super Top Cover***`— y se las define. El
   anverso imprime el mismo asterisco al lado de la contratada.
b. **El escalón de vuelco/airbag de Super Top Cover**, que la v1 no tenía: la
   franquicia se cuadriplica y Top Cover no aplica, pero con Super Top Cover
   el cliente pone el 75 % de esa franquicia cuadriplicada.
c. **Ruedas y vidrios, explícito**: contratar cualquiera de las tres las
   excluye, y existe "Protección Ruedas y Vidrios" aparte.
d. **No se copia "Reducción de la Franquicia a CERO"** del contrato modelo.
   Sería falso: `domain/franquicia.py::FRANQUICIA_MINIMA` no deja bajar de
   $500.000, y ninguna cobertura de Ubicar lleva la franquicia a cero.
   Por lo mismo tampoco se copia "Cobertura a todo riesgo" — no existe la
   cobertura total, y el papel no puede sugerir que sí.

Los `subrayados` son pares [inicio, fin] de índices sobre el texto del párrafo.
Marcan los pasajes de exención de responsabilidad y penalidades que en el
original van subrayados — que estén marcados es parte de la validez.
"""

TITULO = "CLÁUSULAS, CONDICIONES Y NORMAS DE UTILIZACIÓN DEL VEHÍCULO"

# **La versión del clausulado que contiene este módulo.**
#
# `ContratoService.plantilla_vigente()` la compara con la que está activa en
# `contrato_plantillas` y publica una nueva si el código quedó adelante. Sin
# este número habría que acordarse de publicar la versión a mano después de
# cada deploy, y el día que alguien se olvide los contratos se siguen firmando
# con el texto viejo sin que nada avise.
VERSION = 2

# Marcador que el generador reemplaza por `empresa.locador_nombre`.
LOCADOR = "{{LOCADOR}}"


# ─── Las marcas de nota al pie de las coberturas ──────────────────────────────
#
# El anverso imprime `Top Cover**` y la cláusula 5 define `Top Cover**`. Ese
# asterisco es todo el mecanismo: el cliente lee un nombre arriba y sabe dónde
# buscar qué significa.
#
# **Va acá y no en la tabla `adicionales` a propósito.** El asterisco no es un
# dato del producto —en la web "Top Cover**" se leería como un error de
# tipeo—, es una referencia interna a *este* texto. Vive con el texto que
# referencia, y se versiona con él.
#
# La clave es el `codigo` del adicional, que es estable y único; el `nombre` lo
# pueden editar desde el ABM. Si alguien carga una cobertura con otro código,
# `marca_cobertura` devuelve cadena vacía: el nombre se imprime sin asterisco,
# que es lo correcto —un asterisco que no lleva a ninguna cláusula es peor que
# ningún asterisco.
MARCAS_COBERTURA: dict[str, str] = {
    "cobertura_mid": "*",
    "cobertura_top": "**",
    "cobertura_super_top": "***",
}


def marca_cobertura(codigo: str | None) -> str:
    """La marca de nota al pie de una cobertura, o `""` si no tiene."""
    return MARCAS_COBERTURA.get(codigo or "", "")


def _p(texto: str, subrayados: list[list[int]] | None = None) -> dict:
    return {"texto": texto, "subrayados": subrayados or []}


def _ps(texto: str, *frases: str) -> dict:
    """
    Igual que `_p`, pero los subrayados se dan **por la frase a subrayar** en
    vez de por índices.

    Los índices a mano son imposibles de mantener: corregir una coma cinco
    palabras antes corre todo el rango, y el error no se ve hasta que alguien
    mira un PDF y encuentra un subrayado que empieza a mitad de una palabra.
    Eso ya pasó acá.

    Falla al importar si la frase no está en el texto. Es a propósito: un
    subrayado que no engancha es un pasaje de exención de responsabilidad que
    dejó de estar marcado, y eso es parte de la validez del documento — mejor
    que no arranque a que salga un contrato mal marcado.
    """
    subrayados: list[list[int]] = []
    for frase in frases:
        inicio = texto.find(frase)
        if inicio < 0:
            raise ValueError(f"El subrayado {frase[:40]!r} no está en el párrafo")
        subrayados.append([inicio, inicio + len(frase)])
    return {"texto": texto, "subrayados": subrayados}


CLAUSULAS: list[dict] = [
    {
        "numero": 1,
        "titulo": "Entrega y restitución del Vehículo",
        "parrafos": [
            _p(
                "En el momento de entrega y en el de restitución del Vehículo, las partes "
                "constatarán el estado general del mismo, indicándose expresamente: a) la "
                "existencia de daños y/o faltantes; b) kilometraje y carga de combustible "
                "según los indicadores de fábrica, etc. y determinación de los cargos "
                f"adicionales, si correspondiere. El Vehículo deberá ser restituido a {LOCADOR} "
                "con el tanque lleno de combustible."
            ),
            _p(
                "El canon locativo no incluye los costos de combustible, de servicio, ni de "
                "entrega ni de retiro del Vehículo."
            ),
            _p(
                "La constatación del estado general del Vehículo será realizada al momento de "
                f"la restitución por {LOCADOR} con la participación del CLIENTE si éste así lo "
                "deseara y si la restitución tuviere lugar dentro del horario de atención al "
                "público en la oficina donde la restitución se efectúe. Si el CLIENTE optare "
                "por no participar de la constatación o si la restitución se operara fuera del "
                "horario de atención al público en la oficina donde la restitución se efectúe, "
                f"{LOCADOR} realizará la constatación del estado general del Vehículo "
                "unilateralmente y se considerará, sin admitirse prueba en contrario, la "
                f"conformidad del CLIENTE con dicha constatación unilateral. Si {LOCADOR} "
                "constatara daños, faltantes y/o desperfectos no constatados ni denunciados al "
                "momento de la entrega u ocultos, así como si fuera notificado de alguna multa "
                "y/o reclamo con relación al Vehículo causados durante el período comprendido "
                f"entre la entrega y restitución del Vehículo, {LOCADOR} notificará al CLIENTE "
                "tal circunstancia, pudiendo exigir las diferencias resultantes o imputarlas "
                "contra la garantía que hubiese otorgado el CLIENTE, según la liquidación que "
                f"{LOCADOR} hubiese practicado."
            ),
        ],
    },
    {
        "numero": 2,
        "titulo": "Obligaciones del CLIENTE",
        "parrafos": [
            _p("El CLIENTE se obliga a:"),
            _p("a) Mantener la guarda, tenencia y custodia del Vehículo durante toda la vigencia de este Contrato."),
            _p("b) Abonar la totalidad de los cargos que componen el canon locativo del Vehículo, en tiempo y forma."),
            _p("c) Restituir toda la documentación que se le entrega en este acto."),
            _p(
                "d) Restituir el Vehículo en el tiempo y lugar convenidos por las partes "
                "(conforme se describe en el anverso de este Contrato), o donde expresamente "
                f"lo autorice {LOCADOR}."
            ),
            _p(
                "e) Respetar los límites de velocidad y normas de conducción, conforme a la "
                "normativa vigente en cada momento y lugar por donde transite."
            ),
            _p(
                f"f) Comunicar por escrito a {LOCADOR}, por los medios de contacto indicados en "
                "el presente y dentro de las 24 horas de ocurrido, todo siniestro y/o medida "
                "cautelar (secuestro, retención, etc.) que recaiga sobre el Vehículo, "
                "detallando de forma íntegra y cuidadosa las circunstancias del hecho, y "
                f"debiendo acatar las instrucciones que oportunamente le indique {LOCADOR}."
            ),
            _p(
                "g) En caso de siniestro deberá efectuar oportunamente la denuncia policial y/o "
                "exposición civil que correspondiere, suscribir oportunamente la constancia de "
                "denuncia por ante la aseguradora, brindando toda la información que se le "
                "requiera y prestar la colaboración necesaria para la mejor defensa de los "
                f"derechos de {LOCADOR}."
            ),
            _p(
                "h) Comunicar fehacientemente, al momento de la suscripción del presente o con "
                "posterioridad, si se prevé la posibilidad de que existan conductores "
                "adicionales, indicando por escrito los nombres, documentos de identidad y "
                "direcciones de todos ellos para su inclusión en el Contrato. Dichos "
                f"conductores podrán conducir el Vehículo sólo si {LOCADOR} los autoriza "
                "expresamente. El CLIENTE deberá verificar si tales conductores tienen licencia "
                "de conducir válida para todas las jurisdicciones donde va a circular el Vehículo."
            ),
            _p(
                "i) Para el caso de que el CLIENTE fuere una persona jurídica y/o asociación "
                "civil o religiosa, deberá indicar la/s persona/s autorizada/s y habilitada/s "
                "para conducir el Vehículo mediante los instrumentos suficientes según la "
                "reglamentación de cada jurisdicción."
            ),
            _p(
                "j) En caso de necesidad urgente de reparar el Vehículo, el CLIENTE deberá "
                f"hacerlo reparar por un servicio mecánico autorizado por {LOCADOR}."
            ),
        ],
    },
    {
        "numero": 3,
        "titulo": "Prohibiciones del CLIENTE",
        "parrafos": [
            _p("El CLIENTE no podrá, sea él mismo o terceras partes:"),
            _p(
                "a) Utilizar el Vehículo para transporte a título oneroso o gratuito, ni "
                "participar ni realizar envíos de cualquier tipo e índole, de correspondencia o "
                "de cualquier otro tipo de efectos."
            ),
            _p(
                "b) Transportar cosas prohibidas por la legislación vigente, equipos inflamables "
                "o peligrosos, y/o cualquier otra cosa riesgosa."
            ),
            _p("c) Remolcar ni empujar vehículos o equipos propios ni ajenos."),
            _p(
                "d) Participar en carreras, pruebas, actividades ni competiciones deportivas, "
                "aprendizaje en conducción, ni ningún otro tipo de eventos o procesos que "
                "involucren riesgos extraordinarios."
            ),
            _p(
                "e) Conducir el Vehículo bajo influencia de cualquier tipo de medicación "
                "(recetada o no), alcohol o sustancia que pudiere afectar su capacidad de conducción."
            ),
            _p(
                "f) Trasladar el Vehículo fuera de la República Argentina sin autorización "
                f"expresa de {LOCADOR}."
            ),
        ],
    },
    {
        "numero": 4,
        "titulo": f"Obligaciones de {LOCADOR}",
        "parrafos": [
            _p(
                f"{LOCADOR} deberá contratar un seguro que cubra responsabilidad civil, conforme "
                "la normativa vigente."
            ),
        ],
    },
    {
        "numero": 5,
        "titulo": "Responsabilidad del CLIENTE",
        "parrafos": [
            _p(
                "El CLIENTE, así como cualquiera de los conductores autorizados o no que "
                "hubieren utilizado el Vehículo, son solidariamente responsables sin limitación "
                f"alguna y se obligan a mantener indemne a {LOCADOR} por todas las obligaciones, "
                "cargas y cargos pactados en este Contrato. En particular, sin que esta "
                "enumeración sea limitativa: por todo daño, pérdida, sustracción, hurto, robo, "
                "faltante, rotura, etc. que sufra el Vehículo y los objetos que se hallaren "
                "fuera o dentro del mismo, sin importar la causa; por todo costo derivado de la "
                "inutilización del Vehículo (lucro cesante, remolque, traslado, asistencia "
                "médica, etc.) u originado por el incumplimiento de sus obligaciones; por todos "
                "los daños mecánicos producidos por negligencia y/o mal uso; por cualquier "
                "violación a la normativa vigente en cada momento; por el pago de toda multa "
                "y/o sanción —cualquiera fuera su origen—; por cualquier reclamo de terceros "
                f"por daños a bienes y/o a personas que se le reclame a {LOCADOR}. El CLIENTE es "
                "responsable por la totalidad de las infracciones a leyes y/o reglamentaciones "
                "de tránsito nacionales, provinciales y/o municipales."
            ),
            _ps(
                "Asimismo, y en particular, el CLIENTE es responsable por la totalidad de los "
                "daños que sufra el vehículo alquilado en caso de accidentes que ocurran en "
                "caminos vecinales y en caminos de ripio y/o tierra a más de 50 km por hora, no "
                "resultando de aplicación en estos supuestos la franquicia. En caso de VUELCO "
                "y/o rotura de airbags del vehículo alquilado, el monto de la franquicia se "
                "cuadriplica en forma automática, no resultando de aplicación en este supuesto "
                "la cobertura adicional Top Cover**. Para Super Top Cover***, el valor a cargo "
                "del CLIENTE por VUELCO y/o rotura de airbag es el 75 % del valor de la "
                "franquicia cuadriplicada.",
                "el CLIENTE es responsable por la totalidad de los daños que sufra el vehículo "
                "alquilado en caso de accidentes que ocurran en caminos vecinales y en caminos "
                "de ripio y/o tierra a más de 50 km por hora, no resultando de aplicación en "
                "estos supuestos la franquicia",
                "el monto de la franquicia se cuadriplica en forma automática",
            ),
            _ps(
                "La cobertura contratada es la que se detalla en el anverso del presente con su "
                "franquicia correspondiente. Las opciones de limitación de responsabilidad que "
                f"ofrece {LOCADOR} son tres: (*) Mid Cover — Exención por Daños (LDW), incluida "
                "en el canon locativo, que deja a cargo del CLIENTE la franquicia base de la "
                "categoría del Vehículo; (**) Top Cover, cobertura adicional que reduce esa "
                "franquicia en el monto indicado en el anverso; y (***) Super Top Cover, "
                "cobertura adicional que la reduce en el monto mayor indicado en el anverso. "
                "Ninguna de las tres reduce la franquicia a cero: cualquiera sea la contratada, "
                "el CLIENTE conserva la responsabilidad por el monto de franquicia que consta "
                "en el anverso.",
                # Se subraya que la franquicia nunca es cero. Es exactamente lo
                # que un cliente cree haber comprado cuando paga el escalón más
                # caro, y el reclamo empieza ahí.
                "Ninguna de las tres reduce la franquicia a cero",
            ),
            _ps(
                "Mediante la contratación de cualquiera de las opciones de limitación de "
                "responsabilidad (Seguro de Responsabilidad Civil, Robo, Incendio y Daños / "
                "LDW: Mid Cover*, Top Cover** y/o Super Top Cover***) queda excluida la "
                "cobertura de \"Ruedas y Vidrios\", ya que el CLIENTE conoce que para estos "
                "últimos existe la opción de \"Protección Ruedas y Vidrios\", que se contrata "
                "por separado y, de haberse contratado, se detalla en el anverso.",
                "queda excluida la cobertura de \"Ruedas y Vidrios\"",
            ),
            _p(
                "Asimismo, no está incluido en Mid Cover*, Top Cover** ni Super Top Cover*** "
                "cualquier daño que pueda ocasionar al Vehículo la o las mascotas transportadas."
            ),
        ],
    },
    {
        "numero": 6,
        "titulo": "Débitos por cargos generados con posterioridad a la restitución del Vehículo",
        "parrafos": [
            _p(
                "El CLIENTE autoriza expresamente y en forma irrevocable a "
                f"{LOCADOR} a debitar —de su tarjeta de crédito y/o cuenta corriente o imputar "
                "contra las garantías que se hubiesen otorgado— todos los costos de locación y "
                "cualquier otra suma debida en función de lo pactado en este Contrato, "
                "incluyendo a título enunciativo: (i) el monto reclamado por multas y/o "
                "sanciones emanadas de autoridad competente; (ii) el monto resultante de los "
                "daños y faltantes (cualquiera sea su origen, ocultos o no); (iii) los cargos "
                "generados por entrega fuera de horario, aún cuando la no restitución no fuere "
                "por su culpa o dolo; (iv) los cargos por restituir el vehículo con el tanque de "
                "combustible diferente a las condiciones en el momento de la entrega; (v) lavado "
                "del vehículo cuando requiera lavado especial. El CLIENTE presta también su "
                "conformidad para debitar los costos administrativos y/o profesionales que tales "
                f"incumplimientos le ocasionen a {LOCADOR}.",
                [[0, 120]],
            ),
            _p(
                "En caso de que se reciban multas por infracciones cometidas durante el período "
                f"de alquiler, {LOCADOR} realizará el pago de la misma y trasladará el costo al "
                "CLIENTE con más gastos administrativos."
            ),
        ],
    },
    {
        "numero": 7,
        "titulo": "Pago fuera de término y/o desconocimiento de cargo",
        "parrafos": [
            _p(
                "La falta de pago en término de sus obligaciones y/o el desconocimiento de "
                "cargos efectuados en su tarjeta y que hubiere autorizado en el presente, "
                f"permitirán a {LOCADOR} reclamar lo adeudado con más un interés punitorio "
                "mensual adicional por mora, equivalente a dos veces la tasa activa del Banco de "
                "la Nación Argentina para operaciones de descuento, como así también la "
                "totalidad de los gastos y costas, judiciales o extrajudiciales, que se hubieren "
                "devengado como consecuencia de su incumplimiento.",
                [[0, 180]],
            ),
        ],
    },
    {
        "numero": 8,
        "titulo": "Rescisión",
        "parrafos": [
            _p(
                "Si el CLIENTE rescindiere anticipadamente este Contrato, deberá abonar a "
                f"{LOCADOR} la totalidad de los cargos establecidos por todo el período contractual.",
                [[0, 145]],
            ),
        ],
    },
    {
        "numero": 9,
        "titulo": "Pérdida de franquicia por daños al Vehículo",
        "parrafos": [
            _p(
                "La franquicia acordada con el CLIENTE no será aplicable cuando los daños que "
                "presente el Vehículo tuvieren su origen en la impericia, culpa, negligencia, "
                "dolo, etc. de aquél y/o del conductor autorizado.",
                [[0, 200]],
            ),
        ],
    },
    {
        "numero": 10,
        "titulo": "Recuperación de la tenencia del Vehículo",
        "parrafos": [
            _p(
                f"{LOCADOR} podrá recuperar la posesión y tenencia del Vehículo sin previo aviso, "
                "si constatare incumplimientos del CLIENTE."
            ),
        ],
    },
    {
        "numero": 11,
        "titulo": "Retención indebida",
        "parrafos": [
            _p(
                "La falta de restitución del Vehículo luego de transcurridas las 48 hs. de "
                "vencido el plazo acordado, se considerará —sin necesidad de requerimiento "
                "alguno previo— retención indebida en los términos de la legislación penal, "
                f"quedando facultado {LOCADOR} para iniciar las acciones penales y/o civiles que "
                "correspondan y reclamar los daños y perjuicios hasta la efectiva restitución "
                "del Vehículo, sin perjuicio de los demás reclamos a que tuviere derecho en "
                f"virtud de lo pactado en este Contrato. {LOCADOR} no será responsable por los "
                "perjuicios que dicha denuncia pudiera ocasionar al CLIENTE y/o conductores.",
                [[0, 215]],
            ),
        ],
    },
    {
        "numero": 12,
        "titulo": "Previsiones Generales",
        "parrafos": [
            _p(
                "En el caso de disputas relativas a la interpretación de este Contrato, la "
                "versión en español será la que debe ser tomada en cuenta."
            ),
            _p(
                "El CLIENTE sólo podrá compensar sumas o reclamos contra créditos o reclamos de "
                f"{LOCADOR} en la medida que aquellas sumas o reclamos del CLIENTE hayan sido "
                "establecidos judicialmente con efecto de cosa juzgada en favor del CLIENTE o de "
                "los conductores autorizados."
            ),
            _p(
                "Ningún acuerdo verbal suplementario ha sido celebrado. Cualquier acuerdo "
                "adicional y/o enmienda al presente deberá ser por escrito."
            ),
            _p(
                "El CLIENTE ha leído y acepta las condiciones contractuales que se establecen en "
                "el anverso y en el reverso del presente contrato."
            ),
        ],
    },
    {
        "numero": 13,
        "titulo": "Legislación y jurisdicción aplicable",
        "parrafos": [
            _p(
                "Las partes acuerdan que para todos los efectos legales que se pudieren derivar "
                "de la utilización del Vehículo, se someten a la jurisdicción de los Tribunales "
                "Ordinarios de {{JURISDICCION}}, con expresa renuncia a cualquier otra "
                "jurisdicción, incluso la Federal, que les pudiera corresponder en razón de su "
                "domicilio o nacionalidad, siendo de aplicación en todos los casos la ley "
                "vigente en la República Argentina, y siendo válidas las notificaciones que se "
                "cursen en los domicilios constituidos en este instrumento.",
                [[0, 230]],
            ),
        ],
    },
]


# Texto de aceptación del anverso, literal del original.
ACEPTACION = (
    "Por la presente acepto la información, los términos y condiciones que figuran "
    "en el anverso y reverso del presente contrato."
)


# ─── Aceptaciones de la firma remota (D-C6) ───────────────────────────────────
#
# Cuando el cliente firma por el link, además del trazo tiene que tildar estas
# casillas. **Las tres tienen que ser tildadas o no se puede firmar.**
#
# Por qué son varias y no una sola: cada una cubre un reclamo distinto. La
# primera es el contrato; la segunda son los términos del sitio, que hablan de
# la seña y la cancelación —cosas que el contrato de alquiler no toca porque
# ocurren antes de que exista el alquiler—; la tercera es la declaración sobre
# la licencia, que es lo primero que se discute cuando hay un siniestro y
# aparece que el conductor manejaba con el registro vencido.
#
# El texto se **congela en `contratos.firma_aceptaciones` al firmar**. Guardar
# sólo un booleano no probaría nada el día que estos textos cambien.

ACEPTACIONES: list[dict] = [
    {
        "clave": "contrato",
        "titulo": "Condiciones del contrato",
        "texto": (
            "Leí y acepto las cláusulas, condiciones y normas de utilización del "
            "vehículo que figuran en este contrato, incluido el detalle de cargos, "
            "la cobertura contratada y la franquicia a mi cargo."
        ),
    },
    {
        "clave": "terminos",
        "titulo": "Términos y condiciones y Política de privacidad",
        "texto": (
            "Acepto los Términos y Condiciones y la Política de Privacidad del "
            "sitio, incluida la política de seña y cancelación."
        ),
    },
    {
        "clave": "licencia",
        "titulo": "Declaración sobre la licencia y los datos",
        "texto": (
            "Declaro que los datos consignados son correctos y que cuento con "
            "licencia de conducir vigente y habilitante para el vehículo y las "
            "jurisdicciones por las que voy a circular."
        ),
    },
]

CLAVES_ACEPTACION = [a["clave"] for a in ACEPTACIONES]
