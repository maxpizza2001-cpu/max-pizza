-- Max Pizza · 001 · Esquema base
-- Cantidades: líquidos en ml, pesos en g, conteos en su unidad. numeric admite fracciones (media torta).
-- Dinero: numeric(14,2) (precisión exacta).

-- gen_random_uuid() viene incluido en PostgreSQL 13+

-- ───────────── Organización ─────────────
create table sedes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  activa      boolean not null default true,
  creada_en   timestamptz not null default now()
);

create table roles (
  codigo  text primary key,             -- admin, caja, mesero, rapidas, armado, tortas, insumos
  nombre  text not null,
  orden   int not null default 0
);

create table permisos (
  rol      text not null references roles(codigo),
  permiso  text not null,
  primary key (rol, permiso)
);

create table perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  correo     text not null,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table accesos_sede (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfiles(id) on delete cascade,
  sede_id    uuid not null references sedes(id),
  rol        text not null references roles(codigo),
  unique (perfil_id, sede_id, rol)
);
create index on accesos_sede (sede_id, rol);

create table turnos (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfiles(id),
  sede_id    uuid not null references sedes(id),
  rol        text not null references roles(codigo),
  inicio     timestamptz not null default now(),
  fin        timestamptz
);
create unique index turnos_uno_abierto on turnos (perfil_id) where fin is null;
create index on turnos (sede_id, inicio desc);

-- ───────────── Estaciones, mesas ─────────────
create table estaciones (
  id       uuid primary key default gen_random_uuid(),
  sede_id  uuid not null references sedes(id),
  codigo   text not null,                 -- horno (pizzas, vive en Caja) · rapidas (tablet)
  nombre   text not null,
  activa   boolean not null default true,
  unique (sede_id, codigo)
);

create table mesas (
  id       uuid primary key default gen_random_uuid(),
  sede_id  uuid not null references sedes(id),
  numero   int not null check (numero > 0),
  activa   boolean not null default true,
  unique (sede_id, numero)
);

-- ───────────── Catálogo, insumos, recetas ─────────────
create table unidades (
  codigo  text primary key,   -- ml, g, und, porcion, torta
  nombre  text not null
);

create table categorias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  tipo    text not null check (tipo in ('pizza','rapida','bebida')),
  orden   int not null default 0
);

-- Ítems que tienen existencia (ingredientes, bases, porciones armadas, aseo, empaques...)
create table insumos (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  unidad     text not null references unidades(codigo),
  categoria  text not null check (categoria in ('ingredientes','produccion','porciones','aseo','empaques','bebidas','masa')),
  activo     boolean not null default true
);

create table productos (
  id              uuid primary key default gen_random_uuid(),
  categoria_id    uuid not null references categorias(id),
  nombre          text not null,
  foto_url        text,
  formato         text not null check (formato in ('porcion','personal','unidad')),
  estacion        text not null check (estacion in ('horno','rapidas','ninguna')),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  unique (categoria_id, nombre)
);

create table productos_sede (
  producto_id  uuid not null references productos(id),
  sede_id      uuid not null references sedes(id),
  precio       numeric(14,2) not null check (precio >= 0),
  disponible   boolean not null default true,
  primary key (producto_id, sede_id)
);

create table precios_historial (
  id           bigint generated always as identity primary key,
  producto_id  uuid not null references productos(id),
  sede_id      uuid not null references sedes(id),
  precio_ant   numeric(14,2),
  precio_nuevo numeric(14,2) not null,
  perfil_id    uuid references perfiles(id),
  creado_en    timestamptz not null default now()
);

create table recetas (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos(id),
  version      int not null,
  vigente      boolean not null default true,
  creada_en    timestamptz not null default now(),
  unique (producto_id, version)
);
create unique index recetas_una_vigente on recetas (producto_id) where vigente;

