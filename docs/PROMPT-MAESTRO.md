# PROMPT MAESTRO · APLICACIÓN INTERNA MAX PIZZA

> Especificación entregada por el dueño el 23 nov 2026. Es la fuente de verdad: todo lo que se construya debe cumplirla.
> Referencias visuales en `diseno/referencias/` (3.jpg = identidad oficial: logo corona + porción, mostaza / negro / marfil).

Construye **MAX PIZZA**, una aplicación interna para gestionar el restaurante desde que el mesero toma un pedido hasta que Caja cobra, el equipo repone lo que se usó y Administración revisa la operación.

Debe ser una **aplicación funcional con ocho pantallas conectadas a una sola base de datos**. Los usuarios trabajan desde diferentes dispositivos y ven los cambios en tiempo real según su rol y sede. Los botones deben ejecutar operaciones reales y los datos deben conservarse al cerrar o recargar.

Configura inicialmente **Sede Principal** y **El Refugio**. Desde Administración debo poder **crear más sedes y configurarlas sin modificar el código**.

## 1. Diseño visual y facilidad de uso

- **Identidad:** usa blanco o marfil claro, negro y amarillo mostaza. Respeta el logo oficial cuando se proporcione. Usa español de Colombia, pesos colombianos y hora de Colombia.
- **Estilo:** minimalista, moderno y cercano. Usa tarjetas limpias, números grandes para mesas y cantidades, iconos reconocibles y textos cortos.
- **Botones:** usa mostaza para la acción principal. Escribe el resultado esperado en el botón, por ejemplo **Confirmar cobro**, **Enviar pedido**, **Subir a nevera** o **Registrar producción**.
- **Estados:** acompaña cada color con texto. Para prioridades del checklist, usa **rojo · Alta**, **amarillo · Media** y **verde · Baja**. Las tareas terminadas llevan **✓ Lista**.
- **Espacio:** muestra primero lo que la persona necesita en ese momento. Abre los detalles al tocar un botón o tarjeta. En Caja, evita mostrar varias cuentas desplegadas a la vez.
- **Dispositivos:** Caja está optimizada para el computador todo en uno. Comandas de Comidas rápidas, para la tablet fija. Mesero, Armado y Producción, para celular. Administración debe funcionar bien en celular y computador.
- **Rapidez:** cada toque en un producto actualiza la cantidad y el total de inmediato. Conserva el pedido en curso si se abre el checklist, se consulta el stock o se cambia temporalmente de apartado.
- **Conexión:** si falla el envío, conserva el borrador y muestra **Pendiente de envío**. Muestra **Enviado** cuando el servidor lo confirme. Si un cobro queda en estado incierto, consulta primero si fue registrado antes de reintentar.

## 2. Cuentas, roles, turnos y checklists

### Acceso personal

Cada integrante entra con **correo y clave personal**. La app abre su área de trabajo y muestra las sedes autorizadas. Administración puede crear o invitar usuarios, asignarles roles y sedes, restablecer accesos y desactivar cuentas.

Roles iniciales: **Administración, Caja, Mesero, Comidas rápidas, Armado de ruedas, Producción de tortas y Producción de insumos**. Comidas rápidas tiene dos vistas: la tablet fija de comandas y la pantalla personal de nevera y tareas.

### Turnos

Cada integrante tiene **Iniciar turno** y **Finalizar turno** en su pantalla personal. Registra automáticamente **persona, rol, sede y hora**. En Administración debe aparecer en tiempo real quién está en turno, quién terminó y la duración registrada.

### Checklist personal

Cada rol tiene **Mis tareas**. Al abrirlo, muestra una **gráfica de progreso** con porcentaje y conteo, por ejemplo **2 de 4 listas · 50 %**. Usa un anillo en celular o una barra en vistas compactas.

- Ordena las tareas por prioridad y usa los estados **Pendiente, En proceso y Lista**.
- Calcula el avance con las **tareas listas divididas entre las tareas vigentes asignadas al turno**. Si el trabajador no tiene tareas, muestra **Sin tareas asignadas**.
- Incluye tareas asignadas por Administración y tareas automáticas generadas por la app. Si llevaba **2 de 4 listas** y entra una nueva tarea, muestra **2 de 5 · 40 %**.
- Actualiza el porcentaje y la lista de Administración **en tiempo real**. Debo poder ver quién recibió una tarea, quién la empezó, quién la terminó y a qué hora.
- Cuando una tarea corresponde a una operación, vincula el botón con esa operación. Por ejemplo, **Registrar base** completa la tarea de Caja al guardar la base. **Preparar salsa** abre el registro de producción.

