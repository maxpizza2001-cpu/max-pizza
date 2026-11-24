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

## Fase 2 · Caja, Mesero y tablet de comandas — ✅ hecha (23 nov 2026)
- **Caja** (`app/src/pantallas/Caja.tsx`, computador): Por cobrar (solo mesas con pedido y saldo, botón mostaza con el número;
  una sola cuenta abierta a la vez; cobro parcial; medio de pago; "Verificar si quedó cobrado" si se cae la conexión),
  Venta rápida de porciones (toques suman, cantidad editable, mostrador/para llevar, borrador guardado),
  Nuevo pedido (pizzas, rápidas, bebidas; mesa = se prepara y queda abierta; mostrador = se cobra primero),
  Pizzas por hornear con contador y cola (Empezar/Lista), Base con efectivo esperado y cierre, Gastos, Tareas sin perder la venta.
- **Mesero** (`Mesero.tsx`, celular): Mesas (libre / ocupada con saldo / pagada), tomar pedido con notas ("Sin cebolla"),
  agregar a la misma cuenta, borrador guardado en el teléfono y "Pendiente de envío" si falla, estado por línea, cancelar línea,
  🔔 Listos para llevar → Entregado (con sonido), Liberar mesa, Stock de servicio con Queda poco / Se acabó / Reportar conteo,
  Armar portapizzas (también desde la tarea automática).
- **Comidas rápidas** (`Rapidas.tsx`): tablet de comandas solo con lo de su estación, tarjetas grandes, tiempo de espera,
  notas en rojo, aviso sonoro, Empezar/Listo; vista personal con turno y tareas.
- Todo en tiempo real entre dispositivos (Supabase Realtime) y recarga al volver a la app o recuperar internet.
- **Probado en vivo** con 3 cuentas: Mesa 02 pide 2 Hawaianas + hamburguesa "Sin cebolla", luego agrega 1 porción →
  Caja ve solo "02" y 2 comandas de horno; tablet solo la hamburguesa; al marcar Lista el mesero recibe el aviso sin recargar;
  Caja cobra $39.000 y el 02 desaparece; disponibilidad 16→13 sin doble descuento; venta rápida de 4 con doble toque → 13→9;
  base $100.000; mesero libera la mesa.
- Datos de prueba que quedaron en la base real: esa Mesa 02 (pagada y liberada), una venta de mostrador (comanda en horno) y la base abierta.

## Fase 3 · Nevera, Armado, Tortas e Insumos — ✅ hecha (23 nov 2026)
- **Comidas rápidas · Nevera y tareas** (`Rapidas.tsx`): tarjetas "X en mi nevera · Y disponibles en Producción",
  Subir a nevera con varios insumos en un registro (resta y suma a la vez), botón directo desde la tarea "Traer…".
- **Armado de ruedas** (`Armado.tsx`): Ruedas (sabor, ½ = 4 / 1 = 8 porciones, tortas grandes reales con medias),
  Pizzas personales (saldo aparte, tortas pequeñas), Retirar insumo de Producción, Mis tareas ("Armar Hawaiana" →
  Empezar → Registrar rueda).
- **Producción de tortas** (`Produccion.tsx`): monjes, grandes y pequeñas con mínimos, bases de las otras sedes, registro.
- **Producción de insumos** (`Produccion.tsx`): Mis tareas (Empezar → Marcar lista pide la cantidad real), Stock con
  mínimos y "Registrar", retiros de otras áreas (quién, cuánto, a qué hora), insumos usados opcionales.
- Líquidos se escriben en litros y pesos en kilos (se guardan en ml y g).
- Base: migración **006** (la tarea de reposición queda lista cuando el área repone; si se marca lista con stock bajo,
  nace otra) y **007** (tiempo real para reglas). Aplicadas en Supabase. `npm test` → 16/16.
- Arreglo: el tiempo real se escucha por tabla (antes, una tabla sin tiempo real apagaba los avisos de la pantalla)
  y cada pantalla se refresca al instante tras guardar.
- **Probado en vivo**: nevera sube 5 de hamburguesa + 20 de res en un registro → Producción queda en 7 → a Insumos le
  llega sola "Preparar carne de hamburguesa · Quedan 7" (1 de 2 → 1 de 3 · 33 %) → Empezar → Marcar lista → 20 →
  ✓ Lista, 27 en stock, 2 de 3 · 67 %. Armado: ½ rueda Hawaiana (½ torta) y 2 personales (saldos separados),
  retiro de 1 L de salsa de ajo (1,9 → 2,9 L). Tortas: 20 − ½ = 19,5 → +15 = 34,5.

## Siguiente: Fase 4
Administración completa: selector de sedes, alertas primero, Sedes (＋ Nueva sede), Equipo (crear usuarios, turnos en
vivo), Checklists, Reglas de stock bajo, Catálogo y precios, Inventario y ajustes, Proveedores, Compras, Análisis, Caja.

## Después
- Fase 4: Administración completa (incluye función para crear usuarios desde la app: necesita una Edge Function con la clave service_role).
- Fase 5: APK "Max Pizza" (Capacitor + GitHub Actions), publicación web, instrucciones por dispositivo.
