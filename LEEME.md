# Max Pizza · app interna

App del restaurante: mesero → comandas → caja → reposición → administración.
Proyecto **aparte de Kairos** (otra carpeta, otra base de datos, otro repositorio).

## Qué hay
| Carpeta | Qué es |
|---|---|
| `docs/PROMPT-MAESTRO.md` | La especificación completa aprobada |
| `diseno/referencias/` | Referencias visuales (3.jpg = identidad oficial) |
| `supabase/migrations/` | La base de datos: tablas, lógica, permisos y datos de ejemplo (correr en orden) |
| `tests/` | Pruebas automáticas de la base (las 10 obligatorias + extras) |
| `app/` | La aplicación (web, y luego APK "Max Pizza") |
| `scripts/crear-cuentas-prueba.mjs` | Crea una cuenta de prueba por rol |

## Conectar la base de datos (una sola vez, ~10 minutos)
1. Entra a supabase.com → **New project** → nombre `max-pizza`, región *South America (São Paulo)*.
2. En el proyecto: **SQL Editor** → pega y ejecuta, **en este orden**, cada archivo de `supabase/migrations/`:
   `…01_esquema.sql`, `…02_funciones.sql`, `…03_seguridad.sql`, `…04_datos_ejemplo.sql`.
3. **Settings → API**: copia *Project URL*, la clave *anon public* y la clave *service_role*.
4. Crea `app/.env` (copia de `app/.env.example`) con la URL y la clave **anon**.
5. Crea `.env` en la carpeta `max-pizza` con:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   (esta clave es secreta: nunca va dentro de la app ni a GitHub).
6. Cuentas de prueba: `node scripts/crear-cuentas-prueba.mjs` → crea `admin@`, `caja@`, `mesero@`, `rapidas@`,
   `armado@`, `tortas@`, `insumos@maxpizza.test` (la clave aparece en el script).

## Probar
- Base de datos: `npm test` (en la carpeta `max-pizza`).
- App: `npm --prefix app run dev` y abrir http://localhost:5180.