## 3. Las ocho pantallas

### 1. Caja · Computador todo en uno

Organiza la pantalla principal en **Por cobrar**, **Venta rápida**, **Nuevo pedido** y **Pizzas por hornear**. Coloca **Base**, **Gastos** y **Tareas** arriba como accesos pequeños.

**Por cobrar**

- Muestra **solo las mesas que ya enviaron un pedido y todavía tienen saldo pendiente**.
- Cada mesa aparece como un **botón amarillo pequeño**, con el número únicamente: **`01`**, **`04`**, **`07`**. Una mesa sin pedido o con la cuenta pagada no aparece en esa fila.
- Al tocar **`01`**, abre únicamente esa cuenta. Muestra los productos, cantidades, total y **Confirmar cobro**.
- Cuando el cajero recibe el pago y confirma, registra el medio de pago y, si el saldo queda en cero, retira el botón de **Por cobrar**.
- **En mesa se prepara al enviar el pedido y se cobra al final.** El botón de cobro registra el pago de una cuenta que ya fue enviada a preparación.

**Venta rápida y pedidos desde Caja**

- Muestra tarjetas compactas de los sabores con porciones disponibles. En cada una, incluye sabor, foto y cantidad disponible.
- Cada toque suma una porción. Si Caja toca cuatro veces Hawaiana, muestra **Hawaiana ×4** y el total actualizado. También debe poder editar la cantidad directamente.
- Al recibir el dinero, Caja toca **Confirmar cobro**. En mostrador, esa acción registra la venta, descuenta la disponibilidad y envía la comanda.
- **Nuevo pedido** permite agregar **Pizzas, Comidas rápidas y Bebidas**. Si Caja toma un pedido para una mesa, lo envía a preparar y deja la cuenta abierta. Si es de mostrador o para llevar, cobra antes de activar la preparación.

**Pizzas por hornear**

- La cola del horno vive **en el mismo computador de Caja**. Usa un acceso compacto con contador, por ejemplo **Pizzas por hornear · 2**. Al tocarlo, se abre la cola.
- Cada comanda muestra mesa o mostrador, número de pedido, sabor, cantidad, observaciones y estado. Botones **Empezar** y **Lista**.
- Cuando se marca lista, actualiza el avance del pedido y avisa al mesero cuando corresponda.

**Base, gastos y tareas**

- **Base:** registra el efectivo inicial para dar cambio por turno de Caja.
- **Gastos:** registra categoría, concepto, valor, responsable y medio de pago. Guarda quién hizo el registro y cuándo. Si salió efectivo de Caja, actualiza el efectivo esperado.
- **Tareas:** abre el checklist y su gráfica sin perder la venta que estaba en curso.

### 2. Mesero · Celular

Muestra **Mesas · Mis tareas · Stock**. Destaca arriba los pedidos listos para llevar.

- El mesero entrega al cliente una **ficha física**, por ejemplo **Mesa 02**, y abre esa mesa en su celular.
- Toca **Tomar pedido**, agrega productos y modificaciones como **Sin cebolla**, revisa y toca **Enviar pedido**. Las pizzas llegan a la cola de Caja y las comidas rápidas a su tablet.
- Si el cliente pide algo más, el mesero lo añade a la **misma cuenta**. A preparación llega solo lo que acaba de agregar.
- El mesero ve qué parte está lista, recibe el aviso y marca **Entregado** cuando la lleva. Al terminar de comer, el cliente lleva la ficha a Caja. Cuando la cuenta está pagada y la mesa ya está preparada para otro cliente, el mesero toca **Liberar mesa**.
- En **Stock**, muestra los insumos de servicio y aseo de su sede: portapizzas armados, cartones, servilletas, citronela, límpido y los que configure Administración.
- Cada insumo tiene **Queda poco**, **Se acabó** y **Reportar conteo**. El reporte llega a Administración con sede, persona y hora. Los conteos reportados quedan disponibles para verificar y corregir el saldo.
- Si quedan pocos portapizzas armados, aparece **Armar portapizzas** en su checklist. Cuando registra lo que armó, actualiza el saldo. Si faltan los cartones para armarlos, genera **Comprar cartones** en Administración.

