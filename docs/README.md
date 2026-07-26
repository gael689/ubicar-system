# Documentación — Ubicar Rent

> Punto de entrada de toda la documentación de planificación e implementación. Leer antes de tocar el código.

## Estructura

```
docs/
├── README.md                       # ← este archivo
├── ROADMAP.md                      # Plan por fases con grafo de dependencias
├── PLANNING_BACKEND.md             # Arquitectura, capas, convenciones backend
├── PLANNING_FRONTEND.md            # Arquitectura, convenciones frontend
├── AUTH_CLERK.md                   # Migración Auth0 → Clerk
├── SIGUIENTES_PASOS.md             # Resumen Fases 4-10
└── modules/
    ├── 00_fase0_fundacion.md       # Pre-fase: migraciones, Clerk, capas base
    ├── 02_modulo_flota.md          # Fase 1
    ├── 06_modulo_clientes.md       # Fase 2
    └── 04_modulo_reservas_alquileres.md  # Fase 3
```

Los archivos de las Fases 4 a 10 se crean cuando llega el turno de cada fase, siguiendo el formato de `modules/02_modulo_flota.md`.

## Cómo usar esta documentación

### Si vas a implementar algo

1. Leer `00_CONTEXT_GENERAL.md` (raíz del proyecto) para el dominio y reglas de negocio.
2. Leer `PLANNING_BACKEND.md` o `PLANNING_FRONTEND.md` según corresponda.
3. Leer el archivo de la fase específica en `modules/`.
4. Seguir el orden del `ROADMAP.md`.

### Si vas a tomar una decisión técnica

1. Verificar si está cubierta en el planning correspondiente.
2. Si la decisión cambia algo del planning → editar el planning y dejar nota en el archivo de la fase.
3. Las decisiones marcadas como pendientes en `PLANNING_BACKEND.md` sección 16 no se implementan hasta resolver.

### Si vas a crear una fase nueva

1. Copiar el formato de `modules/02_modulo_flota.md`.
2. Completar las 8 secciones (objetivo, alcance backend, alcance frontend, dependencias, criterio de salida, smoke test, notas de despliegue, tiempo estimado).
3. Sumar la fase al `ROADMAP.md` con su lugar en el grafo.

## Estado actual del roadmap

- ✅ Setup base (frontend + backend) terminado.
- 🔄 Próxima fase: **Fase 0 — Fundación** (`modules/00_fase0_fundacion.md`).

## Notas

- Convenciones generales: ver `PLANNING_BACKEND.md` sección 13 y `PLANNING_FRONTEND.md` sección 12.
- Estos documentos son **vivos**. Editar cuando una decisión cambie. No son contrato fijo.
