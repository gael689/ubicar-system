from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8-sig", extra="ignore")

    # Database
    database_url: str = "postgresql://user:password@localhost:5432/ubicar_rent"
    # Poner en true SOLO en serverless: ahi cada instancia abre su propio pool
    # y Postgres termina rechazando conexiones. Ver app/database.py.
    db_sin_pool: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # Auth (Clerk — a configurar en Fase Clerk)
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""
    # Lista de auth_sub de admins iniciales, separados por coma
    clerk_admin_subs: str = ""

    # Bypass de auth para desarrollo: get_current_user devuelve un admin
    # upserteado en DB sin validar token.
    #
    # **El default es `False` a propósito.** Con `True`, un deploy que se
    # olvide de una variable deja todo el back-office abierto a internet sin
    # pedir token. Que el default inseguro requiera una acción explícita es la
    # diferencia entre olvidarse y equivocarse.
    dev_bypass_auth: bool = False
    dev_admin_email: str = "dev@ubicarrent.com"
    dev_admin_nombre: str = "Dev Admin"
    dev_admin_auth_sub: str = "dev-bypass-admin"

    # Storage
    # "local" en desarrollo; "r2" / "s3" en produccion. En un hosting
    # serverless el disco es efimero, asi que "local" pierde los archivos.
    storage_provider: str = "local"
    storage_path: str = "./storage_local"
    storage_bucket: str = "ubicar-rent-docs"
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_endpoint_url: str = ""
    # Dominio desde el que el navegador lee los archivos (el dominio publico
    # del bucket, o uno propio). Sin esto, public_url firma URLs temporales
    # que caducan y no se pueden guardar.
    storage_public_base_url: str = ""

    # Token del cron externo. Sólo hace falta en serverless, donde el
    # scheduler del proceso no existe y hay que disparar el motor por HTTP.
    # Vacío = el endpoint de cron queda deshabilitado.
    cron_secret: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    # **De este valor depende que los mails a clientes salgan o no.**
    # Mientras termine en `@resend.dev` (el remitente compartido de prueba,
    # que sólo entrega a la casilla dueña de la cuenta), EmailService registra
    # los mails a clientes como `omitido` en vez de mandarlos a la nada. Con
    # el dominio verificado en Resend, cambiar esto acá es todo lo que hay
    # que hacer: no hay ninguna otra bandera.
    # ⚠️ El dominio de la empresa es **`ubicar-rent.com.ar`** (con guion y con
    # `.ar`). El default decía `ubicarrent.com`, que no es de ellos: si un
    # deploy se olvida de esta variable, Resend rechaza el envío por dominio no
    # verificado y no queda claro por qué.
    #
    # Verificado el 2026-08-21 contra la API de Resend: **la cuenta no tiene
    # ningún dominio dado de alta** (`GET /domains` devuelve una lista vacía),
    # así que hoy este valor sólo puede ser `onboarding@resend.dev` y todos los
    # mails a clientes se registran como `omitido`.
    from_email: str = "noreply@ubicar-rent.com.ar"
    # Token con el que el buscador de leads (corre en la máquina de Gael, sin
    # sesión) empuja prospectos a `/prospectos/importar`. Vacío = la
    # importación está apagada.
    prospectos_token: str = ""
    # ── Prospección: las campañas en frío a empresas (docs/PROSPECCION.md) ──
    # Todo esto tiene un default que funciona: lo único que hace falta cargar
    # en producción para que salgan mails es `PROSPECCION_WEBHOOK_SECRET` (y
    # tener una casilla con su dominio verificado).
    #
    # El dominio de la empresa, del que **nunca** sale un mail en frío. Vacío =
    # se deduce de `FROM_EMAIL`. Las casillas tienen que ser de un subdominio.
    prospeccion_dominio_raiz: str = ""
    # API key de Resend para prospección. Vacía = usa `RESEND_API_KEY`. Para
    # crear y verificar el dominio desde la pantalla tiene que ser de acceso
    # completo; con una de sólo-envío la pantalla muestra los pasos a mano.
    prospeccion_resend_api_key: str = ""
    # Región de Resend del subdominio (sólo se usa al crearlo).
    prospeccion_resend_region: str = "sa-east-1"
    # Clave con la que se firman los links de baja. Vacía = se deriva de
    # `CLERK_SECRET_KEY` (o, si tampoco está, de `DATABASE_URL`), que son
    # secretos y estables. **Cambiarla invalida los links de los mails ya
    # enviados**, así que conviene fijarla una vez y no tocarla.
    prospeccion_secreto: str = ""
    # El "Signing Secret" (`whsec_…`) del webhook de Resend. Vacío = el
    # endpoint del webhook responde 404 y no se entera de rebotes ni quejas.
    prospeccion_webhook_secret: str = ""
    # Tope de mails de prospección por día, entre todas las casillas.
    prospeccion_tope_diario: int = 150
    # Lista blanca para probar en producción: con direcciones acá (separadas
    # por coma), **sólo a ésas** les sale un mail de verdad; el resto queda
    # registrado como simulado. Vacía = sale a todos.
    prospeccion_solo_a: str = ""
    # La firma que se propone en una campaña nueva (se puede cambiar ahí).
    prospeccion_firma_nombre: str = ""
    prospeccion_firma_telefono: str = "291 418-0554"
    prospeccion_web: str = "www.ubicar-rent.com.ar"
    # Adónde llegan los reportes de DMARC que se recomiendan en la pantalla.
    prospeccion_dmarc_reportes: str = ""

    # **Sin uso desde el 27/09/2026**: era a quién le llegaba el resumen de las
    # 08:00 y los avisos internos por mail, que se sacaron (al equipo no se le
    # manda mail, todo queda en la campana). Se deja declarada para que un
    # entorno que todavía la tenga cargada no falle al arrancar.
    notificaciones_digest_destinatarios: str = ""

    # Pagos online (Mercado Pago — migración 051)
    # "fake" usa una pasarela en memoria para poder recorrer el flujo completo
    # en desarrollo; en `environment=production` la factory se niega a
    # devolverla, porque una pasarela simulada confirmaría reservas sin cobrar.
    pagos_provider: str = "fake"
    mercadopago_access_token: str = ""
    # **No hay `mercadopago_public_key` y no es un olvido.** Con Checkout Pro
    # el navegador nunca habla con Mercado Pago: se lo redirige al
    # `init_point`. La public key sólo hace falta si en algún momento se pasa a
    # Checkout Bricks o al botón embebido. Estuvo declarada y sin usar desde la
    # migración 051.
    #
    # Con credenciales de prueba, Checkout Pro se abre en `sandbox_init_point`.
    # El esquema nuevo de usuarios de prueba de MP usa `init_point` igual que
    # producción (verificado el 19/08 contra la API), así que esto puede quedar
    # en `false` incluso probando.
    mercadopago_sandbox: bool = True
    # Clave secreta del webhook, la que muestra el panel de MP al configurar
    # las notificaciones. **Es distinta por ambiente**: la de prueba no sirve
    # en producción. Vacía = no se valida la firma; ver `domain/webhook_mp.py`
    # para por qué eso no es un agujero.
    mercadopago_webhook_secret: str = ""
    # URL pública del backend. La necesita el `notification_url` de la
    # preferencia: Mercado Pago tiene que poder alcanzarnos desde afuera, así
    # que en local esto va con un túnel (ngrok) y no con localhost.
    backend_public_url: str = ""

    # Orígenes extra permitidos por CORS, separados por coma.
    #
    # Existe para un caso concreto y temporal: mostrar la web corriendo en la
    # máquina de uno contra el backend ya desplegado. Sin esto habría que
    # elegir entre dejar los `localhost` habilitados en producción para
    # siempre —que es lo que se acaba de sacar— o no poder hacer una demo.
    # Es una lista explícita: se agrega lo que hace falta y se saca después.
    cors_extra_origins: str = ""

    # App
    frontend_url: str = "http://localhost:5173"
    # De dónde vuelve el cliente después de pagar: es la web pública (Next.js),
    # no el sistema interno.
    web_url: str = "http://localhost:3200"
    landing_url: str = ""
    environment: str = "development"

    @property
    def entorno(self) -> str:
        """
        El entorno normalizado.

        Se compara siempre contra esto y nunca contra `environment` crudo: un
        `Production` con mayúscula hacía que las dos guardas que dependen del
        string —el bypass de auth y el rechazo de la pasarela falsa— no
        dispararan. Dos fallas graves por una mayúscula.
        """
        return (self.environment or "").strip().lower()

    @property
    def is_development(self) -> bool:
        return self.entorno == "development"

    @property
    def is_production(self) -> bool:
        return self.entorno in ("production", "prod")


settings = Settings()