### 3. Tablet de Comidas rápidas · Comandas

La tablet fija abre la vista de comandas de su sede y muestra **únicamente los productos preparados por Comidas rápidas**.

- Tarjetas grandes con mesa o número de pedido, tiempo de espera, productos, cantidades y observaciones visibles.
- La nueva comanda aparece en tiempo real y puede emitir un aviso breve. **Empezar** cambia el estado a **En preparación**. **Listo** actualiza la cuenta y la vista del mesero.
- Si Mesa 02 pide hamburguesa y pizza, la tablet muestra la hamburguesa. Caja muestra la pizza en la cola de horno. Las dos partes conservan la referencia al mismo pedido.
- Si se agrega o cancela una línea después del envío, muestra el cambio en la estación correspondiente. Conserva el historial de preparación.

### 4. Comidas rápidas · Nevera y tareas

En el celular del equipo de cocina, muestra solo sus insumos: salsa de ajo, BBQ, carnes, queso, papas y lo que configure Administración.

- Cada tarjeta muestra las dos cantidades. Ejemplo: **Carne de res · 5 en mi nevera · 48 disponibles en Producción**.
- **Subir a nevera** permite elegir el insumo y cantidad. Debe aceptar varios insumos en un registro, por ejemplo **20 de res, 20 de costilla y 20 de cerdo**.
- Cuando cocina sube 50 porciones de las 100 disponibles en Producción, quedan **50 en Producción y 50 en nevera** si estaba vacía. Resta y suma en la misma operación.
- Al preparar las comandas, registra una sola vez el consumo de la receta desde la nevera. Guarda mermas y ajustes como movimientos separados.
- Cuando la nevera queda en el mínimo, aparece una tarea como **Traer carne de res**, con el botón **Subir a nevera**. Si en Producción también queda poco, se genera allí el pendiente de **Preparar carne de res**.
- Incluye **Mi turno** y **Mis tareas** con su gráfica.

### 5. Armado de ruedas · Celular

Organiza esta pantalla en **Ruedas**, **Pizzas personales**, **Retirar insumo** y **Mis tareas**.

- En **Ruedas**, selecciona sabor y registra **½ rueda = 4 porciones** o **1 rueda = 8 porciones**. Guarda cuántas tortas grandes se usaron realmente, admitiendo media base cuando corresponda.
- Al guardar, reduce el saldo de bases usadas y aumenta el stock disponible de porciones del sabor. La porción se hornea cuando el cliente la pide.
- En **Pizzas personales**, registra sabor, número de personales armadas y cuántas tortas pequeñas se utilizaron. Mantén las personales disponibles en un saldo distinto al de porciones.
- En **Retirar insumo**, registra los ingredientes que se mueven de Producción a Armado, por ejemplo **1 L de salsa de ajo**. Resta de Producción y suma en Armado.
- Si hay pocas Hawaianas, muestra **Armar Hawaiana · Quedan 5**. Desde la tarea se puede empezar y registrar la rueda. Si falta salsa en Armado, genera **Traer salsa de ajo**. Si falta salsa en Producción, genera allí **Hacer salsa de ajo**.

### 6. Producción de tortas · Celular

Pantalla exclusiva de quien hace las bases. Muestra **Monjes recibidos**, **Tortas grandes**, **Tortas pequeñas** y **Mis tareas**.

- Registra cuántos **monjes** de masa recibió, cuántos usó y cuántas tortas hizo de cada tamaño. Guarda sede, persona, fecha y hora.
- Muestra las bases disponibles de cada tamaño por sede autorizada. La persona ve bases, monjes y avisos de reposición de tortas.
- Cuando Armado registra una rueda o personales, descuenta las bases correspondientes por tamaño y sede.
- Si se baja al mínimo de tortas grandes, genera **Reponer tortas grandes** en su checklist. Las pequeñas tienen su propia regla.
- Ejemplo: se registran 20 tortas grandes y Armado utiliza 15. Quedan 5. Si el mínimo es 8, la alerta aparece desde que quedan 8 y actualiza el saldo hasta 5.

### 7. Producción de insumos · Celular

