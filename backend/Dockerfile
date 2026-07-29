FROM python:3.11-slim

# Evitar .pyc y buffering en logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

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
