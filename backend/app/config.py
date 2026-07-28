from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8-sig", extra="ignore")

    # Database
    database_url: str = "postgresql://user:password@localhost:5432/ubicar_rent"

    # Auth (Clerk — a configurar en Fase Clerk)
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""
    # Lista de auth_sub de admins iniciales, separados por coma
    clerk_admin_subs: str = ""

    # Bypass de auth para desarrollo: get_current_user devuelve un admin upserteado
    # en DB sin validar token. Cuando Clerk esté integrado, poner en false.
    dev_bypass_auth: bool = True
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

    # Email
    resend_api_key: str = ""
    from_email: str = "noreply@ubicarrent.com"
    # Destinatarios del digest matutino de notificaciones, separados por coma.
    # Vacío = no se envía nada (además de que enviar_email ya no hace nada
    # sin resend_api_key). Sin usuarios reales todavía (pre-Clerk), es la
    # única forma de configurar a quién le llega.
    notificaciones_digest_destinatarios: str = ""

    # App
    frontend_url: str = "http://localhost:5173"
    landing_url: str = ""
    environment: str = "development"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


settings = Settings()
