"""
La caja de Franco: una fila por alquiler, lo que falta cobrar, el cierre del mes
y la cuenta propia de cada usuario.

**No es una tabla aparte**: cada fila se arma al vuelo desde la reserva y sus
cobros. Por eso lo que se carga en reservas, cobros y facturas impacta solo en la
caja, y no hay una segunda carga que se pueda desincronizar.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import caja as dominio
from app.domain.tarifas import dias_facturables
from app.models.alquiler import Alquiler
from app.models.caja_socios import MovimientoPropio, Reparto, Socio
from app.models.cliente import Cliente
from app.models.gasto import Gasto
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services import auditoria_service
from app.services.caja_service import es_plata_que_entro

# Reservas que cuentan como alquiler en la caja: las que se acordaron. No las
# canceladas ni las solicitudes sin cupo ni las que esperan el pago web.
ESTADOS_DEL_ALQUILER = ("confirmada", "activa", "vencida", "finalizada")


def _d(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def primer_dia(d: date) -> date:
    return d.replace(day=1)


def primer_dia_del_mes_siguiente(d: date) -> date:
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


class CajaSociosService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Socios ──────────────────────────────────────────────────────────────
    def socios(self, solo_activos: bool = True) -> list[Socio]:
        q = self.db.query(Socio)
        if solo_activos:
            q = q.filter(Socio.activo.is_(True))
        return q.order_by(Socio.porcentaje.desc(), Socio.id).all()

    def guardar_socios(self, items: list[dict]) -> list[Socio]:
        """Actualiza porcentajes y vínculos con usuarios. Tienen que sumar 100."""
        por_id = {s.id: s for s in self.socios(solo_activos=False)}
        for it in items:
            s = por_id.get(it["id"])
            if not s:
                raise NotFoundError("Socio", it["id"])
            if "porcentaje" in it and it["porcentaje"] is not None:
                s.porcentaje = _d(it["porcentaje"])
            if "usuario_id" in it:
                s.usuario_id = it["usuario_id"]
            if "activo" in it and it["activo"] is not None:
                s.activo = bool(it["activo"])
        total = sum((_d(s.porcentaje) for s in por_id.values() if s.activo), Decimal("0"))
        if total != Decimal("100"):
            raise BusinessRuleError(
                "porcentajes_invalidos", f"Los porcentajes de los socios suman {total} y tienen que sumar 100."
            )
        self.db.flush()
        return self.socios(solo_activos=False)

    def asignar_socio_a_pago(self, pago_id: int, socio_id: int | None, usuario_id: int) -> Pago:
        pago = self.db.get(Pago, pago_id)
        if not pago:
            raise NotFoundError("Pago", pago_id)
        if pago.reparto_id is not None:
            raise BusinessRuleError(
                "pago_ya_repartido", "Ese cobro ya entró en un reparto: anulá el reparto para cambiarlo."
            )
        if socio_id is not None and not self.db.get(Socio, socio_id):
            raise NotFoundError("Socio", socio_id)
        antes = pago.socio_id
        pago.socio_id = socio_id
        self.db.flush()
        auditoria_service.registrar(
            self.db, usuario_id=usuario_id, accion="cobro_a_nombre_de", entidad_tipo="pago",
            entidad_id=pago.id, descripcion=f"Cobro #{pago.id} cambió de socio",
            datos_antes={"socio_id": antes}, datos_despues={"socio_id": socio_id}, monto=pago.monto,
        )
        return pago

    # ── La factura parcial ──────────────────────────────────────────────────
    def actualizar_facturado(self, reserva_id: int, monto: Decimal | None, usuario_id: int) -> Reserva:
        """
        Cambia cuánto del alquiler va con factura. Se puede **corregir después de
        crear** (antes no): deja constancia de quién y de cuánto a cuánto.
        """
        r = self.db.get(Reserva, reserva_id)
        if not r:
            raise NotFoundError("Reserva", reserva_id)
        total = self._total(r)
        if monto is not None and (monto < 0 or monto > total):
            raise BusinessRuleError(
                "facturado_invalido", f"Lo facturado tiene que estar entre 0 y el total (${total})."
            )
        antes = dominio.facturado_de(total, r.monto_facturado, r.con_factura)
        r.monto_facturado = monto
        if monto is not None:
            r.con_factura = monto > 0
            if monto == 0:
                r.tipo_factura = r.factura_a_nombre_de = None
        self.db.flush()
        auditoria_service.registrar(
            self.db, usuario_id=usuario_id, accion="facturado_modificado", entidad_tipo="reserva",
            entidad_id=r.id, descripcion=f"Reserva #{r.id}: lo facturado pasó de ${antes} a ${monto if monto is not None else '(según con factura)'}",
            datos_antes={"facturado": antes}, datos_despues={"facturado": monto},
        )
        return r

    # ── Piezas de una fila ──────────────────────────────────────────────────
    def _total(self, r: Reserva) -> Decimal:
        """Todo lo que el cliente tiene que pagar: auto + adicionales + late."""
        return (
            _d(r.precio_total) + _d(r.cargo_late_checkout) + _d(r.total_adicionales)
        )

    def _cobros(self, r: Reserva) -> list[Pago]:
        condiciones = [Pago.reserva_id == r.id]
        if r.alquiler:
            condiciones.append(Pago.alquiler_id == r.alquiler.id)
        return [
            p for p in self.db.query(Pago)
            .filter(or_(*condiciones), Pago.anulado.is_(False))
            .order_by(Pago.fecha, Pago.id).all()
            if es_plata_que_entro(p.medio_pago)
        ]

    def _fila(self, r: Reserva, nombres_socios: dict[int, str]) -> dict:
        total = self._total(r)
        facturado = dominio.facturado_de(total, r.monto_facturado, r.con_factura)
        caja = dominio.caja_de(total, facturado)
        cobros = self._cobros(r)
        cobrado = sum((_d(p.monto) for p in cobros), Decimal("0"))
        saldo = max(Decimal("0"), total - cobrado)
        medios = sorted({p.medio_pago for p in cobros})
        socios = sorted({p.socio_id for p in cobros if p.socio_id is not None})
        dias = dias_facturables(r.fecha_inicio, r.hora_inicio, r.fecha_fin, r.hora_fin)
        cobrado_si = total > 0 and saldo == 0
        return {
            "reserva_id": r.id,
            "patente": r.vehiculo.patente if r.vehiculo else None,
            "cliente": r.cliente.razon_social or r.cliente.nombre_completo if r.cliente else None,
            "retiro_fecha": r.fecha_inicio.isoformat(), "retiro_hora": r.hora_inicio.strftime("%H:%M"),
            "devolucion_fecha": r.fecha_fin.isoformat(), "devolucion_hora": r.hora_fin.strftime("%H:%M"),
            "dias": dias,
            "precio_dia": float(_d(total) / dias) if dias else None,
            "facturado": float(facturado), "caja": float(caja), "total": float(total),
            "tipo": r.tipo, "estado": r.estado,
            "medios": medios,
            "cobrado": cobrado_si,
            "cobrado_monto": float(cobrado), "saldo": float(saldo),
            "fecha_cobro": cobros[-1].fecha.isoformat() if cobrado_si and cobros else None,
            "cobro_socios": [nombres_socios.get(i, "?") for i in socios],
            "cobro_sin_socio": any(p.socio_id is None for p in cobros),
            "repartido": bool(cobros) and all(p.reparto_id is not None for p in cobros),
            "distribuible": float(dominio.distribuible(facturado, caja)),
        }

    def _nombres(self) -> dict[int, str]:
        return {s.id: s.nombre.split()[0] for s in self.socios(solo_activos=False)}

    # ── Alquileres (la grilla CARGA) ────────────────────────────────────────
    def alquileres(
        self, desde: date | None, hasta: date | None, q: str | None, cobrado: bool | None,
        pagina: int = 1, por_pagina: int = 100,
    ) -> tuple[list[dict], int]:
        query = (
            self.db.query(Reserva)
            .join(Cliente, Reserva.cliente_id == Cliente.id)
            .outerjoin(Vehiculo, Reserva.vehiculo_id == Vehiculo.id)
            .filter(Reserva.estado.in_(ESTADOS_DEL_ALQUILER))
        )
        if desde:
            query = query.filter(Reserva.fecha_inicio >= desde)
        if hasta:
            query = query.filter(Reserva.fecha_inicio <= hasta)
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(or_(
                Cliente.nombre_completo.ilike(like), Cliente.razon_social.ilike(like),
                Vehiculo.patente.ilike(like),
            ))
        reservas = query.order_by(Reserva.fecha_inicio.desc(), Reserva.id.desc()).all()
        nombres = self._nombres()
        filas = [self._fila(r, nombres) for r in reservas]
        if cobrado is not None:
            filas = [f for f in filas if f["cobrado"] is cobrado]
        total = len(filas)
        inicio = (pagina - 1) * por_pagina
        return filas[inicio:inicio + por_pagina], total

    def alquileres_csv(self, desde: date | None, hasta: date | None) -> str:
        """Las mismas columnas de la planilla, para abrir en Excel (`;` y UTF-8)."""
        filas, _ = self.alquileres(desde, hasta, None, None, 1, 100000)
        salida = io.StringIO()
        w = csv.writer(salida, delimiter=";")
        w.writerow(["Patente", "Retiro fecha", "Hora retiro", "Devolución fecha", "Hora devolución",
                    "Cliente", "Días", "$/día", "Facturado", "Caja", "Total", "Medio pago",
                    "¿Cobrado?", "Fecha cobro", "Cobró", "¿Repartido?", "Distribuible", "Parte c/u"])
        socios_part = [s for s in self.socios() if _d(s.porcentaje) > 0]
        for f in filas:
            partes = " / ".join(
                f"{s.nombre.split()[0]} {dominio._redondear(_d(f['distribuible']) * _d(s.porcentaje) / 100)}"
                for s in socios_part
            )
            w.writerow([
                f["patente"], f["retiro_fecha"], f["retiro_hora"], f["devolucion_fecha"], f["devolucion_hora"],
                f["cliente"], f["dias"], f["precio_dia"] and round(f["precio_dia"], 2), f["facturado"], f["caja"], f["total"],
                ", ".join(f["medios"]), "Sí" if f["cobrado"] else "No", f["fecha_cobro"] or "",
                ", ".join(f["cobro_socios"]), "Sí" if f["repartido"] else "No", f["distribuible"], partes,
            ])
        return "﻿" + salida.getvalue()

    # ── A cobrar ────────────────────────────────────────────────────────────
    def a_cobrar(self, hoy: date) -> dict:
        reservas = (
            self.db.query(Reserva).filter(Reserva.estado.in_(ESTADOS_DEL_ALQUILER))
            .order_by(Reserva.fecha_fin).all()
        )
        nombres = self._nombres()
        items = []
        por_medio: dict[str, float] = {}
        for r in reservas:
            f = self._fila(r, nombres)
            if f["total"] <= 0 or f["saldo"] <= 0:
                continue
            medio = r.forma_pago_prevista or "sin_medio"
            por_medio[medio] = por_medio.get(medio, 0) + f["saldo"]
            items.append({
                "reserva_id": r.id, "cliente": f["cliente"], "patente": f["patente"],
                "retiro_fecha": f["retiro_fecha"], "devolucion_fecha": f["devolucion_fecha"],
                "total": f["total"], "saldo": f["saldo"], "medio_previsto": medio,
                "dias_desde_devolucion": max(0, (hoy - r.fecha_fin).days),
            })
        items.sort(key=lambda i: -i["dias_desde_devolucion"])
        return {
            "total_pendiente": round(sum(i["saldo"] for i in items), 2),
            "cantidad": len(items), "por_medio": por_medio, "items": items,
        }

    # ── El mes ──────────────────────────────────────────────────────────────
    def _cobros_del_mes(self, mes: date) -> list[Pago]:
        desde, hasta = primer_dia(mes), primer_dia_del_mes_siguiente(mes)
        return [
            p for p in self.db.query(Pago)
            .filter(Pago.anulado.is_(False), Pago.fecha >= desde, Pago.fecha < hasta)
            .order_by(Pago.fecha, Pago.id).all()
            if es_plata_que_entro(p.medio_pago)
        ]

    def _distribuible_del_cobro(self, p: Pago, cache: dict[int, tuple[Decimal, Decimal]]) -> Decimal:
        reserva = self.db.get(Reserva, p.reserva_id) if p.reserva_id else None
        if reserva is None and p.alquiler_id:
            al = self.db.get(Alquiler, p.alquiler_id)
            reserva = al.reserva if al else None
        if reserva is None:
            # Un cobro suelto: todo o nada según su propia marca de factura.
            facturado = _d(p.monto) if p.con_factura else Decimal("0")
            return dominio.distribuible_de_cobro(p.monto, p.monto, facturado)
        if reserva.id not in cache:
            total = self._total(reserva)
            cache[reserva.id] = (total, dominio.facturado_de(total, reserva.monto_facturado, reserva.con_factura))
        total, facturado = cache[reserva.id]
        return dominio.distribuible_de_cobro(p.monto, total, facturado)

    def mes(self, mes: date) -> dict:
        mes = primer_dia(mes)
        cobros = self._cobros_del_mes(mes)
        socios = self.socios()
        nombres = self._nombres()
        medios = sorted({p.medio_pago for p in cobros})

        por_medio: dict[str, dict[str, float]] = {}
        cobrado_por: dict[int, Decimal] = {}
        sin_socio = Decimal("0")
        for p in cobros:
            fila = por_medio.setdefault(p.medio_pago, {})
            clave = str(p.socio_id) if p.socio_id is not None else "sin_socio"
            fila[clave] = round(fila.get(clave, 0) + float(p.monto), 2)
            if p.socio_id is None:
                sin_socio += _d(p.monto)
            else:
                cobrado_por[p.socio_id] = cobrado_por.get(p.socio_id, Decimal("0")) + _d(p.monto)

        cache: dict[int, tuple[Decimal, Decimal]] = {}
        distribuible_total = sum((self._distribuible_del_cobro(p, cache) for p in cobros), Decimal("0"))

        porcentajes = {s.id: _d(s.porcentaje) for s in socios if _d(s.porcentaje) > 0}
        compensacion = None
        if porcentajes and sum(porcentajes.values()) == Decimal("100"):
            c = dominio.compensar(cobrado_por, porcentajes)
            compensacion = {
                "total_cobrado": float(c.total_cobrado),
                "corresponde": {str(i): float(v) for i, v in c.corresponde.items()},
                "saldo": {str(i): float(v) for i, v in c.saldo.items()},
                "transferencias": [
                    {"de": t.de, "a": t.a, "de_nombre": nombres.get(t.de), "a_nombre": nombres.get(t.a),
                     "monto": float(t.monto)} for t in c.transferencias
                ],
            }

        desde, hasta = primer_dia(mes), primer_dia_del_mes_siguiente(mes)
        gastos = (
            self.db.query(Gasto).filter(Gasto.anulado.is_(False), Gasto.fecha >= desde, Gasto.fecha < hasta).all()
        )
        reparto = (
            self.db.query(Reparto).filter(Reparto.mes == mes, Reparto.anulado.is_(False)).first()
        )
        return {
            "mes": mes.isoformat(),
            "socios": [{"id": s.id, "nombre": s.nombre, "porcentaje": float(s.porcentaje),
                        "usuario_id": s.usuario_id} for s in socios],
            "medios": medios,
            "por_medio": por_medio,
            "total_cobrado": float(sum((_d(p.monto) for p in cobros), Decimal("0"))),
            "cobrado_por_socio": {str(i): float(v) for i, v in cobrado_por.items()},
            "sin_socio": float(sin_socio),
            "distribuible": float(distribuible_total),
            "parte_por_socio": {
                str(i): float(dominio._redondear(distribuible_total * p / 100)) for i, p in porcentajes.items()
            },
            "compensacion": compensacion,
            "gastos": {"total": float(sum((_d(g.monto) for g in gastos), Decimal("0"))), "cantidad": len(gastos)},
            "cobros": [
                {"id": p.id, "fecha": p.fecha.isoformat(), "monto": float(p.monto), "medio": p.medio_pago,
                 "socio_id": p.socio_id, "reserva_id": p.reserva_id, "repartido": p.reparto_id is not None}
                for p in cobros
            ],
            "reparto": (
                {"id": reparto.id, "fecha": reparto.fecha.isoformat(),
                 "transferencias": reparto.transferencias} if reparto else None
            ),
        }

    # ── Repartir el mes ─────────────────────────────────────────────────────
    def repartir(self, mes: date, usuario_id: int, notas: str | None) -> Reparto:
        mes = primer_dia(mes)
        if self.db.query(Reparto).filter(Reparto.mes == mes, Reparto.anulado.is_(False)).first():
            raise BusinessRuleError("mes_ya_repartido", "Ese mes ya se repartió. Anulá el reparto para hacerlo de nuevo.")
        datos = self.mes(mes)
        if datos["sin_socio"] > 0:
            raise BusinessRuleError(
                "cobros_sin_socio",
                f"Hay ${datos['sin_socio']:,.0f} cobrados sin socio asignado. Asignalos antes de repartir.",
            )
        if not datos["compensacion"]:
            raise BusinessRuleError("sin_socios", "Los porcentajes de los socios no suman 100.")
        reparto = Reparto(
            mes=mes, fecha=date.today(), total_cobrado=_d(datos["total_cobrado"]),
            distribuible=_d(datos["distribuible"]),
            transferencias=datos["compensacion"]["transferencias"],
            porcentajes={str(s["id"]): s["porcentaje"] for s in datos["socios"]},
            notas=(notas or "").strip() or None, creado_por=usuario_id,
        )
        self.db.add(reparto)
        self.db.flush()
        for p in self._cobros_del_mes(mes):
            p.reparto_id = reparto.id
        self.db.flush()
        auditoria_service.registrar(
            self.db, usuario_id=usuario_id, accion="reparto_mensual", entidad_tipo="reparto",
            entidad_id=reparto.id, descripcion=f"Se repartió {mes:%m/%Y}", monto=reparto.total_cobrado,
        )
        return reparto

    def anular_reparto(self, reparto_id: int, usuario_id: int) -> Reparto:
        r = self.db.get(Reparto, reparto_id)
        if not r:
            raise NotFoundError("Reparto", reparto_id)
        if r.anulado:
            return r
        r.anulado, r.anulado_en = True, datetime.utcnow()
        for p in self.db.query(Pago).filter(Pago.reparto_id == r.id).all():
            p.reparto_id = None
        self.db.flush()
        auditoria_service.registrar(
            self.db, usuario_id=usuario_id, accion="reparto_anulado", entidad_tipo="reparto",
            entidad_id=r.id, descripcion=f"Se anuló el reparto de {r.mes:%m/%Y}",
        )
        return r

    # ── La cuenta propia ────────────────────────────────────────────────────
    def propios(self, usuario_id: int, desde: date | None = None, hasta: date | None = None) -> dict:
        """**Siempre** filtrado por el usuario: nadie ve lo propio de otro."""
        q = self.db.query(MovimientoPropio).filter(
            MovimientoPropio.usuario_id == usuario_id, MovimientoPropio.anulado.is_(False)
        )
        if desde:
            q = q.filter(MovimientoPropio.fecha >= desde)
        if hasta:
            q = q.filter(MovimientoPropio.fecha <= hasta)
        movs = q.order_by(MovimientoPropio.fecha.desc(), MovimientoPropio.id.desc()).all()
        entra = sum((_d(m.monto) for m in movs if m.tipo == "entra"), Decimal("0"))
        sale = sum((_d(m.monto) for m in movs if m.tipo == "sale"), Decimal("0"))
        return {
            "entra": float(entra), "sale": float(sale), "saldo": float(entra - sale),
            "items": [
                {"id": m.id, "fecha": m.fecha.isoformat(), "concepto": m.concepto, "tipo": m.tipo,
                 "monto": float(m.monto), "medio": m.medio, "notas": m.notas}
                for m in movs
            ],
        }

    def anotar_propio(self, usuario_id: int, fecha: date, concepto: str, tipo: str,
                      monto: Decimal, medio: str | None, notas: str | None) -> MovimientoPropio:
        if tipo not in ("entra", "sale"):
            raise BusinessRuleError("tipo_invalido", "Tiene que ser 'entra' o 'sale'.")
        if not (concepto or "").strip():
            raise BusinessRuleError("concepto_requerido", "Escribí de qué es.")
        if _d(monto) <= 0:
            raise BusinessRuleError("monto_invalido", "El monto tiene que ser mayor a cero.")
        m = MovimientoPropio(
            usuario_id=usuario_id, fecha=fecha, concepto=concepto.strip(), tipo=tipo,
            monto=_d(monto), medio=medio, notas=notas,
        )
        self.db.add(m)
        self.db.flush()
        return m

    def anular_propio(self, usuario_id: int, movimiento_id: int) -> None:
        m = self.db.get(MovimientoPropio, movimiento_id)
        # Para otro usuario es como si no existiera: no se revela que está.
        if not m or m.usuario_id != usuario_id:
            raise NotFoundError("Movimiento", movimiento_id)
        m.anulado = True
        self.db.flush()
