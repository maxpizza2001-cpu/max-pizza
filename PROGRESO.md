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

## Fase 4 · Administración — ✅ hecha (23 nov 2026)
Pantalla `app/src/pantallas/admin/` (celular y computador), selector **Todas las sedes / una sede**, 11 apartados:
- **Inicio**: cifras (stock bajo, en turno, mesas y saldo por cobrar), **Requiere tu decisión** primero (tareas de compra,
  alertas de stock con la tarea que se envió y a quién, reportes del equipo con Revisado / Corregir saldo), avance por área, en turno.
- **Equipo**: en turno ahora y terminaron hoy (con duración), integrantes, ＋ Nuevo integrante (correo, clave, roles por sede),
  cambiar roles/sedes, restablecer clave, desactivar/activar, últimos turnos y tareas terminadas por persona.
- **Tareas (Checklists)**: avance por área y sede, detalle de quién recibió/empezó/terminó y a qué hora, ＋ Nueva tarea
  (área o persona), editar, reasignar, archivar; plantillas por turno (agregar, prioridad, orden, pausar).
- **Stock bajo (reglas)**: todas las reglas con saldo actual y estado, crear/editar (sede, ubicación, insumo, mínimo en L/kg,
  área o persona, prioridad, mensaje; la acción de la tarea se pone sola), pausar/reactivar, borrar.
- **Catálogo**: productos por categoría, crear/editar (nombre, foto, formato, estación, activo), precio y "se vende aquí" por
  sede, receta versionada, historial de precios.
- **Inventario**: saldos por ubicación (físico, reservado, disponible), ajustes con motivo obligatorio y "es merma",
  movimientos con saldo antes→después (paginado y filtros), conteos reportados, insumos nuevos.
- **Proveedores**: crear/editar, WhatsApp, días, condiciones, productos con precio e historial.
- **Compras**: Por comprar / En camino / Recibido, faltantes agrupados por proveedor → Armar pedido, mensaje por WhatsApp,
  marcar pedido, registrar lo que llegó (parcial), anular.
- **Análisis**: consumo de hoy / semana / 30 días por categoría: usado, merma, existencia (y por sede).
- **Caja**: por día: ventas registradas, pagos recibidos, saldos pendientes, gastos, por medio de pago, turnos de caja con
  efectivo esperado, cuentas abiertas, cobros y gastos.
- **Sedes**: ＋ Nueva sede (mesas, copia precios y reglas de otra), nombre, mesas, estaciones on/off, ubicaciones, equipo, activar/desactivar.
- Base: migración **008** (crear usuarios por SQL seguro sin clave secreta, historial de precios automático, merma con cantidad,
  `analisis_consumo`, permisos de compras). Aplicada en Supabase. `npm test` → 18/18.
- **Probado en vivo** como admin: con 27 carnes de hamburguesa se subió el mínimo de 7 a 30 → al instante "Stock bajo" y
  en Inicio "Requiere tu decisión · Tarea enviada a Producción de insumos"; se volvió a 7 → OK. Los 11 apartados cargan sin errores;
  Caja del día cuadra ($67.000 ventas = $67.000 pagos).

## Siguiente: Fase 5
APK "Max Pizza" (Capacitor + GitHub Actions), publicar la web (Vercel), instrucciones por dispositivo, limpiar datos de prueba.

## Después
- Fase 5: APK "Max Pizza" (Capacitor + GitHub Actions), publicación web, instrucciones por dispositivo.

## Fase 5 · APK — ✅ (23 nov 2026)
- Repositorio privado **github.com/maxpizza2001-cpu/max-pizza** (cuenta nueva, separada de KairosX). Commits a nombre de maxpizza2001-cpu.
- `.github/workflows/apk.yml` arma la APK "Max Pizza" (Capacitor, ícono oficial) en cada cambio de `app/` y la publica en
  **Releases** (la última = "Latest"). Secretos puestos: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
  Versión 1 salió sin claves (no usar); **versión 2** ya conectada.
- Subir cambios: el dueño corre `git push` (el modo automático no deja a Claude subir código).
- **Web en Vercel** (cuenta maxpizza2001-cpu, carpeta `app`, 2 variables VITE_): https://max-pizza-roan.vercel.app — se actualiza sola con cada `git push`.
- Pendiente: limpiar datos de prueba antes de arrancar con el equipo real; revisar "pedido de prueba no aparece en la comanda".

## Tienda online · Fase 1 (portada y menú) — ✅ (24 nov 2026)
- Plan aprobado: la tienda usa el MISMO catálogo y, desde la Fase 3, el MISMO motor de pedidos (`crear_envio`). Se mantiene Vite + React (no Next.js) para no reconstruir.
- Ruta pública **/pedir** (sin cuenta): escoger sede (se recuerda), **portada giratoria** (pizzas montadas en una rueda que gira sola y al deslizar; cada pizza gira sobre sí), menú por categorías con precios de esa sede. Sin foto → pizza dibujada según el sabor.
- Migración **009** (aplicada en Supabase): `productos.descripcion`, `productos.destacado` (★ portada), `productos_sede.online`, funciones públicas `tienda_sedes` / `tienda_catalogo` (el público no lee tablas), carpeta de fotos `productos` en Storage (solo admin sube).
- Administración → Catálogo: descripción, 📷 Subir foto, ★ portada, "En la tienda online" por sede.
- `vite base '/'` + rewrites en `vercel.json` para que /pedir funcione en Vercel. `npm test` → 19/19. App interna verificada igual.
- Siguiente: Fase 2 (personalización, carrito, checkout).
