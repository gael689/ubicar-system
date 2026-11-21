"""
UberService — el tablero de los contratos de Uber (21/11/2026).

Pedido de Gael: *"la parte de Uber bien funcional, fácil de usar todo"*. Ubicar
alquila autos por semana a choferes de Uber, y quien atiende tiene que ver de un
vistazo quién pagó la semana y quién debe, y cobrar en dos clics.

**No hay contabilidad nueva acá.** Todo lo que este service muestra sale de lo
que ya existe: las cuotas son los débitos que el check-out asienta en la cuenta
corriente (uno por semana), y lo cobrado son los `Pago` del alquiler, con el
mismo criterio que "A cobrar" (`cobranza_service`). Y todo lo que escribe pasa
por los caminos de siempre: el cobro por `pago_service.registrar_pago` (el mismo
de `POST /pagos`) y la renovación por `AlquilerService.extender`.

**Cómo se sabe si una semana está paga.** El sistema no imputa un pago contra un
débito puntual (`PLAN_DINERO.md` §4.3). Acá se reparte lo cobrado por el
alquiler entre sus cuotas, de la más vieja a la más nueva
(`domain/uber.py::imputar_pagos`): la seña cubre la primera semana, un pago
parcial deja la semana a medias, y lo que sobra pasa a la siguiente.

**Las cuotas siguen naciendo en el check-out**, no al confirmar la reserva. Un
débito antes de entregar el auto sería deuda por algo que no se entregó: le
dispararía avisos de deuda vencida a alguien que todavía no tiene el auto,
`ReservaService.cancelar` tendría que aprender a anularlos, y el check-out los
volvería a crear. Las reservas sin entregar se muestran igual en el tablero,
como "a entregar", con las semanas que van a tener — calculadas, no asentadas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import uber as uber_dominio
from app.domain.tarifas import dias_facturables
from app.domain.uber import Cuota, EstadoDeCuenta, SemanaEnCurso
from app.models.alquiler import Alquiler
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.models.uber_lectura_km import UberLecturaKm
from app.models.vehiculo import Vehiculo
from app.schemas.pago import PagoCreate
from app.services import cobranza_service as cobranza
from app.services.caja_service import es_plata_que_entro
from app.services.pago_service import registrar_pago

# Las naturalezas de débito que son **cuotas del contrato**: lo del check-out
# (`alquiler`) y lo de cada renovación (`extension`). Una multa, un daño o el km
# extra del cierre cuelgan del mismo alquiler pero no son "la semana".
NATURALEZAS_DE_CUOTA = ("alquiler", "extension")

# Con qué no se cobra una semana desde el tablero. Mismo criterio que
# `MEDIOS_COBRO_MANUAL` del frontend: "cuenta corriente" no es plata que entró,
# y un echeq se carga desde su pestaña, que ya le asienta el crédito.
MEDIOS_QUE_NO_COBRAN = ("cuenta_corriente", "echeq")

MAX_SEMANAS_RENOVACION = 52

# Cuánto se puede pasar del tope prorrateado antes de avisar (10 %).
TOLERANCIA_KM = Decimal("1.10")


@dataclass
class ContratoUber:
    """Un contrato de Uber con todo calculado. `alquiler` es `None` si el auto
    todavía no se entregó (reserva confirmada)."""
    reserva: Reserva
    alquiler: Alquiler | None
    dias: int
    semana: SemanaEnCurso
    cuotas: list[Cuota]
    cuenta: EstadoDeCuenta
    lecturas: list[UberLecturaKm] = field(default_factory=list)
    km: dict | None = None

    @property
    def entregado(self) -> bool:
        return self.alquiler is not None

    @property
    def estado(self) -> str:
        return self.cuenta.estado if self.entregado else "a_entregar"

    @property
    def valor_semana(self) -> Decimal:
        """Lo que vale la semana en curso: su cuota real, que puede no ser el
        valor pactado al inicio (una renovación con otro precio, un prorrateo)."""
        i = self.semana.numero - 1
        if 0 <= i < len(self.cuotas):
            return self.cuotas[i].monto
        return Decimal(str(self.reserva.uber_valor_semana or 0))

    @property
    def saldo_total(self) -> Decimal:
        return sum((c.saldo for c in self.cuotas if not c.paga), Decimal("0"))


def _f(valor) -> float:
    return float(valor or 0)


class UberService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Lectura ──────────────────────────────────────────────────────────────

    def contratos_vigentes(self, hoy: date | None = None) -> list[ContratoUber]:
        """Los contratos con el auto entregado y sin devolver."""
        hoy = hoy or date.today()
        alquileres = (
            self.db.query(Alquiler)
            .join(Reserva, Reserva.id == Alquiler.reserva_id)
            .options(
                joinedload(Alquiler.reserva).joinedload(Reserva.cliente),
                joinedload(Alquiler.reserva).joinedload(Reserva.vehiculo),
            )
            .filter(
                Reserva.tipo == "uber",
                Reserva.estado != "cancelada",
                Alquiler.checkin_fecha.is_(None),
            )
            .order_by(Alquiler.id)
            .all()
        )
        return [self._armar(a, hoy) for a in alquileres]

    def reservas_a_entregar(self, hoy: date | None = None) -> list[ContratoUber]:
        """Las reservas de Uber confirmadas cuyo auto todavía no salió."""
        hoy = hoy or date.today()
        reservas = (
            self.db.query(Reserva)
            .options(joinedload(Reserva.cliente), joinedload(Reserva.vehiculo))
            .filter(
                Reserva.tipo == "uber",
                Reserva.estado == "confirmada",
                ~exists().where(Alquiler.reserva_id == Reserva.id),
            )
            .order_by(Reserva.fecha_inicio, Reserva.id)
            .all()
        )
        return [self._armar_reserva(r, hoy) for r in reservas]

    def contrato(self, alquiler_id: int, hoy: date | None = None) -> ContratoUber:
        """Un contrato de Uber vigente, o el error que explica por qué no."""
        alquiler = self.db.get(Alquiler, alquiler_id)
        if alquiler is None:
            raise NotFoundError("Alquiler", alquiler_id)
        reserva = alquiler.reserva
        if reserva is None or reserva.tipo != "uber":
            raise BusinessRuleError("no_es_uber", "Ese alquiler no es un contrato de Uber.")
        if alquiler.checkin_fecha is not None:
            raise BusinessRuleError(
                "contrato_terminado",
                "El auto de ese contrato ya se devolvió. Lo que haya quedado "
                "pendiente se cobra desde la cuenta corriente del cliente.",
            )
        return self._armar(alquiler, hoy or date.today())

    def _dias(self, reserva: Reserva) -> int:
        return dias_facturables(
            reserva.fecha_inicio, reserva.hora_inicio, reserva.fecha_fin, reserva.hora_fin
        )

    def _armar(self, alquiler: Alquiler, hoy: date) -> ContratoUber:
        reserva = alquiler.reserva
        dias = self._dias(reserva)

        debitos = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(
                MovimientoCuentaCorriente.alquiler_id == alquiler.id,
                MovimientoCuentaCorriente.tipo == "debito",
                MovimientoCuentaCorriente.naturaleza.in_(NATURALEZAS_DE_CUOTA),
                MovimientoCuentaCorriente.anulado.is_(False),
            )
            .all()
        )
        # Por vencimiento, que es el orden de las semanas. Un débito sin fecha
        # (un contrato anterior a las cuotas semanales) va al final.
        debitos.sort(key=lambda m: (m.fecha_vencimiento or date.max, m.id))
        cuotas = [
            Cuota(
                numero=n,
                vencimiento=m.fecha_vencimiento,
                monto=Decimal(str(m.monto)),
                concepto=m.concepto,
                movimiento_id=m.id,
            )
            for n, m in enumerate(debitos, start=1)
        ]
        # Lo cobrado: los `Pago` del alquiler (más el cobro online de su
        # reserva), sin anulados y sin lo "anotado a cuenta". Es exactamente lo
        # que `cobranza.monto_cobrado` suma para "A cobrar".
        #
        # Se vuelve a leer la lista de pagos: si en esta misma sesión se acaba
        # de cobrar (`cobrar_semana` arma el contrato antes y después), la
        # colección ya cargada no tendría el pago nuevo.
        self.db.expire(alquiler, ["pagos"])
        pagos = [
            (p.fecha, p.medio_pago, Decimal(str(p.monto)))
            for p in sorted(cobranza.pagos_de(self.db, alquiler), key=lambda p: (p.fecha, p.id))
            if es_plata_que_entro(p.medio_pago)
        ]
        uber_dominio.imputar_pagos(cuotas, pagos)

        lecturas = (
            self.db.query(UberLecturaKm)
            .filter(UberLecturaKm.alquiler_id == alquiler.id)
            .order_by(UberLecturaKm.fecha, UberLecturaKm.id)
            .all()
        )
        km = None
        if reserva.uber_km_semana or lecturas:
            ultima = lecturas[-1] if lecturas else None
            km = {
                "km_semana": reserva.uber_km_semana,
                "precio_km_extra": reserva.uber_precio_km_extra,
                "km_inicial": alquiler.checkout_km,
                "permitidos_hoy": (
                    uber_dominio.km_permitidos_a_fecha(
                        reserva.uber_km_semana, reserva.fecha_inicio, hoy, dias
                    )
                    if reserva.uber_km_semana else None
                ),
                "ultima": ultima,
                "consumo": self._consumo(reserva, alquiler, ultima, dias) if ultima else None,
            }

        return ContratoUber(
            reserva=reserva,
            alquiler=alquiler,
            dias=dias,
            semana=uber_dominio.semana_en_curso(reserva.fecha_inicio, dias, hoy),
            cuotas=cuotas,
            cuenta=uber_dominio.estado_de_cuenta(cuotas, hoy),
            lecturas=lecturas,
            km=km,
        )

    def _armar_reserva(self, reserva: Reserva, hoy: date) -> ContratoUber:
        """
        Una reserva sin entregar: **las semanas que va a tener, sin asentar
        nada.** Se calculan igual que las va a crear el check-out (el total
        repartido entre las fechas de pago), y la seña ya cobrada se imputa
        igual que después: contra la primera.
        """
        # Import local: `reserva_service` importa medio árbol de services.
        from app.services.reserva_service import ReservaService

        dias = self._dias(reserva)
        fechas = [date.fromisoformat(str(f)) for f in (reserva.fechas_pago or [])] or (
            uber_dominio.fechas_de_pago(reserva.fecha_inicio, dias)
        )
        total = ReservaService(self.db).total_a_cobrar(reserva)
        cuotas = [
            Cuota(numero=n, vencimiento=f, monto=m)
            for n, (f, m) in enumerate(
                zip(fechas, uber_dominio.repartir_en_cuotas(total, len(fechas))), start=1
            )
        ]
        senas = (
            self.db.query(Pago)
            .filter(Pago.reserva_id == reserva.id, Pago.anulado.is_(False))
            .order_by(Pago.fecha, Pago.id)
            .all()
        )
        pagos = [
            (p.fecha, p.medio_pago, Decimal(str(p.monto)))
            for p in senas if es_plata_que_entro(p.medio_pago)
        ]
        # Una reserva anterior a la migración 079 tiene el anticipo anotado sin
        # ningún `Pago` detrás: se toma de ahí para no mostrarla como impaga.
        if not senas and reserva.anticipo_monto:
            pagos = [(
                reserva.anticipo_fecha or reserva.fecha_inicio,
                reserva.anticipo_medio_pago,
                Decimal(str(reserva.anticipo_monto)),
            )]
        uber_dominio.imputar_pagos(cuotas, pagos)
        return ContratoUber(
            reserva=reserva,
            alquiler=None,
            dias=dias,
            semana=uber_dominio.semana_en_curso(reserva.fecha_inicio, dias, hoy),
            cuotas=cuotas,
            cuenta=uber_dominio.estado_de_cuenta(cuotas, hoy),
        )

    def _consumo(self, reserva: Reserva, alquiler: Alquiler, lectura: UberLecturaKm, dias: int) -> dict:
        return uber_dominio.consumo_de_km(
            lectura.km, alquiler.checkout_km, reserva.uber_km_semana,
            reserva.uber_precio_km_extra, reserva.fecha_inicio, lectura.fecha, dias,
        )

    # ── Tablero ──────────────────────────────────────────────────────────────

    def tablero(self, hoy: date | None = None) -> dict:
        hoy = hoy or date.today()
        vigentes = self.contratos_vigentes(hoy)
        a_entregar = self.reservas_a_entregar(hoy)

        # Atrasados primero (el más atrasado arriba), después los que vencen
        # hoy, después los que están al día por orden de próxima fecha, y al
        # final lo que todavía no salió.
        orden = {"atrasado": 0, "vence_hoy": 1, "al_dia": 2, "a_entregar": 3}

        def clave(c: ContratoUber):
            return (
                orden[c.estado],
                -c.cuenta.dias_atraso,
                c.cuenta.proxima_fecha or c.reserva.fecha_inicio or date.max,
                c.reserva.id,
            )

        filas = sorted(vigentes + a_entregar, key=clave)

        atrasados = [c for c in vigentes if c.estado == "atrasado"]
        lunes = hoy - timedelta(days=hoy.weekday())
        domingo = lunes + timedelta(days=6)
        a_cobrar_semana = sum(
            (
                cuota.saldo
                for c in vigentes for cuota in c.cuotas
                if not cuota.paga and cuota.vencimiento and lunes <= cuota.vencimiento <= domingo
            ),
            Decimal("0"),
        )

        ocupados = {c.reserva.vehiculo_id for c in filas if c.reserva.vehiculo_id}
        de_uber = (
            self.db.query(Vehiculo)
            .filter(Vehiculo.activo.is_(True), Vehiculo.destino == "uber")
            .order_by(Vehiculo.patente)
            .all()
        )
        libres = [v for v in de_uber if v.id not in ocupados]

        # % de cobranza del mes: de lo que venció este mes (hasta hoy) en los
        # contratos vigentes, cuánto entró.
        primero = hoy.replace(day=1)
        del_mes = [
            cuota for c in vigentes for cuota in c.cuotas
            if cuota.vencimiento and primero <= cuota.vencimiento <= hoy
        ]
        vencio_mes = sum((c.monto for c in del_mes), Decimal("0"))
        cobrado_mes = sum((min(c.pagado, c.monto) for c in del_mes), Decimal("0"))

        return {
            "hoy": hoy.isoformat(),
            "resumen": {
                "activos": len(vigentes),
                "al_dia": len([c for c in vigentes if c.estado == "al_dia"]),
                "vence_hoy": len([c for c in vigentes if c.estado == "vence_hoy"]),
                "atrasados": len(atrasados),
                "adeudado": _f(sum((c.cuenta.adeudado for c in atrasados), Decimal("0"))),
                "a_cobrar_semana": _f(a_cobrar_semana),
                "a_entregar": len(a_entregar),
            },
            "contratos": [self.serializar(c, hoy) for c in filas],
            "libres": [
                {
                    "vehiculo_id": v.id,
                    "patente": v.patente,
                    "vehiculo": f"{v.marca} {v.modelo}",
                    "estado": v.estado,
                }
                for v in libres
            ],
            "pie": {
                "ingreso_semanal": _f(sum((c.valor_semana for c in vigentes), Decimal("0"))),
                "vencio_mes": _f(vencio_mes),
                "cobrado_mes": _f(cobrado_mes),
                "cobranza_mes_pct": (
                    int(round(float(cobrado_mes * 100 / vencio_mes))) if vencio_mes > 0 else None
                ),
                "autos_ocupados": len({c.reserva.vehiculo_id for c in vigentes if c.reserva.vehiculo_id}),
                "autos_libres": len(libres),
            },
            "ultimos_valores": self.ultimos_valores(),
        }

    def serializar(self, c: ContratoUber, hoy: date) -> dict:
        r, cuenta = c.reserva, c.cuenta
        cliente, vehiculo = r.cliente, r.vehiculo
        a_cobrar = cuenta.cuota_a_cobrar
        modalidad, nota = uber_dominio.separar_condicion(r.condicion_pago_texto)

        km = None
        if c.km is not None:
            ultima, consumo = c.km["ultima"], c.km["consumo"]
            km = {
                "km_semana": c.km["km_semana"],
                "precio_km_extra": _f(c.km["precio_km_extra"]) if c.km["precio_km_extra"] else None,
                "km_inicial": c.km["km_inicial"],
                "permitidos_hoy": _f(c.km["permitidos_hoy"]) if c.km["permitidos_hoy"] is not None else None,
                "ultima_fecha": ultima.fecha.isoformat() if ultima else None,
                "ultimo_km": ultima.km if ultima else None,
                "consumo": self._consumo_json(consumo) if consumo else None,
            }

        return {
            "tipo_fila": "contrato" if c.entregado else "reserva",
            "alquiler_id": c.alquiler.id if c.alquiler else None,
            "reserva_id": r.id,
            "cliente_id": r.cliente_id,
            "chofer": cliente.nombre_completo if cliente else "Sin cliente",
            "telefono": cliente.telefono if cliente else None,
            "vehiculo_id": r.vehiculo_id,
            "patente": vehiculo.patente if vehiculo else None,
            "vehiculo": f"{vehiculo.marca} {vehiculo.modelo}" if vehiculo else None,
            "fecha_inicio": r.fecha_inicio.isoformat(),
            "fecha_fin": r.fecha_fin.isoformat(),
            "dias_para_terminar": (r.fecha_fin - hoy).days,
            "semana": {
                "numero": c.semana.numero,
                "total": c.semana.total,
                "desde": c.semana.desde.isoformat(),
                "hasta": c.semana.hasta.isoformat(),
            },
            "valor_semana": _f(c.valor_semana),
            "modalidad": modalidad,
            "nota_condicion": nota or None,
            "estado": c.estado,
            "dias_atraso": cuenta.dias_atraso,
            "semanas_adeudadas": cuenta.semanas_adeudadas,
            "adeudado": _f(cuenta.adeudado),
            "exigible": _f(cuenta.exigible),
            "proxima_fecha": cuenta.proxima_fecha.isoformat() if cuenta.proxima_fecha else None,
            "proximo_monto": _f(cuenta.proximo_monto),
            "saldo_total": _f(c.saldo_total),
            "cuota_a_cobrar": (
                {
                    "numero": a_cobrar.numero,
                    "monto": _f(a_cobrar.saldo),
                    "vencimiento": a_cobrar.vencimiento.isoformat() if a_cobrar.vencimiento else None,
                }
                if a_cobrar else None
            ),
            "km": km,
            "cuotas": [
                {
                    "numero": q.numero,
                    "vencimiento": q.vencimiento.isoformat() if q.vencimiento else None,
                    "monto": _f(q.monto),
                    "pagado": _f(q.pagado),
                    "saldo": _f(q.saldo),
                    "estado": q.estado(hoy),
                    "fecha_pago": q.fecha_pago.isoformat() if q.fecha_pago else None,
                    "medio_pago": q.medio_pago,
                }
                for q in c.cuotas
            ],
            "lecturas": [
                {
                    "id": lectura.id,
                    "fecha": lectura.fecha.isoformat(),
                    "km": lectura.km,
                    **self._consumo_json(self._consumo(r, c.alquiler, lectura, c.dias)),
                }
                for lectura in reversed(c.lecturas)
            ] if c.alquiler else [],
        }

    @staticmethod
    def _consumo_json(consumo: dict) -> dict:
        return {
            "recorridos": consumo["recorridos"],
            "permitidos": _f(consumo["permitidos"]) if consumo["permitidos"] is not None else None,
            "excedidos": _f(consumo["excedidos"]),
            "porcentaje": consumo["porcentaje"],
            "costo_estimado": _f(consumo["costo_estimado"]),
        }

    def ultimos_valores(self) -> dict | None:
        """
        Lo que se cargó en el último contrato de Uber, para proponerlo en el
        que sigue: en la práctica el valor de la semana, los km y el precio del
        km extra son los mismos durante meses, y tipearlos cada vez es donde
        aparece el "200.00" en lugar de "200.000".
        """
        ultimo = (
            self.db.query(Reserva)
            .filter(
                Reserva.tipo == "uber",
                Reserva.estado != "cancelada",
                Reserva.uber_valor_semana.isnot(None),
            )
            .order_by(Reserva.id.desc())
            .first()
        )
        if ultimo is None:
            return None
        modalidad, _ = uber_dominio.separar_condicion(ultimo.condicion_pago_texto)
        return {
            "valor_semana": _f(ultimo.uber_valor_semana),
            "km_semana": ultimo.uber_km_semana,
            "precio_km_extra": _f(ultimo.uber_precio_km_extra) if ultimo.uber_precio_km_extra else None,
            "modalidad": modalidad,
        }

    # ── Cobrar la semana ─────────────────────────────────────────────────────

    def cobrar_semana(
        self,
        alquiler_id: int,
        *,
        monto: Decimal,
        medio_pago: str,
        fecha: date,
        usuario_id: int,
        notas: str | None = None,
    ) -> Pago:
        """
        Cobra la semana (o parte, o varias) de un contrato.

        **Es un cobro común**: delega en `pago_service.registrar_pago`, el mismo
        de `POST /pagos`, así que aparece igual en Caja, en Cobros y en la
        cuenta corriente. Lo único propio es que arma el concepto con la semana
        que se está cobrando y frena lo que no tiene sentido (cobrar de más,
        "cobrar" con un medio que no es plata).
        """
        c = self.contrato(alquiler_id)
        monto = Decimal(str(monto))
        if monto <= 0:
            raise BusinessRuleError("monto_invalido", "El monto a cobrar tiene que ser mayor a cero.")
        if medio_pago in MEDIOS_QUE_NO_COBRAN:
            raise BusinessRuleError(
                "medio_invalido",
                "La semana se cobra con plata: efectivo, transferencia, tarjeta, "
                "Mercado Pago, Wapa o cheque. Un echeq se carga desde Caja → Echeqs.",
            )
        impagas = [q for q in c.cuotas if not q.paga]
        if not impagas:
            raise BusinessRuleError("sin_deuda", "Este contrato no tiene semanas pendientes de pago.")
        if monto > c.saldo_total:
            raise BusinessRuleError(
                "monto_excede",
                f"Le quedan ${c.saldo_total:,.0f} por pagar de todo el contrato: "
                "no se puede cobrar más que eso.".replace(",", "."),
            )

        # Qué semanas toca este pago, para que el asiento lo diga.
        resto, tocadas = monto, []
        for q in impagas:
            if resto <= 0:
                break
            tocadas.append(q.numero)
            resto -= q.saldo
        semanas = (
            f"semana {tocadas[0]}" if len(tocadas) == 1
            else f"semanas {tocadas[0]} a {tocadas[-1]}"
        )
        patente = c.reserva.vehiculo.patente if c.reserva.vehiculo else ""

        return registrar_pago(
            self.db,
            PagoCreate(
                alquiler_id=alquiler_id,
                monto=float(monto),
                medio_pago=medio_pago,
                fecha=fecha,
                notas=(notas or "").strip() or f"Uber — {semanas} ({patente})",
            ),
            usuario_id,
            concepto=f"Cobro {semanas} — alquiler #{alquiler_id}, contrato Uber ({medio_pago})",
        )

    # ── Lecturas de km ───────────────────────────────────────────────────────

    def registrar_lectura(
        self, alquiler_id: int, *, fecha: date, km: int, usuario_id: int | None
    ) -> tuple[UberLecturaKm, dict]:
        """
        Anota una lectura del odómetro y devuelve cómo viene contra el tope.

        **No cobra nada.** El excedente se cobra al cierre, como siempre.
        """
        c = self.contrato(alquiler_id)
        alquiler = c.alquiler
        if fecha > date.today():
            raise BusinessRuleError("fecha_futura", "La lectura no puede tener una fecha futura.")
        if fecha < alquiler.checkout_fecha:
            raise BusinessRuleError(
                "fecha_anterior",
                f"El auto se entregó el {alquiler.checkout_fecha.strftime('%d/%m/%Y')}: "
                "la lectura no puede ser anterior.",
            )
        if km < alquiler.checkout_km:
            raise BusinessRuleError(
                "km_menor",
                f"El auto salió con {alquiler.checkout_km} km: la lectura no puede ser menor.",
            )
        # El odómetro no vuelve para atrás: una lectura que contradice a las
        # que ya están es un error de tipeo, y se frena antes de que dispare un
        # aviso de exceso (o lo esconda).
        for otra in c.lecturas:
            if otra.fecha <= fecha and otra.km > km:
                raise BusinessRuleError(
                    "km_menor",
                    f"El {otra.fecha.strftime('%d/%m')} se cargaron {otra.km} km: "
                    "la lectura nueva no puede ser menor.",
                )
            if otra.fecha > fecha and otra.km < km:
                raise BusinessRuleError(
                    "km_mayor",
                    f"El {otra.fecha.strftime('%d/%m')} se cargaron {otra.km} km: "
                    "una lectura anterior no puede ser mayor.",
                )

        lectura = UberLecturaKm(alquiler_id=alquiler_id, fecha=fecha, km=km, usuario_id=usuario_id)
        self.db.add(lectura)
        # El km del auto se pone al día: es lo que mira el aviso de service.
        vehiculo = c.reserva.vehiculo
        if vehiculo is not None and (vehiculo.km_actual or 0) < km:
            vehiculo.km_actual = km
        self.db.flush()
        return lectura, self._consumo(c.reserva, alquiler, lectura, c.dias)

    # ── Renovar ──────────────────────────────────────────────────────────────

    def renovar(
        self,
        alquiler_id: int,
        *,
        semanas: int,
        usuario_id: int,
        valor_semana: Decimal | None = None,
        permitir_solape: bool = False,
    ) -> tuple[Alquiler, list[dict]]:
        """
        Agrega `semanas` al contrato, al mismo valor semanal salvo que se pase
        otro. Es `AlquilerService.extender` con las cuentas ya hechas: la fecha
        nueva, el precio, y —lo que faltaba— una cuota por cada semana agregada.
        """
        # Import local: `alquiler_service` importa medio árbol de services.
        from app.services.alquiler_service import AlquilerService

        if semanas < 1 or semanas > MAX_SEMANAS_RENOVACION:
            raise BusinessRuleError(
                "semanas_invalidas",
                f"Se puede renovar entre 1 y {MAX_SEMANAS_RENOVACION} semanas.",
            )
        c = self.contrato(alquiler_id)
        reserva = c.reserva
        valor = Decimal(str(valor_semana)) if valor_semana is not None else Decimal(
            str(reserva.uber_valor_semana or 0)
        )
        if valor <= 0:
            raise BusinessRuleError("valor_invalido", "Falta el valor de la semana para renovar.")

        return AlquilerService(self.db).extender(
            alquiler_id=alquiler_id,
            nueva_fecha_fin=reserva.fecha_fin + timedelta(days=uber_dominio.DIAS_POR_SEMANA * semanas),
            nueva_hora_fin=reserva.hora_fin,
            usuario_id=usuario_id,
            precio_extension=valor * semanas,
            permitir_solape=permitir_solape,
        )
