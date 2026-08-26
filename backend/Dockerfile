FROM python:3.11-slim

# Evitar .pyc y buffering en logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# **La hora del contenedor es la de Bahía Blanca, no UTC.**
#
# `python:3.11-slim` corre en UTC, y el sistema compara `datetime.now()` contra
# fechas y horas que se cargan en hora argentina. Con tres horas de diferencia:
#
#   · un auto que vuelve a las 10:00 pasaba a "vencida" a las 07:00;
#   · la alerta CRÍTICA de "devolución vencida" —que tiene una hora de gracia—
#     saltaba a las 08:00, con las horas de atraso infladas en 3;
#   · un cobro de las 22:00 caía en la caja del día siguiente.
#
# Todos los días, con cada alquiler. Que `main.py` fije la zona a mano sólo
# para el scheduler era la señal de que el proceso no estaba en hora argentina.
#
# `tzdata` hace falta de verdad: en las imágenes slim la variable sola no
# alcanza porque no hay base de zonas horarias que consultar.
ENV TZ=America/Argentina/Buenos_Aires

WORKDIR /app

# Dependencias del sistema (psycopg2 necesita libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código (en dev se sobreescribe con el volumen montado)
COPY . .

EXPOSE 8000

# Comando por defecto.
#
# **Tiene que estar aunque `railway.toml` defina el suyo.** Sin un CMD, un
# contenedor al que no le llega el startCommand arranca, no encuentra nada que
# ejecutar y muere en el acto — y el síntoma es un dominio que devuelve 404 en
# todas las rutas, sin un solo error que explique por qué. Media hora de
# diagnóstico por una línea que falta.
#
# `${PORT:-8000}` porque Railway inyecta PORT y en local no existe.
# `sh -c` es necesario para que la variable se expanda.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
