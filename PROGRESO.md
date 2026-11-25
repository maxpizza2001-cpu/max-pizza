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

## Tienda online · Fase 2 (personalización, carrito, checkout) — ✅ (24 nov 2026)
- Tamaños sin tabla nueva: "Porción X" y "Personal X" del catálogo se muestran como **Pizza X** con selector de tamaño.
- Migración **010** (aplicada): `producto_opciones` (adicionales con precio extra y el insumo que gastan, para la Fase 4),
  `tienda_ajustes` por sede (abierta, pedido mínimo, medios de pago, Nequi/cuenta, horario, domicilio/recoger),
  `zonas_domicilio` con tarifa (ejemplos: Cerca $3.000, Media $5.000, Lejos $7.000), función pública `tienda_info`.
- Tienda: ventana del producto (tamaño, adicionales, "¿Algo especial?", cantidad, precio en vivo), barra "Ver mi pedido",
  carrito (cambiar cantidad, Modificar, Quitar) guardado en el teléfono por sede, checkout en 3 pasos: datos, domicilio/recoger,
  zona con tarifa, medio de pago, efectivo con vueltas, comprobante para Nequi/transferencia, validaciones y pedido mínimo.
- El botón final aún NO envía el pedido (dice "muy pronto"): eso es la Fase 3.
- Probado en celular: Hawaiana personal + extra queso × 2 = $38.000, salchipapa $14.000, recargar conserva $52.000,
  zona Media +$5.000 = $57.000, paga con $60.000 → vueltas $3.000. `npm test` → 20/20.

## Tienda online · Fase 3 (el pedido entra al sistema) — ✅ (24 nov 2026)
- Migración **011** (aplicada): cuentas tipo `online`, tabla `pedidos_online` (código de 6 letras, cliente, entrega, zona,
  pago, vueltas, comprobante y su estado, estado del pedido Recibido→Entregado, domiciliario y horas para la Fase 5),
  bucket privado `comprobantes` (el cliente sube, solo el equipo ve).
- `tienda_crear_pedido` (pública): recalcula TODO en el servidor (precio de sede, adicionales, domicilio por zona, pedido
  mínimo, tienda abierta, medios permitidos), idempotente con `operacion_id`, y usa el MISMO `crear_envio`:
  pizzas → comanda de horno con reserva de porciones, comidas rápidas → tablet, bebidas descuentan stock.
  Cada línea llega a la comanda como "ONLINE · + Extra queso · Sin piña". Notifica a Caja "🛵 Pedido online #N".
- Tienda: "Confirmar pedido" sube el comprobante (si hay), envía, vacía el carrito y muestra el código grande.
  Si se cae la conexión y el cliente toca otra vez, NO se duplica.
- Probado en la base real como cliente sin cuenta (dentro de una transacción deshecha): código BAWBHT, $18.000 + $3.000.
  `npm test` → 21/21.
- Pendiente: Fase 4 (Caja ve y cobra los online; adicionales descuentan su insumo), Fase 5 (seguimiento y domicilios), Fase 6.

## Tienda online · Fase 4 (Caja maneja los pedidos online) — ✅ (24 nov 2026)
- Migración **012** (aplicada): `online_estado` (Caja confirma, "Salió" con domiciliario, Entregado, Cancelar con motivo
  → libera reservas y anula la cuenta; solo avanza, nunca devuelve), `online_comprobante` (✓ llegó / ✗ no llegó),
  disparador: cuando el horno o la tablet empiezan → "En preparación"; todas listas → "Listo" (solo hacia adelante),
  `descontar_adicionales`: cada adicional descuenta su insumo al pedir (ej. Doble carne −1 carne). Tiempo real en `pedidos_online`.
- Caja: tarjeta **🛵 Pedidos online** arriba de "Por cobrar", con pito al llegar uno nuevo, estado con texto, "revisar pago".
  Al abrir: cliente (llamar / WhatsApp), dirección, productos con notas en rojo, vueltas, comprobante, y botones
  Confirmar pedido · Salió · Confirmar cobro (usa el mismo `confirmar_cobro`) · Entregado · Cancelar.
- Probado en la base real (transacción deshecha). `npm test` → 22/22.
- Ojo: cancelar un pedido no devuelve al inventario lo de los adicionales (queda como venta). Pendiente Fase 5 y 6.

