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
- **Caja** (, computador): Por cobrar (solo mesas con pedido y saldo, botón mostaza con el número;
  una sola cuenta abierta a la vez; cobro parcial; medio de pago; "Verificar si quedó cobrado" si se cae la conexión),
  Venta rápida de porciones (toques suman, cantidad editable, mostrador/para llevar, borrador guardado),
  Nuevo pedido (pizzas, rápidas, bebidas; mesa = se prepara y queda abierta; mostrador = se cobra primero),
  Pizzas por hornear con contador y cola (Empezar/Lista), Base con efectivo esperado y cierre, Gastos, Tareas sin perder la venta.
- **Mesero** (, celular): Mesas (libre / ocupada con saldo / pagada), tomar pedido con notas ("Sin cebolla"),
  agregar a la misma cuenta, borrador guardado en el teléfono y "Pendiente de envío" si falla, estado por línea, cancelar línea,
  🔔 Listos para llevar → Entregado (con sonido), Liberar mesa, Stock de servicio con Queda poco / Se acabó / Reportar conteo,
  Armar portapizzas (también desde la tarea automática).
- **Comidas rápidas** (): tablet de comandas solo con lo de su estación, tarjetas grandes, tiempo de espera,
  notas en rojo, aviso sonoro, Empezar/Listo; vista personal con turno y tareas.
- Todo en tiempo real entre dispositivos (Supabase Realtime) y recarga al volver a la app o recuperar internet.
- **Probado en vivo** con 3 cuentas: Mesa 02 pide 2 Hawaianas + hamburguesa "Sin cebolla", luego agrega 1 porción →
  Caja ve solo "02" y 2 comandas de horno; tablet solo la hamburguesa; al marcar Lista el mesero recibe el aviso sin recargar;
  Caja cobra $39.000 y el 02 desaparece; disponibilidad 16→13 sin doble descuento; venta rápida de 4 con doble toque → 13→9;
  base $100.000; mesero libera la mesa.
- Datos de prueba que quedaron en la base real: esa Mesa 02 (pagada y liberada), una venta de mostrador (comanda en horno) y la base abierta.

## Siguiente: Fase 3
Nevera de Comidas rápidas (Subir a nevera con varios insumos), Armado de ruedas (ruedas, personales, retirar insumo),
Producción de tortas y Producción de insumos (registrar producción, retiros).

## Después
- Fase 3: Nevera, Armado, Tortas, Insumos.
- Fase 4: Administración completa (incluye función para crear usuarios desde la app: necesita una Edge Function con la clave service_role).
- Fase 5: APK "Max Pizza" (Capacitor + GitHub Actions), publicación web, instrucciones por dispositivo.
