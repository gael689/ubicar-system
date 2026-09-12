from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Pagare(Base):
    """
    El pagaré a la vista que firma el cliente junto con el contrato.

    **Es un documento aparte del contrato, no una página más.** Un pagaré es un
    título de crédito: tiene que bastarse a sí mismo —monto, beneficiario, lugar
    de pago, firma— sin remitir a ningún otro papel, y el contrato tiene que
    seguir siendo exactamente el mismo que era. Por eso tabla propia, snapshot
    propio y PDF propio.

    **Lo que sí comparte con el contrato: el link y la firma.** Cuelga de un
    `contrato_id` porque viaja en el mismo `firma_token` —el cliente abre un solo
    link, lee los dos documentos y firma una vez— y el trazo que se guarda es el
    mismo acto de firma. Si el pagaré se genera después de que el contrato ya se
    firmó, el link vuelve a abrirse sólo para el pagaré: **nunca se reutiliza una
    firma vieja** sobre un documento que la persona no vio.

    `snapshot` congela todo lo que se imprime (monto y su expresión en letras,
    beneficiario, lugar de pago, tasas, deudor y co-deudores, y el texto ya
    resuelto). Reimprimirlo dentro de cinco años —que es el plazo de
    presentación que el propio texto amplía— tiene que dar el mismo papel.

    Nunca se borra: se anula con motivo.
    """
    __tablename__ = "pagares"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reserva_id: Mapped[int] = mapped_column(ForeignKey("reservas.id"), nullable=False, index=True)
    contrato_id: Mapped[int] = mapped_column(ForeignKey("contratos.id"), nullable=False, index=True)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)

    # ── Firma (la misma del contrato) ───────────────────────────────────────
    firmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    firmado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    firma_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # "link" | "pantalla" | "papel" — mismo criterio que `Contrato.firma_medio`.
    firma_medio: Mapped[str | None] = mapped_column(String(10), nullable=True)
    firmado_por_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    firmado_por_dni: Mapped[str | None] = mapped_column(String(20), nullable=True)
    firma_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    firma_user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # La declaración que tildó al firmar por link, con el texto congelado.
    firma_aceptacion: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Una entrada por co-deudor, en el orden del snapshot:
    # [{nombre, dni, firma_key}]. Sin `firma_key` cuando se firmó en papel.
    firmas_codeudores: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # El ejemplar firmado a mano, escaneado o fotografiado.
    escaneo_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    fecha_generacion: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    contrato: Mapped["Contrato"] = relationship("Contrato")
    reserva: Mapped["Reserva"] = relationship("Reserva")

    @property
    def numero_formateado(self) -> str:
        # El id alcanza como número: no hay una numeración fiscal que respetar,
        # y una secuencia aparte sólo agregaría una pieza que puede desfasarse.
        return f"P-{self.id:08d}" if self.id else "—"