Muestra **Mis tareas**, **Stock** y **Registrar producción**. Esta área prepara salsas, carnes y demás insumos.

- Al llegar al mínimo, agrega una tarea corta, como **Hacer salsa de ajo · Stock bajo** o **Preparar carne de hamburguesa**.
- **Empezar** cambia el estado a **En proceso**. **Marcar lista** pide la cantidad real producida, por ejemplo **1 L** o **20 porciones**.
- Al guardar, registra el lote, su rendimiento, los insumos usados cuando corresponda y quién lo hizo. Actualiza el stock, la tarea y ambos paneles de progreso.
- Muestra los retiros hechos por Comidas rápidas y Armado, con cantidad, área, sede y hora.
- Si el lote se termina pero el stock sigue bajo, el lote queda hecho y la necesidad de reposición permanece visible.

### 8. Administración · Celular y computador

La portada tiene un selector **Todas las sedes** y accesos a **Equipo**, **Tareas**, **Stock bajo**, **Compras** y **Caja**. Muestra primero las alertas que requieren una decisión.

| Apartado | Funciones de Administración |
|---|---|
| **Sedes** | **＋ Nueva sede**. Configurar nombre, mesas, estaciones, ubicaciones de inventario, productos disponibles, equipo y mínimos. Activar o desactivar conservando el historial. |
| **Equipo** | Crear usuarios, asignar roles y sedes, ver turnos en vivo y consultar actividad por persona. |
| **Checklists** | Crear, editar, ordenar, asignar, reasignar y archivar tareas. Configurar categorías, prioridades y plantillas por turno. Consultar porcentajes y el detalle de pendientes, en proceso y listas. |
| **Reglas de stock bajo** | Elegir producto, sede, ubicación, mínimo, área o persona responsable, prioridad, mensaje y acción que abre la tarea. Editar, pausar y reactivar reglas. |
| **Catálogo** | Crear, editar y desactivar pizzas, comidas rápidas y bebidas. Configurar nombre, foto, precio, formato de venta, sede, receta y estación. Los precios históricos de las ventas se conservan. |
| **Inventario** | Consultar saldos y movimientos por área y sede, revisar conteos y hacer ajustes con motivo obligatorio. Ver stock disponible, reservado y físico cuando corresponda. |
| **Proveedores** | Crear y editar proveedores. Guardar WhatsApp, productos, días de entrega, condiciones e historial de precios. |
| **Compras** | Ver **Por comprar**, **En camino** y **Recibido**. Agrupar faltantes por proveedor. Preparar mensaje para WhatsApp, marcar pedido y registrar recepciones parciales. |
| **Análisis** | Ver consumo semanal por sede o por todas, por categorías como aseo, ingredientes, producción interna, empaques y bebidas. Mostrar cantidades, existencias, merma y detalle por área. |
| **Caja** | Consultar base, cobros, cuentas abiertas, gastos y efectivo esperado por turno. Distinguir ventas registradas, pagos recibidos y saldos pendientes. |

**Permisos exclusivos de Administración:** modificar catálogo, precios, recetas, sedes, accesos, reglas de alerta, checklists del equipo y hacer **ajustes manuales de stock**. Guarda saldo anterior, nuevo saldo, motivo, usuaria y hora en cada ajuste. El personal registra sus operaciones normales: armar, producir, trasladar, preparar o entregar según su rol.

## 4. Automatización de alertas y checklists

**La aplicación envía automáticamente cada alerta y cada tarea al área correspondiente**, usando los datos de inventario y lo que yo configure desde Administración.

### Configuración de una regla

Cada regla guarda **sede, ubicación, insumo o producto, mínimo, unidad, rol o responsable, prioridad, texto, acción vinculada y estado activo o pausado**. Administración recibe una copia de las alertas. Si cambio el mínimo o la asignación, reevalúa el saldo y actualiza el pendiente correspondiente.