create table receta_detalles (
  id         uuid primary key default gen_random_uuid(),
  receta_id  uuid not null references recetas(id) on delete cascade,
  insumo_id  uuid not null references insumos(id),
  cantidad   numeric(14,3) not null check (cantidad > 0),
  ubicacion  text not null,      -- código de ubicación de donde sale (armado, nevera_rapidas, servicio...)
  unique (receta_id, insumo_id)
);

-- ───────────── Inventario ─────────────
create table ubicaciones_stock (
  id       uuid primary key default gen_random_uuid(),
  sede_id  uuid not null references sedes(id),
  codigo   text not null,   -- produccion, tortas, armado, nevera_rapidas, servicio, bodega
  nombre   text not null,
  activa   boolean not null default true,
  unique (sede_id, codigo)
);

create table saldos_stock (
  ubicacion_id  uuid not null references ubicaciones_stock(id),
  insumo_id     uuid not null references insumos(id),
  sede_id       uuid not null references sedes(id),
  fisico        numeric(14,3) not null default 0,
  reservado     numeric(14,3) not null default 0 check (reservado >= 0),
  actualizado   timestamptz not null default now(),
  primary key (ubicacion_id, insumo_id)
);
create index on saldos_stock (sede_id);

create table movimientos_stock (
  id            bigint generated always as identity primary key,
  sede_id       uuid not null references sedes(id),
  insumo_id     uuid not null references insumos(id),
  ubicacion_id  uuid not null references ubicaciones_stock(id),
  cantidad      numeric(14,3) not null,         -- + entra, − sale (físico)
  tipo          text not null check (tipo in ('produccion','consumo','traslado_salida','traslado_entrada','venta','merma','ajuste','recepcion','armado','reserva','liberacion')),
  motivo        text,
  ref_tipo      text,
  ref_id        text,
  receta_id     uuid references recetas(id),
  saldo_ant     numeric(14,3),
  saldo_nuevo   numeric(14,3),
  perfil_id     uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);
create index on movimientos_stock (sede_id, creado_en desc);
create index on movimientos_stock (ubicacion_id, insumo_id, creado_en desc);

-- ───────────── Mesas, cuentas, pedidos ─────────────
create table cuentas (
  id           uuid primary key default gen_random_uuid(),
  sede_id      uuid not null references sedes(id),
  mesa_id      uuid references mesas(id),
  tipo         text not null check (tipo in ('mesa','mostrador','llevar')),
  estado       text not null default 'abierta' check (estado in ('abierta','pagada','cerrada','anulada')),
  total        numeric(14,2) not null default 0,
  pagado       numeric(14,2) not null default 0,
  abierta_por  uuid references perfiles(id),
  abierta_en   timestamptz not null default now(),
  pagada_en    timestamptz,
  liberada_en  timestamptz,
  check (tipo <> 'mesa' or mesa_id is not null)
);
-- Una sola cuenta activa por mesa (abierta o pagada sin liberar)
create unique index cuentas_una_activa_por_mesa on cuentas (mesa_id) where estado in ('abierta','pagada');
create index on cuentas (sede_id, estado);

create table pedidos (
  id            uuid primary key default gen_random_uuid(),
  sede_id       uuid not null references sedes(id),
  cuenta_id     uuid not null references cuentas(id),
  numero        int not null,
  operacion_id  uuid not null unique,
  enviado_por   uuid references perfiles(id),
  enviado_en    timestamptz not null default now(),
  unique (sede_id, numero)
);

