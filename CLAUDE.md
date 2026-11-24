# Max Pizza · app interna — contexto para Claude Code

**Proyecto independiente.** No tiene nada que ver con Kairos/KairosX: no copiar datos, claves, base de datos, repositorio ni reglas de publicación de Kairos.

## Qué es
App interna del restaurante **Max Pizza** (Colombia): mesero → comandas → caja → reposición de inventario → administración. Varias sedes (inicio: **Sede Principal** y **El Refugio**).
La especificación completa y aprobada está en `docs/PROMPT-MAESTRO.md`. **Primero lee `PROGRESO.md`.**

## Dueño
No es programador. Español de Colombia, casual. Explicar simple, sin jerga, mostrar el resultado primero.
Zona horaria America/Bogota · moneda COP formato `$12.000` · app en español.

## Técnica
- `app/`: Vite + React + TypeScript. Se empaqueta como APK **"Max Pizza"** con Capacitor (se arma en GitHub Actions; este PC no tiene Java/Android).
- `supabase/migrations/`: PostgreSQL versionado (Supabase: auth por correo, RLS, realtime). Toda operación que mueve plata o stock va por funciones `rpc` transaccionales con `operacion_id` (idempotentes).
- `tests/`: pruebas de la base con PGlite (`npm test` en la raíz), cubren las 10 pruebas obligatorias.
- Nunca poner claves en el código: `.env` (ignorado por git).

## Diseño (referencia oficial: `diseno/referencias/3.jpg`)
- Marfil `#F7F3EA` (fondo), negro `#141414` (barra superior, texto), mostaza `#E3A21A` (acción principal, botones de mesa, anillo).
- Estados siempre con texto: rojo `#D9463B` · Alta, amarillo `#E3A21A` · Media, verde `#2E8B57` · Baja, `✓ Lista`.
- Tarjetas blancas redondeadas con borde suave, números grandes, botones que dicen el resultado ("Confirmar cobro").
- Fuente títulos Montserrat 800; cuerpo Plus Jakarta Sans.

## Reglas de trabajo
- Plan corto antes de algo grande; trabajar por módulos y dejar cada uno funcionando.
- Lo que el equipo marca a mano nunca lo pisa un proceso automático.
- Actualizar `PROGRESO.md` al terminar cada sesión.
