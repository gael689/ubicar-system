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
    storage_provider: str = "local"   # "local" | "r2"
    storage_path: str = "./storage_local"
    storage_bucket: str = "ubicar-rent-docs"
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_endpoint_url: str = ""

    # Email
    resend_api_key: str = ""
    from_email: str = "noreply@ubicarrent.com"

    # App
    frontend_url: str = "http://localhost:5173"
    landing_url: str = ""
    environment: str = "development"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


settings = Settings()