create table lineas_pedido (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references pedidos(id),
  cuenta_id    uuid not null references cuentas(id),
  producto_id  uuid not null references productos(id),
  receta_id    uuid references recetas(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  precio_unit  numeric(14,2) not null,        -- precio vendido (se conserva aunque cambie el catálogo)
  observacion  text,
  estado       text not null default 'activa' check (estado in ('activa','cancelada')),
  entregada    boolean not null default false,
  entregada_en timestamptz
);
create index on lineas_pedido (cuenta_id);

create table reservas_stock (
  id               uuid primary key default gen_random_uuid(),
  linea_pedido_id  uuid not null references lineas_pedido(id),
  ubicacion_id     uuid not null references ubicaciones_stock(id),
  insumo_id        uuid not null references insumos(id),
  cantidad         numeric(14,3) not null,
  estado           text not null default 'activa' check (estado in ('activa','consumida','liberada')),
  creada_en        timestamptz not null default now()
);
create index on reservas_stock (linea_pedido_id);

-- ───────────── Comandas ─────────────
create table comandas (
  id          uuid primary key default gen_random_uuid(),
  sede_id     uuid not null references sedes(id),
  pedido_id   uuid not null references pedidos(id),
  estacion_id uuid not null references estaciones(id),
  estado      text not null default 'nueva' check (estado in ('nueva','en_preparacion','lista','entregada','cancelada')),
  creada_en   timestamptz not null default now(),
  empezada_en timestamptz,
  lista_en    timestamptz,
  unique (pedido_id, estacion_id)
);
create index on comandas (sede_id, estado);

create table lineas_comanda (
  id               uuid primary key default gen_random_uuid(),
  comanda_id       uuid not null references comandas(id),
  linea_pedido_id  uuid not null references lineas_pedido(id) unique,
  cancelada        boolean not null default false
);

create table historial_estados (
  id              bigint generated always as identity primary key,
  entidad         text not null,
  entidad_id      uuid not null,
  estado_ant      text,
  estado_nuevo    text not null,
  perfil_id       uuid references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index on historial_estados (entidad, entidad_id);

-- ───────────── Caja ─────────────
create table turnos_caja (
  id          uuid primary key default gen_random_uuid(),
  sede_id     uuid not null references sedes(id),
  perfil_id   uuid not null references perfiles(id),
  base        numeric(14,2) not null check (base >= 0),
  abierto_en  timestamptz not null default now(),
  cerrado_en  timestamptz
);
create unique index turnos_caja_uno_abierto on turnos_caja (sede_id) where cerrado_en is null;

create table pagos (
  id             uuid primary key default gen_random_uuid(),
  sede_id        uuid not null references sedes(id),
  cuenta_id      uuid not null references cuentas(id),
  turno_caja_id  uuid references turnos_caja(id),
  monto          numeric(14,2) not null check (monto > 0),
  medio          text not null check (medio in ('efectivo','nequi','daviplata','tarjeta','transferencia')),
  operacion_id   uuid not null unique,
  perfil_id      uuid references perfiles(id),
  creado_en      timestamptz not null default now()
);
create index on pagos (sede_id, creado_en desc);

create table gastos_caja (
  id             uuid primary key default gen_random_uuid(),
  sede_id        uuid not null references sedes(id),
  turno_caja_id  uuid references turnos_caja(id),
  categoria      text not null,
  concepto       text not null,
  valor          numeric(14,2) not null check (valor > 0),
  responsable    text,
  medio          text not null,
  operacion_id   uuid not null unique,
  perfil_id      uuid references perfiles(id),
  creado_en      timestamptz not null default now()
);

create table movimientos_caja (
  id             bigint generated always as identity primary key,
  turno_caja_id  uuid not null references turnos_caja(id),
  tipo           text not null check (tipo in ('base','pago','gasto')),
  medio          text not null,
  monto          numeric(14,2) not null,       -- + entra, − sale
  ref_id         uuid,
  creado_en      timestamptz not null default now()
);

-- ───────────── Producción ─────────────
create table lotes_produccion (
  id            uuid primary key default gen_random_uuid(),
  sede_id       uuid not null references sedes(id),
  tipo          text not null check (tipo in ('monjes','tortas','rueda','personales','insumo','portapizzas')),
  insumo_id     uuid references insumos(id),     -- resultado principal
  cantidad      numeric(14,3) not null,
  notas         text,
  tarea_id      uuid,
  operacion_id  uuid not null unique,
  perfil_id     uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);
create index on lotes_produccion (sede_id, creado_en desc);

create table detalle_lote (
  id         uuid primary key default gen_random_uuid(),
  lote_id    uuid not null references lotes_produccion(id) on delete cascade,
  insumo_id  uuid not null references insumos(id),
  cantidad   numeric(14,3) not null,
  papel      text not null check (papel in ('usado','producido'))
);

-- ───────────── Checklists y alertas ─────────────
create table categorias_tareas (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique
);

create table plantillas_checklist (
  id            uuid primary key default gen_random_uuid(),
  sede_id       uuid references sedes(id),          -- null = todas
  rol           text not null references roles(codigo),
  categoria_id  uuid references categorias_tareas(id),
  titulo        text not null,
  prioridad     text not null default 'media' check (prioridad in ('alta','media','baja')),
  accion        text,
  orden         int not null default 0,
  activa        boolean not null default true
);

create table reglas_stock (
  id              uuid primary key default gen_random_uuid(),
  sede_id         uuid not null references sedes(id),
  ubicacion_id    uuid not null references ubicaciones_stock(id),
  insumo_id       uuid not null references insumos(id),
  minimo          numeric(14,3) not null check (minimo >= 0),
  rol_destino     text not null references roles(codigo),
  responsable_id  uuid references perfiles(id),
  prioridad       text not null default 'alta' check (prioridad in ('alta','media','baja')),
  texto           text not null,
  accion          text,              -- ej. 'produccion:<insumo>', 'subir_nevera:<insumo>', 'rueda:<insumo>'
  activa          boolean not null default true,
  creada_en       timestamptz not null default now(),
  unique (ubicacion_id, insumo_id, rol_destino)
);
create index on reglas_stock (ubicacion_id, insumo_id) where activa;

create table alertas_stock (
  id           uuid primary key default gen_random_uuid(),
  regla_id     uuid not null references reglas_stock(id),
  sede_id      uuid not null references sedes(id),
  estado       text not null default 'activa' check (estado in ('activa','cerrada')),
  saldo        numeric(14,3) not null,
  abierta_en   timestamptz not null default now(),
  actualizada  timestamptz not null default now(),
  cerrada_en   timestamptz
);
create unique index alertas_una_activa on alertas_stock (regla_id) where estado = 'activa';

create table tareas (
  id             uuid primary key default gen_random_uuid(),
  sede_id        uuid not null references sedes(id),
  rol            text not null references roles(codigo),
  asignada_a     uuid references perfiles(id),        -- null = compartida por el área
  categoria_id   uuid references categorias_tareas(id),
  titulo         text not null,
  detalle        text,
  prioridad      text not null default 'media' check (prioridad in ('alta','media','baja')),
  estado         text not null default 'pendiente' check (estado in ('pendiente','en_proceso','lista','archivada')),
  origen         text not null default 'manual' check (origen in ('manual','automatica','plantilla')),
  accion         text,
  regla_id       uuid references reglas_stock(id),
  alerta_id      uuid references alertas_stock(id),
  plantilla_id   uuid references plantillas_checklist(id),
  fecha          date not null default (now() at time zone 'America/Bogota')::date,
  orden          int not null default 0,
  creada_por     uuid references perfiles(id),
  creada_en      timestamptz not null default now(),
  tomada_por     uuid references perfiles(id),
  tomada_en      timestamptz,
  terminada_por  uuid references perfiles(id),
  terminada_en   timestamptz
);
-- Una sola reposición pendiente por regla
create unique index tareas_una_por_regla on tareas (regla_id) where regla_id is not null and estado in ('pendiente','en_proceso');
create unique index tareas_plantilla_dia on tareas (plantilla_id, fecha) where plantilla_id is not null;
create index on tareas (sede_id, rol, estado);

create table historial_tareas (
  id          bigint generated always as identity primary key,
  tarea_id    uuid not null references tareas(id) on delete cascade,
  evento      text not null,          -- creada, actualizada, empezada, lista, archivada, reasignada
  detalle     text,
  perfil_id   uuid references perfiles(id),
  creado_en   timestamptz not null default now()
);

create table notificaciones (
  id          uuid primary key default gen_random_uuid(),
  sede_id     uuid references sedes(id),
  rol         text references roles(codigo),
  perfil_id   uuid references perfiles(id),
  tipo        text not null,
  titulo      text not null,
  cuerpo      text,
  ref_id      uuid,
  leida       boolean not null default false,
  creada_en   timestamptz not null default now()
);
create index on notificaciones (sede_id, rol, creada_en desc);

-- Reportes del personal (Queda poco / Se acabó / Conteo)
create table reportes_stock (
  id            uuid primary key default gen_random_uuid(),
  sede_id       uuid not null references sedes(id),
  ubicacion_id  uuid not null references ubicaciones_stock(id),
  insumo_id     uuid not null references insumos(id),
  tipo          text not null check (tipo in ('queda_poco','se_acabo','conteo')),
  conteo        numeric(14,3),
  saldo_sistema numeric(14,3),
  estado        text not null default 'nuevo' check (estado in ('nuevo','revisado','corregido')),
  perfil_id     uuid references perfiles(id),
  creado_en     timestamptz not null default now(),
  revisado_por  uuid references perfiles(id),
  revisado_en   timestamptz
);

-- ───────────── Compras ─────────────
create table proveedores (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  whatsapp     text,
  dias_entrega text,
  condiciones  text,
  activo       boolean not null default true
);

create table proveedor_insumos (
  proveedor_id  uuid not null references proveedores(id),
  insumo_id     uuid not null references insumos(id),
  precio        numeric(14,2),
  actualizado   timestamptz not null default now(),
  primary key (proveedor_id, insumo_id)
);

create table proveedor_precios_historial (
  id            bigint generated always as identity primary key,
  proveedor_id  uuid not null references proveedores(id),
  insumo_id     uuid not null references insumos(id),
  precio        numeric(14,2) not null,
  creado_en     timestamptz not null default now()
);

create table ordenes_compra (
  id            uuid primary key default gen_random_uuid(),
  sede_id       uuid not null references sedes(id),
  proveedor_id  uuid references proveedores(id),
  estado        text not null default 'por_comprar' check (estado in ('por_comprar','en_camino','parcial','recibido','anulada')),
  creada_por    uuid references perfiles(id),
  creada_en     timestamptz not null default now(),
  pedida_en     timestamptz
);

create table lineas_compra (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references ordenes_compra(id) on delete cascade,
  insumo_id     uuid not null references insumos(id),
  ubicacion_id  uuid not null references ubicaciones_stock(id),
  cantidad      numeric(14,3) not null check (cantidad > 0),
  recibido      numeric(14,3) not null default 0,
  precio        numeric(14,2)
);

create table recepciones (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references ordenes_compra(id),
  operacion_id  uuid not null unique,
  perfil_id     uuid references perfiles(id),
  creada_en     timestamptz not null default now()
);

create table lineas_recepcion (
  id              uuid primary key default gen_random_uuid(),
  recepcion_id    uuid not null references recepciones(id) on delete cascade,
  linea_compra_id uuid not null references lineas_compra(id),
  cantidad        numeric(14,3) not null check (cantidad > 0)
);

-- ───────────── Auditoría e idempotencia ─────────────
create table historial_auditoria (
  id          bigint generated always as identity primary key,
  sede_id     uuid references sedes(id),
  perfil_id   uuid references perfiles(id),
  accion      text not null,
  tabla       text,
  registro_id text,
  antes       jsonb,
  despues     jsonb,
  creado_en   timestamptz not null default now()
);
create index on historial_auditoria (sede_id, creado_en desc);

-- Registro de operaciones ya hechas: un mismo operacion_id devuelve el mismo resultado.
create table operaciones (
  id         uuid primary key,
  tipo       text not null,
  resultado  jsonb,
  perfil_id  uuid,
  creada_en  timestamptz not null default now()
);
