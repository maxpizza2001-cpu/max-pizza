# Progreso · Max Pizza

## Fase 1 · Base de datos y app base — ✅ hecha (23 nov 2026)
- Carpeta propia `Desktop\max-pizza`, separada de Kairos. Especificación guardada en `docs/PROMPT-MAESTRO.md`.
- **Base de datos** (`supabase/migrations/`, 4 archivos):
  - Todas las tablas del documento + `operaciones` (doble toque), `reportes_stock`, `receta_armado`, `precios_historial`.
  - Lógica en el servidor: pedidos de mesa y mostrador, cobros, comandas por estación, reservas/consumo de porciones,
    cancelaciones con merma, traslados, armado de ruedas/personales, tortas, producción, portapizzas, reportes,
    ajustes (solo admin), precios con historial, recetas versionadas, crear sede, compras con recepción parcial,
    turnos, base y gastos de caja.
  - Reglas de stock bajo → una alerta + una tarea automática por regla; se reevalúan al cambiar el mínimo.
  - Permisos (RLS) por sede y rol; funciones internas bloqueadas para la app; tiempo real activado.
  - Datos de ejemplo: Sede Principal (15 mesas) y El Refugio (10), 16 productos, 19 reglas por sede, plantillas por rol.
- **Pruebas**: `npm test` → 15 de 15 pasan (las 10 obligatorias + 5 extra).
- **App** (`app/`): marca Max Pizza (logo corona+porción, marfil/negro/mostaza), entrada con correo y clave,
  selección de sede y rol, **Mi turno** (iniciar/finalizar) y **Mis tareas** con anillo de progreso en vivo.

## Conexión — ✅ hecha (23 nov 2026)
- Supabase "Max pizza" (ref mwrhuevxnzhxhcrfgwpn) con las migraciones 001–005 y 7 cuentas de prueba (supabase/cuentas-prueba.sql).
- 005 da permisos de API (los proyectos nuevos de Supabase no exponen tablas solas).
- Verificado en la app: entrar con insumos@, elegir sede, iniciar turno, tareas de plantilla, Empezar → ✓ Lista, anillo 1 de 2 · 50 %.

## Siguiente: Fase 2
Caja (Por cobrar, Venta rápida, Nuevo pedido, Pizzas por hornear, Base/Gastos), Mesero (Mesas, Stock) y
Tablet de comandas. Borrador que sobrevive a fallos de conexión ("Pendiente de envío").

## Después
- Fase 3: Nevera, Armado, Tortas, Insumos.
- Fase 4: Administración completa (incluye función para crear usuarios desde la app: necesita una Edge Function con la clave service_role).
- Fase 5: APK "Max Pizza" (Capacitor + GitHub Actions), publicación web, instrucciones por dispositivo.