## Tienda online · Fase 5 (seguimiento y domicilios) — ✅ (24 nov 2026)
- Migración **013** (aplicada): `tienda_seguimiento(código, celular)` pública (sin el celular correcto no muestra nada),
  historial de cada paso (también los automáticos de la cocina), `online_ajustar` (solo Administración: domiciliario,
  notas, tarifa de domicilio mientras no esté pagado; deja auditoría).
- Tienda: botón "📦 Seguir pedido / Mi pedido" arriba; al pedir, "Seguir mi pedido en vivo". Línea de tiempo
  Recibido → Confirmado → En preparación → Listo → En camino (con nombre del domiciliario) → Entregado, con hora de cada paso.
  Se actualiza sola cada 10 s. Link directo: /pedir?codigo=XXXXXX.
- Administración → **🛵 Domicilios**: pedidos online por día y sede, estado, pagado/sin pagar, horas (llegó, salió,
  entregado, minutos), quién lo llevó, tarifa, notas; totales, tiempo promedio y pedidos por domiciliario; "Editar".
- `npm test` → 23/23. Probado: /pedir?codigo=ZZZZZZ consulta la base real y dice que no existe.
- Pendiente: Fase 6 (ajustes de la tienda desde Administración: abierta/cerrada, horarios, zonas, medios, adicionales, promos).

## Tienda online · Fase 6 (Administración de la tienda) — ✅ (24 nov 2026)
- Migración **014** (aplicada): tabla `promociones` (porcentaje o valor, pedido mínimo, código opcional, fecha final, por sede
  o todas), `promo_mejor` (la que más descuenta), `tienda_promo` (vista previa pública), `tienda_info` ahora trae las promos
  automáticas (las de código no se revelan), y `tienda_crear_pedido` aplica el descuento en el servidor
  (`pedidos_online.descuento` y `promocion_id`). Código inválido → "Ese código de promoción no existe o ya venció".
- Administración → **🌐 Tienda online** (por sede): ⏸ pausar / ▶ abrir pedidos, horario, pedido mínimo, domicilio/recoger,
  medios de pago, número Nequi y datos de transferencia; zonas con tarifa (editar, quitar, agregar); promociones (crear,
  pausar); adicionales por producto (precio, quitar, agregar con el insumo que gasta y de dónde sale). Botón "Ver la tienda".
  Fotos, precios, "se vende online" y portada siguen en Catálogo.
- Tienda: cintas verdes "🎁 promo" en la portada, campo "¿Tienes un código?" si hay códigos, y descuento en los totales.
- `npm test` → 24/24. Las zonas y adicionales de ejemplo siguen ahí: cambiarlos por los reales en 🌐 Tienda online.
- **Tienda online completa (Fases 1–6).**

## Domiciliarios — ✅ (25 nov 2026)
- Migración **015** (aplicada): rol **Domiciliario**; `pedidos_online.domiciliario_id` y `tomado_en`;
  `domicilio_tomar` (atómico: el primero que toca gana, al otro le dice "Ya lo tomó X"), `domicilio_soltar`,
  `domicilio_avanzar` (Salí solo con el pedido Listo → En camino → Entregado). Avisos: a los domiciliarios cuando Caja
  confirma un domicilio; a Caja cuando alguien lo toma y cuando lo entrega ("Trae el efectivo: $X").
- Pantalla **Domicilios** (rol domiciliario): "Disponibles" con pito y botón grande **🙋 Yo lo llevo** (solo los confirmados
  por Caja), "Mis domicilios" con dirección, 🗺️ Mapa, 📞 Llamar, 💬 WhatsApp, productos, cuánto cobrar y vueltas,
  🛵 Salí / ✓ Entregado / Soltar; al final, entregados hoy y efectivo para entregar en Caja.
- Caja sigue cobrando con "Confirmar cobro" (el domiciliario le entrega el efectivo).
- Para usarlo: Administración → Equipo → ＋ Nuevo integrante con rol Domiciliario. `npm test` → 25/25.

## Avisos al celular bloqueado (Web Push) — ✅ configurado (25 nov 2026)
- Migración **016** (aplicada): `push_suscripciones`, `push_guardar`, `config_app.url_avisar`, disparador en `notificaciones`
  que llama (pg_net) a la Edge Function **avisar** solo si hay celulares suscritos a ese rol y sede.
