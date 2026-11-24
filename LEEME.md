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
| `supabase/cuentas-prueba.sql` | Crea una cuenta de prueba por rol |

## Base de datos conectada
- Proyecto de Supabase: **Max pizza** (ref , São Paulo). Ya tiene las 5 migraciones aplicadas.
-  tiene la URL y la clave pública (anon). La clave secreta service_role **no se usa**.
- Proyecto nuevo desde cero: pegar  completo en SQL Editor → Run, y luego .

## Cuentas de prueba
, , , , , ,  — cada una con su rol en las dos sedes.
La clave de prueba está en  (cámbiala antes de usar la app con el equipo real).

## Probar
- Base de datos: `npm test` (en la carpeta `max-pizza`).
- App: `npm --prefix app run dev` y abrir http://localhost:5180.
