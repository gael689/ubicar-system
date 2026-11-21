"""
Los mails de prospección de Ubicar, **ya escritos**.

Pedido de Gael (21/11/2026): *"ya dejarles hechos los mails a Ubicar (…) es
tedioso el crear campaña, enviar, muy largo, debe ser súper rápido, con un buen
mensaje"*. Hasta acá la campaña se armaba y el mensaje había que escribirlo de
cero cada vez; ahora se elige una plantilla y, si hace falta, se retoca.

## Una sola fuente, sin tabla

El catálogo es **código**: lo sirve `GET /prospectos/plantillas` y la pantalla
lo muestra. En la campaña se guarda **el texto**, no el id de la plantilla:
cambiar una plantilla acá no toca una campaña que ya salió.

## Qué se puede decir

Son mails en frío a empresas que no nos conocen, y tienen que parecer escritos
por una persona de Bahía —porque lo están—. Por eso:

- **Sólo lo que la web pública de Ubicar dice** (`web/lib/landings.ts`, página
  `/empresas`, 21/11/2026): autos y pick-ups 4x4; por día, por semana o por mes;
  mantenimiento, seguro y patente incluidos; retiro en Bahía Blanca, en el
  centro o en el aeropuerto; trato directo por WhatsApp. **Nada de precios, de
  cifras ni de "somos líderes"**. La web no habla de utilitarios ni de cuenta
  corriente, así que los mails tampoco.
- **Una idea y una pregunta**: cada plantilla nombra un problema concreto del
  rubro y cierra con una sola pregunta fácil de contestar.
- **Texto plano**, 70 a 110 palabras, de "ustedes". Sin imágenes ni botones: un
  mail con diseño es publicidad, y la publicidad va a Promociones o a spam.
- **Salida honesta**: "respondan «no» y no les escribimos más", y el pie con el
  link de baja. Sin eso no sale (ver `compuerta`).

## Variables y tramos opcionales

`{{empresa}}`, `{{ciudad}}`, `{{segmento}}`, `{{firma_nombre}}`,
`{{firma_telefono}}`, `{{web}}` y `{{baja}}`. La base de prospectos viene de
Google y tiene huecos, así que un tramo entre `[[` y `]]` **se cae entero si
alguna variable de adentro está vacía** (la misma idea que las plantillas de
Plenia):

    [[Vi que trabajan en {{ciudad}}.]]

**Una variable vacía o desconocida nunca sale literal**: se reemplaza por nada
y queda anotada en `faltantes`, que es lo que la vista previa le muestra a quien
está por mandar.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

#: Las variables que entiende el render. `baja` la pone el sistema (el link
#: firmado de cada prospecto); las demás salen del prospecto y de la firma.
VARIABLES: tuple[str, ...] = (
    "empresa", "ciudad", "segmento", "firma_nombre", "firma_telefono", "web", "baja",
)

#: Para qué sirve cada una, en palabras de mostrador (lo muestra el editor).
VARIABLES_AYUDA: dict[str, str] = {
    "empresa": "El nombre de la empresa",
    "ciudad": "La ciudad de la empresa",
    "segmento": "El rubro",
    "firma_nombre": "Quién firma",
    "firma_telefono": "El WhatsApp de quien firma",
    "web": "La web de Ubicar",
    "baja": "El link para no recibir más mails (obligatorio)",
}

ASUNTO_MAXIMO = 70          # más largo, el celular lo corta
ASUNTO_RECOMENDADO = 50
CUERPO_MAXIMO = 1500        # caracteres: un mail en frío que no entra en una pantalla no se lee
PALABRAS_MINIMO, PALABRAS_MAXIMO = 70, 110

_VARIABLE = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_OPCIONAL = re.compile(r"\[\[(.*?)\]\]", re.DOTALL)


# ─── Render ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Render:
    """El texto ya armado y lo que no se pudo completar."""
    texto: str
    #: Variables que el texto pedía y vinieron vacías o no existen. Las que
    #: estaban dentro de un tramo opcional **no** cuentan: para eso es opcional.
    faltantes: tuple[str, ...] = ()


def _valor(valores: dict[str, str | None], nombre: str) -> str:
    return str(valores.get(nombre) or "").strip()


def renderizar(texto: str | None, valores: dict[str, str | None]) -> Render:
    """
    Reemplaza las `{{variables}}` y resuelve los tramos `[[ … ]]`.

    Garantía que sostiene un test: **en el resultado no queda ningún `{{`, `}}`,
    `[[` ni `]]`**, pase lo que pase con los datos o con lo que alguien haya
    tipeado en el editor. Un mail en frío con un `{{empresa}}` a la vista es
    peor que no mandar nada.
    """
    faltantes: list[str] = []

    def tramo(m: re.Match[str]) -> str:
        adentro = m.group(1)
        if any(not _valor(valores, v) for v in _VARIABLE.findall(adentro)):
            return ""
        return adentro

    def variable(m: re.Match[str]) -> str:
        v = _valor(valores, m.group(1))
        if not v and m.group(1) not in faltantes:
            faltantes.append(m.group(1))
        return v

    salida = _OPCIONAL.sub(tramo, texto or "")
    salida = _VARIABLE.sub(variable, salida)
    # Lo que haya quedado suelto (un `[[` sin cerrar, una llave de más) se saca:
    # se ve feo en el editor, pero nunca llega a la casilla de nadie.
    salida = re.sub(r"\[\[|\]\]|\{\{|\}\}", "", salida)
    return Render(_prolijar(salida), tuple(faltantes))


def _prolijar(texto: str) -> str:
    """Los huecos que deja un tramo que se cayó: espacios dobles, líneas vacías de más."""
    lineas = [re.sub(r"[ \t]{2,}", " ", l).strip() for l in texto.replace("\r\n", "\n").split("\n")]
    lineas = [re.sub(r"\s+([,.;:?!])", r"\1", l) for l in lineas]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lineas)).strip()


def variables_desconocidas(texto: str | None) -> list[str]:
    """Las `{{cosas}}` que el render no conoce (un error de tipeo, casi siempre)."""
    vistas: list[str] = []
    for v in _VARIABLE.findall(texto or ""):
        if v not in VARIABLES and v not in vistas:
            vistas.append(v)
    return vistas


def contar_palabras(texto: str) -> int:
    return len(re.findall(r"[\wáéíóúñüÁÉÍÓÚÑÜ«»]+", texto or ""))


# ─── La compuerta ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Aviso:
    """Algo que revisar antes de mandar. `grave` = así no sale."""
    grave: bool
    texto: str


# Lo que un filtro de spam (y una persona) lee como publicidad. Lista corta y
# obvia a propósito: no es un antispam, es una baranda.
_GATILLOS = (
    (re.compile(r"!{2,}|¡{2,}"), "tiene signos de exclamación repetidos"),
    (re.compile(r"\bGRATIS\b"), "dice GRATIS en mayúsculas"),
    (re.compile(r"\b(oferta|promo(ci[oó]n)?)\s+imperdible\b", re.I), "dice «oferta imperdible»"),
    (re.compile(r"\b(100\s?%|garantizado|urgente|hac[eé] clic|haga clic|[uú]ltima oportunidad|"
                r"compr[aáe]\s+ya|sin costo alguno|dinero f[aá]cil)\b", re.I),
     "usa una frase típica de publicidad"),
    (re.compile(r"\${1,}\s?\d|\d\s?%\s+(de\s+)?(descuento|off)", re.I), "menciona precios o descuentos"),
)


def _mayusculas_sostenidas(texto: str) -> bool:
    """Tres palabras seguidas en mayúsculas, o más de la mitad del texto."""
    if re.search(r"\b[A-ZÁÉÍÓÚÑ]{3,}(\s+[A-ZÁÉÍÓÚÑ]{2,}){2,}\b", texto):
        return True
    letras = [c for c in texto if c.isalpha()]
    return len(letras) >= 12 and sum(c.isupper() for c in letras) > len(letras) * 0.5


def compuerta(asunto: str | None, cuerpo: str | None, *, link_baja: str | None = None) -> list[Aviso]:
    """
    Revisa un mensaje **ya renderizado**, justo antes de mandarlo.

    Devuelve avisos legibles; con alguno `grave` el mensaje no sale. `link_baja`
    es el link que tiene que figurar en el cuerpo: sin forma de darse de baja
    no se le escribe a nadie.
    """
    asunto, cuerpo = (asunto or "").strip(), (cuerpo or "").strip()
    avisos: list[Aviso] = []
    if not asunto:
        avisos.append(Aviso(True, "Falta el asunto."))
    if not cuerpo:
        avisos.append(Aviso(True, "Falta el mensaje."))
    if re.search(r"\{\{|\}\}|\[\[|\]\]", asunto + cuerpo):
        avisos.append(Aviso(True, "Quedó una variable sin completar ({{…}} o [[…]])."))
    if len(asunto) > ASUNTO_MAXIMO:
        avisos.append(Aviso(True, f"El asunto tiene {len(asunto)} caracteres: el máximo es {ASUNTO_MAXIMO}."))
    elif len(asunto) > ASUNTO_RECOMENDADO:
        avisos.append(Aviso(False, f"El asunto es largo ({len(asunto)} caracteres): en el celular se corta "
                                   f"después de los {ASUNTO_RECOMENDADO}."))
    if len(cuerpo) > CUERPO_MAXIMO:
        avisos.append(Aviso(True, f"El mensaje tiene {len(cuerpo)} caracteres: el máximo es {CUERPO_MAXIMO}. "
                                  "Un mail en frío largo no se lee."))
    # Con el link exacto en la mano se exige ése; sin él (una revisión suelta),
    # alcanza con que haya algún link de baja.
    tiene_baja = (link_baja in cuerpo) if link_baja else bool(re.search(r"https?://\S*baja", cuerpo))
    if cuerpo and not tiene_baja:
        avisos.append(Aviso(True, "Falta el pie con el link de baja ({{baja}}): sin eso no se puede mandar."))
    for patron, que in _GATILLOS:
        if patron.search(asunto):
            avisos.append(Aviso(True, f"El asunto {que}: así va directo a spam."))
        elif patron.search(cuerpo):
            avisos.append(Aviso(True, f"El mensaje {que}: así va directo a spam."))
    if asunto and _mayusculas_sostenidas(asunto):
        avisos.append(Aviso(True, "El asunto está en mayúsculas: se lee como publicidad."))
    return avisos


def revisar_plantilla(asunto: str | None, cuerpo: str | None) -> list[Aviso]:
    """
    Revisa el **texto con variables**, mientras se edita: variables mal
    escritas y el `{{baja}}` que no puede faltar. Lo demás lo mira `compuerta`
    sobre el mensaje ya armado.
    """
    avisos: list[Aviso] = []
    malas = variables_desconocidas((asunto or "") + " " + (cuerpo or ""))
    if malas:
        lista = ", ".join("{{" + m + "}}" for m in malas)
        avisos.append(Aviso(True, f"No conozco {lista}: revisá cómo está escrito."))
    if "baja" not in _VARIABLE.findall(cuerpo or ""):
        avisos.append(Aviso(True, "Falta el pie con el link de baja ({{baja}}): sin eso no se puede mandar."))
    elif "baja" not in _VARIABLE.findall(_OPCIONAL.sub("", cuerpo or "")):
        # Dentro de un `[[…]]` el link se caería con cualquier dato vacío.
        avisos.append(Aviso(True, "El link de baja ({{baja}}) no puede ir dentro de un tramo opcional [[…]]."))
    return avisos


def hay_graves(avisos: list[Aviso]) -> bool:
    return any(a.grave for a in avisos)


# ─── El catálogo ─────────────────────────────────────────────────────────────

#: La salida honesta: va en todas, antes de la firma.
SALIDA = "Si no les interesa, respondan «no» y no les escribimos más."

FIRMA = (
    "{{firma_nombre}}\n"
    "Ubicar Rent · Bahía Blanca\n"
    "[[WhatsApp {{firma_telefono}}\n]]"
    "{{web}}"
)

#: El pie legal. Corto: explica de dónde salió el contacto y cómo cortar.
PIE = (
    "--\n"
    "Les escribimos porque los datos de contacto de su empresa son públicos. "
    "Para no recibir más mails: {{baja}}"
)

DIAS_SEGUNDO_TOQUE = 5
DIAS_TERCER_TOQUE = 12


@dataclass(frozen=True)
class Seguimiento:
    """Un toque de seguimiento: a cuántos días del **primer** mail, y qué dice."""
    dias: int
    cuerpo: str


@dataclass(frozen=True)
class Plantilla:
    id: str
    nombre: str
    #: Una línea para el selector: a quién le habla.
    descripcion: str
    #: Dos o tres asuntos para elegir; el primero es el que se propone.
    asuntos: tuple[str, ...]
    #: El mensaje, sin la salida, la firma ni el pie (se le suman en `cuerpo`).
    mensaje: str
    #: De qué se trataba, para el "les escribí hace unos días por…".
    tema: str
    #: Los segmentos de la base a los que les habla (normalizados).
    segmentos: tuple[str, ...] = field(default_factory=tuple)

    @property
    def cuerpo(self) -> str:
        return f"{self.mensaje}\n\n{SALIDA}\n\n{FIRMA}\n\n{PIE}"

    @property
    def seguimientos(self) -> tuple[Seguimiento, Seguimiento]:
        segundo = (
            "Hola de nuevo:\n\n"
            f"Les escribí hace unos días por {self.tema}. Se lo reenvío por si quedó entre otros "
            "mails. ¿Les sirve que les cuente cómo trabajamos? Si prefieren, lo vemos por "
            "WhatsApp[[ al {{firma_telefono}}]].\n\n"
            "{{firma_nombre}}\nUbicar Rent\n\n" + PIE
        )
        tercero = (
            "Hola:\n\n"
            "Este es el último mensaje de nuestra parte: no queremos ocuparles la casilla. Si más "
            "adelante necesitan sumar un vehículo por unos días o por unos meses, nos encuentran en "
            "{{web}}[[ o por WhatsApp al {{firma_telefono}}]]. Gracias por el tiempo.\n\n"
            "{{firma_nombre}}\nUbicar Rent\n\n" + PIE
        )
        return Seguimiento(DIAS_SEGUNDO_TOQUE, segundo), Seguimiento(DIAS_TERCER_TOQUE, tercero)


def _norm(texto: str | None) -> str:
    v = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", v)).strip()


PLANTILLAS: tuple[Plantilla, ...] = (
    Plantilla(
        id="obra",
        nombre="Obra e industria",
        descripcion="Constructoras, ingeniería, montajes y obradores: la camioneta que falta.",
        asuntos=(
            "Camionetas para obra en Bahía Blanca",
            "Una pick-up cuando arranca un frente",
            "Camionetas por semana o por mes",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos pick-ups 4x4 y "
            "autos a empresas, por día, por semana o por mes.\n\n"
            "Se lo cuento por algo que en obra pasa seguido: arranca un frente nuevo, o se rompe una "
            "camioneta propia, y falta un vehículo justo esa semana. Para esos casos sumamos una "
            "unidad por el tiempo que haga falta, con mantenimiento, seguro y patente incluidos. Se "
            "retira en Bahía y lo coordinamos por WhatsApp.\n\n"
            "¿Quieren que les cuente cómo trabajamos, por si les hace falta más adelante?"
        ),
        tema="el alquiler de camionetas y autos para obra",
        segmentos=(
            "constructoras y desarrollo", "construccion y maquinaria",
            "ingenieria y servicios industriales", "montajes y mantenimiento industrial",
            "obradores y modulos habitacionales",
        ),
    ),
    Plantilla(
        id="energia_puerto",
        nombre="Energía, telecomunicaciones y puerto",
        descripcion="Paradas de planta y trabajos por contrato: la gente que llega de afuera.",
        asuntos=(
            "Vehículos para personal que viene de afuera",
            "Camionetas para una parada de planta",
            "Autos y pick-ups por contrato en Bahía",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos autos y pick-ups "
            "4x4 a empresas, por día, por semana o por mes.\n\n"
            "Pienso en una situación puntual: una parada de planta o un trabajo por contrato, con "
            "personal que llega de afuera por unas semanas y necesita moverse entre el alojamiento, "
            "la planta y el puerto. Les dejamos los vehículos listos para el tiempo que dure, con "
            "mantenimiento, seguro y patente incluidos. Se retiran en el centro o en el "
            "aeropuerto.\n\n"
            "¿Tienen algún trabajo así en los próximos meses?"
        ),
        tema="los vehículos para personal que llega de afuera",
        segmentos=("energia y telecomunicaciones", "puerto y comercio exterior"),
    ),
    Plantilla(
        id="turismo_eventos",
        nombre="Hotelería, turismo y eventos",
        descripcion="Hoteles, agencias y organizadores: mover huéspedes, invitados y equipo.",
        asuntos=(
            "Autos para sus huéspedes en Bahía Blanca",
            "Cuando un huésped les pide un auto",
            "Autos para el equipo de un evento",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos autos y pick-ups "
            "por día, por semana o por mes.\n\n"
            "Seguro les pasa: un huésped o un invitado que llega en avión y pregunta dónde conseguir "
            "un auto, o un evento en el que hay que mover al equipo por unos días. Para eso "
            "entregamos el vehículo en el Aeropuerto Comandante Espora a la hora pactada, o se "
            "retira en el centro, y se reserva online o por WhatsApp.\n\n"
            "¿Les sirve tener a quién derivar cuando les piden un auto?"
        ),
        tema="los autos para huéspedes, invitados y equipos de trabajo",
        segmentos=("hoteleria y turismo", "eventos y catering"),
    ),
    Plantilla(
        id="logistica",
        nombre="Logística y depósitos",
        descripcion="Reforzar los picos de trabajo sin comprar un vehículo más.",
        asuntos=(
            "Un vehículo más para los picos de trabajo",
            "Reforzar la flota sin comprar",
            "Pick-ups por semana en Bahía Blanca",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos pick-ups 4x4 y "
            "autos a empresas, por día, por semana o por mes.\n\n"
            "Lo pienso para los picos: semanas en las que el trabajo se junta y hace falta un "
            "vehículo más, pero no como para comprarlo. Suman una "
            "unidad por el tiempo que la necesiten y después la devuelven, con mantenimiento, seguro "
            "y patente incluidos. Se retira en Bahía y lo coordinamos por WhatsApp.\n\n"
            "¿Les pasa de quedarse cortos de vehículos en algún momento del año?"
        ),
        tema="sumar un vehículo en los picos de trabajo",
        segmentos=("logistica y depositos",),
    ),
    Plantilla(
        id="servicios",
        nombre="Inmobiliarias, seguros y servicios",
        descripcion="El auto propio en el taller, visitas afuera, clientes que se quedan a pie.",
        asuntos=(
            "Un auto para cuando el suyo no está",
            "Cuando un cliente se queda sin auto",
            "Autos por día o por semana en Bahía",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos autos y pick-ups "
            "por día, por semana o por mes.\n\n"
            "Les cuento por dos situaciones que vemos seguido. Una: el auto de la empresa queda en "
            "el taller y hay que seguir saliendo a la calle. La otra: un cliente se queda sin auto "
            "por unos días y les pregunta dónde conseguir uno. "
            "En los dos casos lo resolvemos rápido, con retiro en el centro y trato directo "
            "por WhatsApp.\n\n"
            "¿Quieren que les deje nuestro contacto para cuando lo necesiten?"
        ),
        tema="los autos por día o por semana",
        segmentos=("inmobiliarias", "seguros"),
    ),
    Plantilla(
        id="general",
        nombre="General",
        descripcion="Para cualquier empresa: qué hace Ubicar y cuándo sirve.",
        asuntos=(
            "Alquiler de vehículos para empresas en Bahía",
            "Autos y pick-ups por día, semana o mes",
            "Un vehículo más cuando haga falta",
        ),
        mensaje=(
            "Hola, equipo de {{empresa}}:\n\n"
            "Les escribo de Ubicar Rent, una rentadora de Bahía Blanca. Alquilamos autos y pick-ups "
            "4x4 a empresas, por día, por semana o por mes.\n\n"
            "Muchas empresas nos llaman cuando un vehículo propio queda en el taller, cuando llega "
            "gente de afuera o cuando aparece un trabajo que pide una unidad más por un tiempo. "
            "Suman lo que necesitan y lo devuelven cuando termina, con mantenimiento, seguro y "
            "patente incluidos. Se retira en el centro de Bahía o en el aeropuerto, y lo coordinamos "
            "por WhatsApp.\n\n"
            "¿Les sirve que les cuente cómo trabajamos?"
        ),
        tema="el alquiler de vehículos para empresas",
        segmentos=(),
    ),
)

PLANTILLA_GENERAL = "general"
_POR_ID = {p.id: p for p in PLANTILLAS}
_POR_SEGMENTO = {s: p.id for p in PLANTILLAS for s in p.segmentos}


def plantilla(plantilla_id: str | None) -> Plantilla:
    """La plantilla pedida, o la general si el id no existe."""
    return _POR_ID.get(plantilla_id or "", _POR_ID[PLANTILLA_GENERAL])


def plantilla_para_segmento(segmento: str | None) -> str:
    """El id de la plantilla que le habla a ese segmento (la general si no hay)."""
    return _POR_SEGMENTO.get(_norm(segmento), PLANTILLA_GENERAL)


def sugerir(segmentos: dict[str | None, int]) -> str:
    """
    La plantilla para una audiencia, según **la familia que más pesa**.

    Si esa familia no llega a la mitad de la audiencia va la general: mandarle
    el mail de obra a una lista que es mitad hoteles sale peor que uno neutro.
    """
    por_plantilla: dict[str, int] = {}
    for segmento, cantidad in segmentos.items():
        pid = plantilla_para_segmento(segmento)
        por_plantilla[pid] = por_plantilla.get(pid, 0) + cantidad
    total = sum(por_plantilla.values())
    if not total:
        return PLANTILLA_GENERAL
    ganadora, cantidad = max(por_plantilla.items(), key=lambda kv: (kv[1], kv[0] != PLANTILLA_GENERAL))
    return ganadora if cantidad * 2 >= total else PLANTILLA_GENERAL


#: Para la vista previa cuando todavía no hay a quién mostrar.
VALORES_DE_EJEMPLO: dict[str, str] = {
    "empresa": "Constructora del Sur",
    "ciudad": "Bahía Blanca",
    "segmento": "Constructoras y Desarrollo",
    "firma_nombre": "Franco",
    "firma_telefono": "291 418-0554",
    "web": "www.ubicar-rent.com.ar",
    "baja": "https://…/baja",
}


def catalogo() -> list[dict]:
    """El catálogo tal como lo consume la pantalla."""
    return [
        {
            "id": p.id, "nombre": p.nombre, "descripcion": p.descripcion,
            "asuntos": list(p.asuntos), "cuerpo": p.cuerpo, "segmentos": list(p.segmentos),
            "seguimientos": [{"dias": s.dias, "cuerpo": s.cuerpo} for s in p.seguimientos],
        }
        for p in PLANTILLAS
    ]