| Condición de ejemplo | Pantalla que recibe la tarea | Tarea automática |
|---|---|---|
| **50 o menos carnes de res en Producción** | Producción de insumos | **Preparar carne de res** |
| **7 o menos carnes de hamburguesa en Producción** | Producción de insumos | **Preparar carne de hamburguesa** |
| **5 o menos porciones en la nevera de Comidas rápidas** | Nevera y tareas | **Traer carne de res** |
| **Salsa de ajo baja en Armado** | Armado de ruedas | **Traer salsa de ajo** |
| **Salsa de ajo baja en Producción** | Producción de insumos | **Hacer salsa de ajo** |
| **5 o menos porciones Hawaianas disponibles** | Armado de ruedas | **Armar Hawaiana** |
| **8 o menos tortas grandes** | Producción de tortas | **Reponer tortas grandes** |
| **30 o menos portapizzas armados** | Mesero | **Armar portapizzas** |
| **Cartones o citronela reportados como escasos** | Administración | **Revisar compra** |

Los valores son iniciales de ejemplo y todos deben poder editarse por sede y ubicación.

### Comportamiento automático

1. Una venta, producción, retiro, traslado, recepción, consumo o ajuste cambia el saldo.
2. La app revisa las reglas activas de ese producto y ubicación.
3. Si se cumple el mínimo, crea o actualiza **una alerta activa** y **un pendiente de reposición**. Envía el aviso a la pantalla del área y a Administración.
4. Si el trabajador todavía no inicia turno, el pendiente queda en el área y aparece cuando el personal autorizado entra. Si varias personas tienen el mismo rol, comparten la tarea del área. Al empezarla, queda identificado quién la tomó.
5. Si el saldo baja de 7 a 6 y luego a 4, actualiza el mismo aviso. Si se registra un lote y el saldo sigue bajo, conserva el trabajo hecho y deja una sola reposición pendiente. Si el saldo supera el mínimo, cierra la alerta.
6. La app actualiza en vivo el checklist del trabajador, su gráfica y el panel administrativo. Guarda cada cambio con sede, persona, fecha y hora.

**Ejemplo de conexión entre áreas:** Comidas rápidas sube carne a su nevera. El traslado baja el saldo de Producción a siete. Producción recibe **Preparar carne de hamburguesa**. Al guardar un lote de 20 porciones, sube el stock de Producción, se completa la tarea y Administración ve el cambio.

## 5. Base de datos

Usa **PostgreSQL** con migraciones versionadas, claves foráneas, restricciones de unicidad, índices y permisos aplicados en el servidor. Entidades base:

| Grupo | Tablas sugeridas | Qué deben representar |
|---|---|---|
| **Organización** | `sedes`, `perfiles`, `roles`, `permisos`, `accesos_sede`, `turnos` | Usuario, rol, sede autorizada e historial de entrada y salida. |
| **Mesas y pedidos** | `mesas`, `cuentas`, `pedidos`, `lineas_pedido` | Una mesa puede tener varias cuentas históricas y una activa. Una cuenta reúne varios envíos. Cada línea conserva cantidad, observación y precio vendido. |
| **Comandas** | `estaciones`, `comandas`, `lineas_comanda`, `historial_estados` | Cada comanda referencia su envío y estación. Cada línea se vincula al producto del pedido. |
| **Caja** | `turnos_caja`, `pagos`, `gastos_caja`, `movimientos_caja` | Base, pagos, gastos, responsables y medios de pago vinculados al turno. |
| **Catálogo y recetas** | `categorias`, `productos`, `productos_sede`, `insumos`, `unidades`, `recetas`, `receta_detalles` | Productos de venta, existencias y cantidades que se usan. Conserva la versión de receta aplicada al movimiento. |
| **Inventario** | `ubicaciones_stock`, `saldos_stock`, `reservas_stock`, `movimientos_stock` | Existencia física, reserva y disponibilidad por sede, ubicación e ítem. Cada movimiento tiene origen, destino o motivo, y referencia a su operación. |
| **Producción** | `lotes_produccion`, `detalle_lote` | Monjes, bases, ruedas, personales, carnes y salsas. Cada lote registra insumos utilizados y resultado real. |
| **Checklists y alertas** | `plantillas_checklist`, `categorias_tareas`, `tareas`, `historial_tareas`, `reglas_stock`, `alertas_stock`, `notificaciones` | Plantillas configuradas, tareas manuales o automáticas, responsables, estado y vínculo con inventario. |
| **Compras** | `proveedores`, `proveedor_insumos`, `ordenes_compra`, `lineas_compra`, `recepciones`, `lineas_recepcion` | Proveedor, sede de destino, cantidad pedida, precio y recepciones parciales. |
| **Auditoría** | `historial_auditoria` | Quién realizó un cambio relevante, sobre qué registro, cuándo y en qué sede. |

