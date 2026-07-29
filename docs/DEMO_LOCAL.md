# Demo desde esta máquina — plan B

> Para mostrar el sistema completo sin depender de que Railway, Vercel o
> internet cooperen. Todo corre acá, contra la base local, que ya tiene
> 16 vehículos, 6 categorías y 12 reservas cargadas.
>
> **Arranca en un minuto y no falla en vivo.**

---

## Antes de empezar (una sola vez)

La web está apuntando al backend de Railway. Para la demo local hay que
apuntarla acá. Editá `web/.env.local` y dejá esta única línea:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

> Para volver a la versión en línea, se cambia por
> `https://ubicar-system-production.up.railway.app/api/v1`.

---

## Levantar todo

Tres terminales, un comando cada una.

**1 — El backend**
```bash
cd backend
python -m uvicorn app.main:app --port 8000
```

**2 — El sistema interno**
```bash
cd frontend
npm run dev
```
→ **http://localhost:5173**

**3 — La web pública**
```bash
cd web
npm run dev -- --port 3200
```
→ **http://localhost:3200**

> El backend local corre con `DEV_BYPASS_AUTH=true`, así que el sistema interno
> **entra directo, sin pedir contraseña**. Para la demo es una ventaja: no
> dependés de que Clerk responda.

---

## El recorrido sugerido

### La web pública — `localhost:3200`

1. **La portada**, con la foto de la camioneta en la ruta
2. **Buscar disponibilidad**: elegí un rango de fechas dentro del próximo mes
   → aparecen las categorías con foto, precio total y precio por día
3. **Elegir una** y avanzar por los cuatro pasos:
   - Vehículo → Adicionales → Datos → Pago
   - Mostrá el **reloj de reserva**: el sistema le guarda el cupo 20 minutos
   - En el paso 4, los tres botones de anticipo: **30% / 50% / 100%**
4. El último paso ofrece cerrar por **WhatsApp**, porque todavía no hay
   credenciales de Mercado Pago. **Eso es a propósito**: el sistema no simula
   un cobro que no existe

> **Punto fuerte para contar:** una categoría sin disponibilidad no se esconde
> — se muestra con un botón para dejar los datos. Ese contacto entra en la
> bandeja del sistema con un aviso inmediato, en vez de perderse.

### El sistema interno — `localhost:5173`

1. **Ocupación**: el calendario de toda la flota, quién tiene cada auto y hasta
   cuándo
2. **Flota**: los 16 vehículos, con sus vencimientos de VTV, seguro y service
3. **Reservas**: el ciclo completo, entrega y devolución
4. **Clientes**: ficha, cuenta corriente y documentos
5. **Precios**: el calendario de precios por fecha, con las promociones
6. **Notificaciones**: los avisos que el sistema genera solo — vencimientos,
   deudas, y los **"📌 Falta completar"** que marcan qué datos faltan cargar
7. **Contratos**: emisión y firma

> **Punto fuerte para contar:** la campana de notificaciones. El sistema
> reclama solo lo que falta; cuando esa lista queda vacía, está listo para
> vender.

---

## Qué decir sobre lo que falta

Todo lo pendiente es **cuentas de servicios externos**, no programación:

| Falta | Se ve como |
|---|---|
| Credenciales de Mercado Pago | El paso 4 ofrece WhatsApp en vez de cobrar |
| Dominio verificado en Resend | Los mails llegan sólo a la casilla de Ubicar |
| Bucket de archivos | Los documentos subidos no sobreviven un reinicio |
| Datos de la empresa | Los contratos salen marcados "PROVISORIO" |

Y **una decisión** que no depende de ninguna cuenta: la política de la seña.
Está en `REUNION_2026-07-29.md`.

---

## Si algo no arranca

| Síntoma | Causa |
|---|---|
| La web no muestra categorías | El backend no está levantado, o `web/.env.local` sigue apuntando a Railway |
| "Sin conexión con el servidor" | Falta el backend en el puerto 8000 |
| El puerto 5173 está ocupado | Vite elige otro solo y lo dice en la terminal |
| Postgres no responde | Verificá que el servicio de Postgres esté corriendo en Windows |