- Edge Function `supabase/functions/avisar` (subida; "Verify JWT" apagado por el dueño: solo reenvía notificaciones reales
  de menos de 5 min). Llaves VAPID: privada y pública en Supabase → Secrets; pública en Vercel como `VITE_VAPID_PUBLIC`.
  Copia local en `llaves-avisos.txt` (ignorado por git).
- App: `public/sw.js` (aviso con vibración, queda en pantalla), `manifest.webmanifest`, botón **🔔 Activar avisos** en
  la pantalla del domiciliario. Funciona desde Chrome (Android) o la app agregada a inicio (iPhone); no dentro de la APK.
- Verificado: la función responde 200 con las llaves; la página publicada trae la llave pública. Falta la prueba en un
  celular real con un domiciliario. `npm test` → 26/26.

## Tienda: rediseño limpio tipo app de domicilios — ✅ (25 nov 2026)
- Barra blanca: logo en placa negra, "Pides en [sede] ▾", botón 📦 Mi pedido (punto rojo si hay uno activo).
- Fila de estado: ● Abierto/Cerrado, horario, "Domicilio desde $X", "Recoger gratis", mínimo.
- Portada giratoria dentro de una tarjeta oscura redondeada (más compacta); promociones como tarjetas verdes deslizables.
- Buscador + categorías fijos arriba; tocar una categoría baja hasta ella y se marca sola al ir bajando.
- "⭐ Los favoritos" en carrusel; menú en filas (texto a la izquierda, foto a la derecha con ＋ que muestra cuántos llevas);
  2 columnas en tablet y 3 en computador. Pantalla de sede y pie en claro; barra del carrito negra.
- Probado en 375 px y 1280 px: sin desbordes, buscador ("hambur" → Hamburguesa), categorías y agregar al carrito.

## Tienda: diseño tipo app de pizzería (según referencia del dueño) — ✅ (25 nov 2026)
- Se tomó solo la estructura de la referencia (sin marca ajena ni calificaciones inventadas), en blanco · negro · mostaza:
  cabecera con 📍 sede, saludo + logo, 📦 seguimiento y 🛍️ bolsa con contador; buscador con chip Abierto/Cerrado;
  portada negra con "¡MÁS SABOR! MÁS QUESO." y la rueda giratoria (en computador, texto a la izquierda y rueda a la derecha);
  categorías en círculos; "Los más pedidos" en tarjetas deslizables con sello; banner amarillo con la mejor promoción;
  menú en tarjetas (2 columnas celular, 3 tablet, 4 computador) con ＋ mostaza que muestra cuántos llevas;
  franja de confianza (domicilio desde, recién hecha, promociones, pago fácil); barra de abajo Inicio · Menú · 🍕 Pedir
  (muestra el total) · Promos · Mi pedido.
- Probado en 375 px y 1280 px: sin desbordes; Pedir lleva al menú, agregar suma en la bolsa y en el botón, Pedir abre el carrito.

## Tienda: ideas de otras pizzerías (Jeno's, Papa John's, Domino's) — ✅ (25 nov 2026)
- Migración **017** (aplicada): `combos` + `combo_items` (precio especial; el servidor abre el combo en sus productos y pone
  el descuento en el más caro, cada uno va a su cocina e inventario; si un producto no se vende en línea el combo se esconde),
  `zonas_domicilio.minutos_min/max`, `tienda_ajustes` con WhatsApp, Instagram, Facebook, TikTok y banner de temporada;
  `tienda_info` devuelve todo eso.
- Tienda: sección 🎉 Combos ("AHORRAS $X", precio normal tachado), banner de temporada, "Llega en 30–45 min",
  búsquedas sugeridas al tocar el buscador, pie con redes y seguir pedido, botón flotante de WhatsApp.
- Administración → 🌐 Tienda online: combos (armar, ver ahorro, pausar, cambiar precio), tiempo por zona, redes y banner.
- Catálogo: la descripción sugiere escribir los ingredientes.
- Probado: `npm test` 27/27 (incluye combos) y en la base real con transacción deshecha (combo $10.000 vs $11.000).
- Hallazgo: la tienda muestra productos aunque no haya stock (ej. Personales Hawaiana = 0) y el error sale recién al
  confirmar ("No alcanza"). Pendiente: marcar "Agotado" en la tienda.