### Reglas de integridad

- **Sede y permiso:** valida en el servidor que cada lectura y cambio pertenezca a la sede y al rol autorizados. Mesa 02 de Principal y Mesa 02 de El Refugio son registros distintos.
- **Una operación, un resultado:** evita duplicar pagos, comandas, tareas, lotes o movimientos si hay doble toque, reintentos o dos personas trabajando al mismo tiempo. Usa transacciones e identificadores de operación.
- **Reserva y consumo:** las porciones de mesa se reservan al enviar el pedido y las de mostrador al confirmar el cobro. Se descuentan de la existencia física cuando se usan. Al cancelar antes del uso, libera la reserva. Si ya se usaron, registra la merma o el ajuste correspondiente. El cobro de una mesa no vuelve a descontarlas.
- **Traslado:** resta en origen y suma en destino dentro de la misma transacción. Conserva el total de la sede hasta que se registre un consumo, una merma o un ajuste.
- **Cantidades:** guarda líquidos en mililitros, pesos en gramos y conteos en su unidad definida. Admite fracciones para media torta y otros casos válidos. Guarda el dinero con precisión exacta.
- **Recepción:** actualiza stock por lo realmente recibido. Si se pidieron 2 L y llegó 1 L, registra la entrada de 1 L y conserva 1 L pendiente.
- **Historial:** los cambios de precio, receta, sede o usuario conservan los movimientos anteriores. Los ajustes de stock dejan trazabilidad.
- **Tiempo real:** actualiza pedidos, comandas, pagos, turnos, tareas, alertas y saldos en las pantallas autorizadas. Al reconectar, consulta el estado guardado para recuperar los cambios que ocurrieron mientras el equipo estuvo desconectado.
- **Rendimiento:** carga primero las cuentas activas, comandas y tareas del turno. Filtra y pagina los historiales. Indexa las consultas por sede, estado, fecha y ubicación.

## 6. Pruebas obligatorias y entrega

| Prueba | Resultado esperado |
|---|---|
| **Caja tiene una mesa sin pedido, una con saldo y otra pagada.** | Solo aparece el número de la mesa que tiene un pedido enviado y saldo. Al tocarlo se abre su cuenta. |
| **Mesa 02 pide dos Hawaianas y una hamburguesa, y luego agrega otra porción.** | Caja recibe las pizzas y la tablet recibe la hamburguesa. El agregado llega una vez. Se cobra una sola cuenta al final. |
| **Mostrador vende cuatro Hawaianas y Caja confirma dos veces.** | Un pago, una comanda de cuatro porciones y una sola reducción de disponibilidad. |
| **Cocina retira carne y Producción queda en siete porciones de hamburguesa.** | Producción recibe automáticamente **Preparar carne de hamburguesa**. Administración lo ve en tiempo real. |
| **La administradora cambia el mínimo de 7 a 10 cuando quedan 8.** | La app reevalúa el saldo y crea la alerta y la tarea para el área configurada. |
| **Un trabajador lleva dos tareas listas de cuatro y recibe una automática.** | Su gráfica y Administración pasan de **2 de 4 · 50 %** a **2 de 5 · 40 %**. |
| **Armado registra media rueda y dos personales.** | Se suman cuatro porciones y dos personales en saldos distintos. Se descuentan las bases realmente usadas. |
| **Se piden 2 L de citronela y llega 1 L.** | El saldo sube 1 L y el otro litro queda pendiente. |
| **Administración crea una tercera sede.** | La puede configurar y asignar a usuarios, con mesas, estaciones, saldos y reglas propios. |
| **Caja intenta editar un precio o ajustar stock.** | El servidor rechaza el cambio. Una usuaria autorizada de Administración puede hacerlo y deja historial. |

Entrega la aplicación con **migraciones, datos de ejemplo, cuentas de prueba por rol e instrucciones para probarla** desde celular, tablet y computador. Demuestra los flujos entre dispositivos y especifica qué funciones están operativas y qué servicios externos requieren configuración.

Lo más importante para el dueño: que en Caja se vea **solo el botón de la mesa que debe**, que al quedar **siete carnes** la tarea llegue **sola al área correcta**, y que pueda **cambiar ese mínimo y crear una nueva sede** desde su panel.
