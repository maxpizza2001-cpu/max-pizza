-- MAX PIZZA · base de datos completa (pegar TODO en Supabase → SQL Editor → Run). Generado de supabase/migrations/

-- ===== supabase/migrations/20261123000001_esquema.sql =====
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

-- ===== supabase/migrations/20261123000002_funciones.sql =====
-- Max Pizza · 002 · Lógica del negocio en el servidor
-- Todas las operaciones que mueven plata, stock o tareas van por estas funciones (transacción única).
-- Las que pueden repetirse por doble toque reciben un operacion_id: si ya se hizo, devuelven el mismo resultado.

-- ───────────── Ayudantes de permisos ─────────────
create or replace function yo() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.rol = 'admin' and p.activo
  )
$$;

create or replace function tiene_rol(p_sede uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.sede_id = p_sede and a.rol = any(p_roles) and p.activo
  )
$$;

create or replace function puede_ver_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.sede_id = p_sede and p.activo
  )
$$;

create or replace function exigir(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception '%', p_msg using errcode = 'P0001'; end if;
end $$;

create or replace function exigir_rol(p_sede uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(auth.uid() is not null, 'Debes iniciar sesión');
  perform exigir(tiene_rol(p_sede, p_roles), 'No tienes permiso para esta operación en esta sede');
end $$;

create or replace function auditar(p_sede uuid, p_accion text, p_tabla text, p_id text, p_antes jsonb, p_despues jsonb)
returns void language sql security definer set search_path = public as $$
  insert into historial_auditoria (sede_id, perfil_id, accion, tabla, registro_id, antes, despues)
  values (p_sede, auth.uid(), p_accion, p_tabla, p_id, p_antes, p_despues)
$$;

-- ───────────── Idempotencia ─────────────
-- Devuelve el resultado anterior si la operación ya existe; null si es nueva (y la reserva).
-- Si dos llamadas llegan a la vez, la segunda espera a que la primera termine.
create or replace function op_iniciar(p_op uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform exigir(p_op is not null, 'Falta el identificador de la operación');
  insert into operaciones (id, tipo, perfil_id) values (p_op, p_tipo, auth.uid())
  on conflict (id) do nothing;
  if found then return null; end if;
  select resultado into v from operaciones where id = p_op;
  return coalesce(v, '{}'::jsonb) || jsonb_build_object('repetida', true);
end $$;

create or replace function op_terminar(p_op uuid, p_res jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update operaciones set resultado = p_res where id = p_op;
  select p_res;
$$;

-- ───────────── Utilidades ─────────────
create or replace function hoy_co() returns date language sql stable as $$
  select (now() at time zone 'America/Bogota')::date
$$;

create or replace function ubicacion_id(p_sede uuid, p_codigo text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from ubicaciones_stock where sede_id = p_sede and codigo = p_codigo;
  perform exigir(v is not null, format('La sede no tiene la ubicación "%s"', p_codigo));
  return v;
end $$;

create or replace function fmt_cant(p numeric) returns text language sql immutable as $$
  select case when p = trunc(p) then trunc(p)::text else rtrim(rtrim(p::text, '0'), '.') end
$$;

create or replace function notificar(p_sede uuid, p_rol text, p_perfil uuid, p_tipo text, p_titulo text, p_cuerpo text, p_ref uuid)
returns void language sql security definer set search_path = public as $$
  insert into notificaciones (sede_id, rol, perfil_id, tipo, titulo, cuerpo, ref_id)
  values (p_sede, p_rol, p_perfil, p_tipo, p_titulo, p_cuerpo, p_ref)
$$;

-- ───────────── Reglas de stock bajo → alertas y tareas automáticas ─────────────
create or replace function evaluar_regla(p_regla uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r reglas_stock;
  v_saldo numeric;
  v_unidad text;
  v_insumo text;
  a alertas_stock;
  t tareas;
  v_detalle text;
begin
  select * into r from reglas_stock where id = p_regla;
  if not found then return; end if;

  select coalesce(s.fisico - s.reservado, 0) into v_saldo
    from saldos_stock s where s.ubicacion_id = r.ubicacion_id and s.insumo_id = r.insumo_id;
  v_saldo := coalesce(v_saldo, 0);
  select i.unidad, i.nombre into v_unidad, v_insumo from insumos i where i.id = r.insumo_id;
  v_detalle := format('Quedan %s %s · mínimo %s', fmt_cant(v_saldo), v_unidad, fmt_cant(r.minimo));

  select * into a from alertas_stock where regla_id = r.id and estado = 'activa' for update;
  select * into t from tareas where regla_id = r.id and estado in ('pendiente','en_proceso') for update;

  if r.activa and v_saldo <= r.minimo then
    -- Alerta: una sola activa; si el saldo sigue bajando se actualiza la misma
    if a.id is null then
      insert into alertas_stock (regla_id, sede_id, saldo) values (r.id, r.sede_id, v_saldo) returning * into a;
      perform notificar(r.sede_id, 'admin', null, 'stock_bajo', 'Stock bajo · ' || v_insumo, v_detalle, a.id);
      perform notificar(r.sede_id, r.rol_destino, r.responsable_id, 'tarea', r.texto, v_detalle, a.id);
    else
      update alertas_stock set saldo = v_saldo, actualizada = now() where id = a.id;
    end if;
    -- Tarea: un solo pendiente de reposición por regla
    if t.id is null then
      insert into tareas (sede_id, rol, asignada_a, titulo, detalle, prioridad, origen, accion, regla_id, alerta_id)
      values (r.sede_id, r.rol_destino, r.responsable_id, r.texto, v_detalle, r.prioridad, 'automatica', r.accion, r.id, a.id)
      returning * into t;
      insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'creada', v_detalle, auth.uid());
    else
      update tareas set detalle = v_detalle, alerta_id = a.id, prioridad = r.prioridad, titulo = r.texto,
        rol = case when estado = 'pendiente' then r.rol_destino else rol end,
        asignada_a = case when estado = 'pendiente' then r.responsable_id else asignada_a end
      where id = t.id;
    end if;
  else
    -- Repuesto (o regla pausada): se cierra la alerta
    if a.id is not null then
      update alertas_stock set estado = 'cerrada', saldo = v_saldo, cerrada_en = now(), actualizada = now() where id = a.id;
    end if;
    -- Una tarea aún pendiente se cierra: si quien repuso es del área, cuenta como lista; si no, se archiva.
    -- Una tarea en proceso la termina quien la tomó (no se pisa lo que el equipo está haciendo).
    if t.id is not null and t.estado = 'pendiente' then
      if auth.uid() is not null and exists (
           select 1 from accesos_sede x where x.perfil_id = auth.uid() and x.sede_id = r.sede_id and x.rol = t.rol) then
        update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(), detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'lista', 'Stock repuesto', auth.uid());
      else
        update tareas set estado = 'archivada', detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'archivada', 'Stock repuesto', auth.uid());
      end if;
    end if;
  end if;
end $$;

create or replace function evaluar_reglas(p_ubic uuid, p_insumo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  for v in select id from reglas_stock where ubicacion_id = p_ubic and insumo_id = p_insumo loop
    perform evaluar_regla(v);
  end loop;
end $$;

-- Si Administración cambia mínimo, responsable o pausa la regla, se reevalúa de una vez.
create or replace function trg_regla_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform evaluar_regla(new.id);
  return new;
end $$;
create trigger reglas_stock_reevaluar after insert or update on reglas_stock
  for each row execute function trg_regla_cambio();

-- ───────────── Movimientos de stock ─────────────
create or replace function stock_fila(p_ubic uuid, p_insumo uuid) returns saldos_stock
language plpgsql security definer set search_path = public as $$
declare s saldos_stock;
begin
  insert into saldos_stock (ubicacion_id, insumo_id, sede_id)
  select p_ubic, p_insumo, u.sede_id from ubicaciones_stock u where u.id = p_ubic
  on conflict do nothing;
  select * into s from saldos_stock where ubicacion_id = p_ubic and insumo_id = p_insumo for update;
  return s;
end $$;

-- Cambia la existencia física y deja el movimiento. p_cant positiva entra, negativa sale.
create or replace function stock_mover(
  p_ubic uuid, p_insumo uuid, p_cant numeric, p_tipo text, p_motivo text,
  p_ref_tipo text, p_ref_id text, p_receta uuid default null, p_evaluar boolean default true
) returns numeric
language plpgsql security definer set search_path = public as $$
declare s saldos_stock; v_nuevo numeric;
begin
  if p_cant = 0 then return null; end if;
  s := stock_fila(p_ubic, p_insumo);
  v_nuevo := s.fisico + p_cant;
  update saldos_stock set fisico = v_nuevo, actualizado = now() where ubicacion_id = p_ubic and insumo_id = p_insumo;
  insert into movimientos_stock (sede_id, insumo_id, ubicacion_id, cantidad, tipo, motivo, ref_tipo, ref_id, receta_id, saldo_ant, saldo_nuevo, perfil_id)
  values (s.sede_id, p_insumo, p_ubic, p_cant, p_tipo, p_motivo, p_ref_tipo, p_ref_id, p_receta, s.fisico, v_nuevo, auth.uid());
  if p_evaluar then perform evaluar_reglas(p_ubic, p_insumo); end if;
  return v_nuevo;
end $$;

create or replace function stock_disponible(p_ubic uuid, p_insumo uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select fisico - reservado from saldos_stock where ubicacion_id = p_ubic and insumo_id = p_insumo), 0)
$$;

create or replace function exigir_disponible(p_ubic uuid, p_insumo uuid, p_cant numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric; n text; u text;
begin
  v := stock_disponible(p_ubic, p_insumo);
  if v < p_cant then
    select nombre, unidad into n, u from insumos where id = p_insumo;
    raise exception 'No alcanza: % · disponibles % %, pediste %', n, fmt_cant(greatest(v,0)), u, fmt_cant(p_cant) using errcode = 'P0001';
  end if;
end $$;

-- ───────────── Turnos y checklists ─────────────
create or replace function generar_tareas_plantilla(p_sede uuid, p_rol text) returns void
language sql security definer set search_path = public as $$
  insert into tareas (sede_id, rol, categoria_id, titulo, prioridad, origen, accion, plantilla_id, fecha, orden)
  select p_sede, p.rol, p.categoria_id, p.titulo, p.prioridad, 'plantilla', p.accion, p.id, hoy_co(), p.orden
  from plantillas_checklist p
  where p.activa and p.rol = p_rol and (p.sede_id is null or p.sede_id = p_sede)
  on conflict do nothing
$$;

create or replace function iniciar_turno(p_sede uuid, p_rol text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform exigir(auth.uid() is not null, 'Debes iniciar sesión');
  perform exigir(exists (select 1 from accesos_sede where perfil_id = auth.uid() and sede_id = p_sede and rol = p_rol)
                 or (es_admin() and p_rol = 'admin'), 'No tienes ese rol en esta sede');
  select id into v from turnos where perfil_id = auth.uid() and fin is null;
  if v is not null then return v; end if;   -- ya estaba en turno (doble toque)
  insert into turnos (perfil_id, sede_id, rol) values (auth.uid(), p_sede, p_rol) returning id into v;
  perform generar_tareas_plantilla(p_sede, p_rol);
  return v;
end $$;

create or replace function finalizar_turno() returns void
language plpgsql security definer set search_path = public as $$
begin
  update turnos set fin = now() where perfil_id = auth.uid() and fin is null;
end $$;

-- Tareas vigentes de un área: pendientes/en proceso de cualquier día + las listas de hoy.
create or replace function tareas_vigentes(p_sede uuid, p_rol text, p_perfil uuid default null)
returns setof tareas language sql stable security definer set search_path = public as $$
  select * from tareas t
  where t.sede_id = p_sede and t.rol = p_rol
    and (t.asignada_a is null or p_perfil is null or t.asignada_a = p_perfil)
    and (t.estado in ('pendiente','en_proceso') or (t.estado = 'lista' and (t.terminada_en at time zone 'America/Bogota')::date = hoy_co()))
$$;

create or replace function progreso_tareas(p_sede uuid, p_rol text, p_perfil uuid default null)
returns table (listas int, total int, porcentaje int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where estado = 'lista')::int,
         count(*)::int,
         case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where estado = 'lista') / count(*))::int end
  from tareas_vigentes(p_sede, p_rol, p_perfil)
$$;

create or replace function tarea_empezar(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir(found, 'La tarea no existe');
  perform exigir_rol(t.sede_id, array[t.rol]);
  if t.estado <> 'pendiente' then return; end if;
  update tareas set estado = 'en_proceso', tomada_por = auth.uid(), tomada_en = now() where id = p_tarea;
  insert into historial_tareas (tarea_id, evento, perfil_id) values (p_tarea, 'empezada', auth.uid());
end $$;

create or replace function tarea_completar(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir(found, 'La tarea no existe');
  perform exigir_rol(t.sede_id, array[t.rol]);
  if t.estado in ('lista','archivada') then return; end if;
  update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(),
    tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now())
  where id = p_tarea;
  insert into historial_tareas (tarea_id, evento, perfil_id) values (p_tarea, 'lista', auth.uid());
end $$;

create or replace function tarea_reabrir(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir_rol(t.sede_id, array[t.rol]);
  update tareas set estado = 'pendiente', terminada_por = null, terminada_en = null where id = p_tarea and estado = 'lista';
  insert into historial_tareas (tarea_id, evento, perfil_id) values (p_tarea, 'reabierta', auth.uid());
end $$;

-- Completa las tareas del área vinculadas a una acción (ej. 'registrar_base').
create or replace function completar_tareas_accion(p_sede uuid, p_accion text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  for v in select id from tareas where sede_id = p_sede and accion = p_accion and estado in ('pendiente','en_proceso') loop
    update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(),
      tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()) where id = v;
    insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (v, 'lista', 'Hecha desde ' || p_accion, auth.uid());
  end loop;
end $$;

-- Administración: crear y editar tareas del equipo
create or replace function tarea_crear(p_sede uuid, p_rol text, p_titulo text, p_prioridad text default 'media',
  p_asignada uuid default null, p_detalle text default null, p_accion text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform exigir(es_admin(), 'Solo Administración crea tareas para el equipo');
  insert into tareas (sede_id, rol, asignada_a, titulo, detalle, prioridad, origen, accion, creada_por)
  values (p_sede, p_rol, p_asignada, p_titulo, p_detalle, p_prioridad, 'manual', p_accion, auth.uid()) returning id into v;
  insert into historial_tareas (tarea_id, evento, perfil_id) values (v, 'creada', auth.uid());
  return v;
end $$;

create or replace function tarea_editar(p_tarea uuid, p_cambios jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración edita las tareas del equipo');
  update tareas set
    titulo     = coalesce(p_cambios->>'titulo', titulo),
    detalle    = case when p_cambios ? 'detalle' then p_cambios->>'detalle' else detalle end,
    prioridad  = coalesce(p_cambios->>'prioridad', prioridad),
    rol        = coalesce(p_cambios->>'rol', rol),
    asignada_a = case when p_cambios ? 'asignada_a' then (p_cambios->>'asignada_a')::uuid else asignada_a end,
    orden      = coalesce((p_cambios->>'orden')::int, orden),
    estado     = coalesce(p_cambios->>'estado', estado)
  where id = p_tarea;
  insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (p_tarea, 'editada', p_cambios::text, auth.uid());
end $$;

-- ───────────── Pedidos ─────────────
create or replace function siguiente_numero_pedido(p_sede uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform 1 from sedes where id = p_sede for update;   -- numeración en orden aunque lleguen dos a la vez
  select coalesce(max(numero), 0) + 1 into v from pedidos where sede_id = p_sede;
  return v;
end $$;

-- Crea un envío (pedido) con sus líneas, reservas y comandas. Uso interno.
create or replace function crear_envio(p_op uuid, p_cuenta uuid, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c cuentas;
  v_pedido uuid; v_num int;
  l jsonb; p productos; v_precio numeric; v_receta uuid; v_linea uuid; v_cant numeric;
  d record; v_ubic uuid; v_est uuid; v_comanda uuid;
  v_total numeric := 0;
  v_comandas jsonb := '[]'::jsonb;
begin
  select * into c from cuentas where id = p_cuenta for update;
  perform exigir(jsonb_array_length(coalesce(p_lineas,'[]'::jsonb)) > 0, 'El pedido está vacío');
  v_num := siguiente_numero_pedido(c.sede_id);
  insert into pedidos (sede_id, cuenta_id, numero, operacion_id, enviado_por)
  values (c.sede_id, c.id, v_num, p_op, auth.uid()) returning id into v_pedido;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (l->>'cantidad')::numeric;
    perform exigir(v_cant > 0, 'Cantidad inválida');
    select * into p from productos where id = (l->>'producto_id')::uuid and activo;
    perform exigir(found, 'Producto no disponible');
    select precio into v_precio from productos_sede where producto_id = p.id and sede_id = c.sede_id and disponible;
    perform exigir(v_precio is not null, format('%s no está disponible en esta sede', p.nombre));
    select id into v_receta from recetas where producto_id = p.id and vigente;

    insert into lineas_pedido (pedido_id, cuenta_id, producto_id, receta_id, cantidad, precio_unit, observacion)
    values (v_pedido, c.id, p.id, v_receta, v_cant, v_precio, nullif(trim(l->>'observacion'), ''))
    returning id into v_linea;
    v_total := v_total + v_cant * v_precio;

    -- Inventario según estación: horno = reserva porciones; ninguna (bebidas) = sale de una vez; rapidas = se consume al preparar
    if v_receta is not null and p.estacion <> 'rapidas' then
      for d in select * from receta_detalles where receta_id = v_receta loop
        v_ubic := ubicacion_id(c.sede_id, d.ubicacion);
        if p.estacion = 'horno' then
          perform exigir_disponible(v_ubic, d.insumo_id, d.cantidad * v_cant);
          perform stock_fila(v_ubic, d.insumo_id);
          update saldos_stock set reservado = reservado + d.cantidad * v_cant, actualizado = now()
            where ubicacion_id = v_ubic and insumo_id = d.insumo_id;
          insert into reservas_stock (linea_pedido_id, ubicacion_id, insumo_id, cantidad)
          values (v_linea, v_ubic, d.insumo_id, d.cantidad * v_cant);
          perform evaluar_reglas(v_ubic, d.insumo_id);
        else
          perform stock_mover(v_ubic, d.insumo_id, -(d.cantidad * v_cant), 'venta', p.nombre, 'linea_pedido', v_linea::text, v_receta);
        end if;
      end loop;
    end if;

    -- Comanda por estación (una por envío y estación); solo llega lo de este envío
    if p.estacion in ('horno','rapidas') then
      select id into v_est from estaciones where sede_id = c.sede_id and codigo = p.estacion and activa;
      perform exigir(v_est is not null, 'La sede no tiene la estación ' || p.estacion);
      select id into v_comanda from comandas where pedido_id = v_pedido and estacion_id = v_est;
      if v_comanda is null then
        insert into comandas (sede_id, pedido_id, estacion_id) values (c.sede_id, v_pedido, v_est) returning id into v_comanda;
        insert into historial_estados (entidad, entidad_id, estado_nuevo, perfil_id) values ('comanda', v_comanda, 'nueva', auth.uid());
        v_comandas := v_comandas || jsonb_build_object('id', v_comanda, 'estacion', p.estacion);
        perform notificar(c.sede_id, case when p.estacion = 'horno' then 'caja' else 'rapidas' end, null, 'comanda',
          'Nueva comanda · pedido ' || v_num, null, v_comanda);
      end if;
      insert into lineas_comanda (comanda_id, linea_pedido_id) values (v_comanda, v_linea);
    end if;
  end loop;

  update cuentas set total = total + v_total,
    estado = case when estado = 'pagada' then 'abierta' else estado end
  where id = c.id;

  return jsonb_build_object('cuenta_id', c.id, 'pedido_id', v_pedido, 'numero', v_num, 'total_envio', v_total, 'comandas', v_comandas);
end $$;

-- Mesero o Caja envían un pedido de mesa: se prepara ya, se cobra al final. Lo agregado va a la misma cuenta.
create or replace function enviar_pedido_mesa(p_op uuid, p_sede uuid, p_mesa int, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_mesa uuid; v_cuenta uuid; v_res jsonb;
begin
  perform exigir_rol(p_sede, array['mesero','caja']);
  v_prev := op_iniciar(p_op, 'enviar_pedido_mesa');
  if v_prev is not null then return v_prev; end if;

  select id into v_mesa from mesas where sede_id = p_sede and numero = p_mesa and activa;
  perform exigir(v_mesa is not null, format('La mesa %s no existe en esta sede', p_mesa));
  select id into v_cuenta from cuentas where mesa_id = v_mesa and estado in ('abierta','pagada') for update;
  if v_cuenta is null then
    insert into cuentas (sede_id, mesa_id, tipo, abierta_por) values (p_sede, v_mesa, 'mesa', auth.uid()) returning id into v_cuenta;
  end if;
  v_res := crear_envio(p_op, v_cuenta, p_lineas) || jsonb_build_object('mesa', p_mesa);
  return op_terminar(p_op, v_res);
end $$;

-- Mostrador / para llevar: se cobra primero. Un solo paso: venta + pago + reserva + comanda.
create or replace function cobrar_mostrador(p_op uuid, p_sede uuid, p_tipo text, p_lineas jsonb, p_medio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_cuenta uuid; v_res jsonb; v_total numeric; v_turno uuid; v_pago uuid;
begin
  perform exigir_rol(p_sede, array['caja']);
  perform exigir(p_tipo in ('mostrador','llevar'), 'Tipo de venta inválido');
  v_prev := op_iniciar(p_op, 'cobrar_mostrador');
  if v_prev is not null then return v_prev; end if;

  insert into cuentas (sede_id, tipo, abierta_por) values (p_sede, p_tipo, auth.uid()) returning id into v_cuenta;
  v_res := crear_envio(p_op, v_cuenta, p_lineas);
  select total into v_total from cuentas where id = v_cuenta;
  select id into v_turno from turnos_caja where sede_id = p_sede and cerrado_en is null;

  insert into pagos (sede_id, cuenta_id, turno_caja_id, monto, medio, operacion_id, perfil_id)
  values (p_sede, v_cuenta, v_turno, v_total, p_medio, p_op, auth.uid()) returning id into v_pago;
  if v_turno is not null then
    insert into movimientos_caja (turno_caja_id, tipo, medio, monto, ref_id) values (v_turno, 'pago', p_medio, v_total, v_pago);
  end if;
  update cuentas set pagado = v_total, estado = 'cerrada', pagada_en = now(), liberada_en = now() where id = v_cuenta;

  return op_terminar(p_op, v_res || jsonb_build_object('pago_id', v_pago, 'total', v_total));
end $$;

-- Caja cobra una cuenta de mesa (puede ser parcial). Al quedar en cero sale de "Por cobrar".
create or replace function confirmar_cobro(p_op uuid, p_cuenta uuid, p_monto numeric, p_medio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; c cuentas; v_turno uuid; v_pago uuid; v_saldo numeric;
begin
  select * into c from cuentas where id = p_cuenta;
  perform exigir(found, 'La cuenta no existe');
  perform exigir_rol(c.sede_id, array['caja']);
  v_prev := op_iniciar(p_op, 'confirmar_cobro');
  if v_prev is not null then return v_prev; end if;

  select * into c from cuentas where id = p_cuenta for update;
  v_saldo := c.total - c.pagado;
  perform exigir(c.estado = 'abierta' and v_saldo > 0, 'Esta cuenta no tiene saldo pendiente');
  perform exigir(p_monto > 0 and p_monto <= v_saldo, format('El valor debe estar entre $1 y el saldo ($%s)', v_saldo));

  select id into v_turno from turnos_caja where sede_id = c.sede_id and cerrado_en is null;
  insert into pagos (sede_id, cuenta_id, turno_caja_id, monto, medio, operacion_id, perfil_id)
  values (c.sede_id, c.id, v_turno, p_monto, p_medio, p_op, auth.uid()) returning id into v_pago;
  if v_turno is not null then
    insert into movimientos_caja (turno_caja_id, tipo, medio, monto, ref_id) values (v_turno, 'pago', p_medio, p_monto, v_pago);
  end if;
  v_saldo := v_saldo - p_monto;
  update cuentas set pagado = pagado + p_monto,
    estado = case when v_saldo = 0 then 'pagada' else estado end,
    pagada_en = case when v_saldo = 0 then now() else pagada_en end
  where id = c.id;
  if v_saldo = 0 and c.mesa_id is not null then
    perform notificar(c.sede_id, 'mesero', null, 'cuenta_pagada',
      'Mesa ' || lpad((select numero from mesas where id = c.mesa_id)::text, 2, '0') || ' pagó', 'Ya se puede liberar cuando esté lista', c.id);
  end if;
  return op_terminar(p_op, jsonb_build_object('pago_id', v_pago, 'saldo', v_saldo));
end $$;

-- ¿Quedó registrado este cobro? (para cuando la conexión falla en medio del cobro)
create or replace function consultar_operacion(p_op uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when resultado is null then null else resultado end from operaciones where id = p_op
$$;

-- Consumo real de una línea (porciones reservadas o receta de comidas rápidas). Se hace una sola vez.
create or replace function consumir_linea(p_linea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lp lineas_pedido; p productos; r reservas_stock; d record; v_sede uuid;
begin
  select * into lp from lineas_pedido where id = p_linea for update;
  if lp.estado <> 'activa' then return; end if;
  select * into p from productos where id = lp.producto_id;
  select sede_id into v_sede from cuentas where id = lp.cuenta_id;
  if p.estacion = 'horno' then
    for r in select * from reservas_stock where linea_pedido_id = p_linea and estado = 'activa' for update loop
      update saldos_stock set reservado = reservado - r.cantidad where ubicacion_id = r.ubicacion_id and insumo_id = r.insumo_id;
      update reservas_stock set estado = 'consumida' where id = r.id;
      perform stock_mover(r.ubicacion_id, r.insumo_id, -r.cantidad, 'venta', p.nombre, 'linea_pedido', p_linea::text, lp.receta_id);
    end loop;
  elsif p.estacion = 'rapidas' and lp.receta_id is not null then
    if exists (select 1 from movimientos_stock where ref_tipo = 'linea_pedido' and ref_id = p_linea::text and tipo = 'consumo') then
      return;
    end if;
    for d in select * from receta_detalles where receta_id = lp.receta_id loop
      perform stock_mover(ubicacion_id(v_sede, d.ubicacion), d.insumo_id, -(d.cantidad * lp.cantidad), 'consumo',
        p.nombre, 'linea_pedido', p_linea::text, lp.receta_id);
    end loop;
  end if;
end $$;

-- Estados de una comanda: nueva → en_preparacion → lista → entregada
create or replace function comanda_estado(p_comanda uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare c comandas; v_est text; v_lp uuid; v_mesa int; v_num int; v_cuenta uuid;
begin
  select * into c from comandas where id = p_comanda for update;
  perform exigir(found, 'La comanda no existe');
  select codigo into v_est from estaciones where id = c.estacion_id;
  if p_estado = 'entregada' then
    perform exigir_rol(c.sede_id, array['mesero','caja']);
  else
    perform exigir_rol(c.sede_id, case when v_est = 'horno' then array['caja'] else array['rapidas'] end);
  end if;
  perform exigir(p_estado in ('en_preparacion','lista','entregada'), 'Estado inválido');
  if c.estado = p_estado or c.estado = 'cancelada' then return; end if;
  perform exigir(
    (c.estado = 'nueva' and p_estado in ('en_preparacion','lista')) or
    (c.estado = 'en_preparacion' and p_estado = 'lista') or
    (c.estado = 'lista' and p_estado = 'entregada'), 'Ese cambio de estado no aplica');

  if c.estado = 'nueva' then   -- al empezar a usarse, se descuenta de la existencia física (una sola vez)
    for v_lp in select linea_pedido_id from lineas_comanda where comanda_id = c.id and not cancelada loop
      perform consumir_linea(v_lp);
    end loop;
  end if;

  update comandas set estado = p_estado,
    empezada_en = coalesce(empezada_en, case when p_estado <> 'nueva' then now() end),
    lista_en = case when p_estado = 'lista' then now() else lista_en end
  where id = c.id;
  insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
  values ('comanda', c.id, c.estado, p_estado, auth.uid());

  if p_estado = 'lista' then
    select m.numero, pe.numero, pe.cuenta_id into v_mesa, v_num, v_cuenta
      from pedidos pe join cuentas cu on cu.id = pe.cuenta_id left join mesas m on m.id = cu.mesa_id where pe.id = c.pedido_id;
    perform notificar(c.sede_id, 'mesero', null, 'listo',
      case when v_mesa is not null then 'Mesa ' || lpad(v_mesa::text, 2, '0') else 'Pedido ' || v_num end
        || ' · ' || case when v_est = 'horno' then 'pizza lista' else 'comida rápida lista' end, null, c.id);
  elsif p_estado = 'entregada' then
    update lineas_pedido set entregada = true, entregada_en = now()
      where id in (select linea_pedido_id from lineas_comanda where comanda_id = c.id);
  end if;
end $$;

-- Cancelar una línea ya enviada: libera la reserva o, si ya se usó, registra la merma.
create or replace function cancelar_linea(p_linea uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare lp lineas_pedido; c cuentas; r reservas_stock; m record; v_com uuid;
begin
  select * into lp from lineas_pedido where id = p_linea for update;
  perform exigir(found, 'La línea no existe');
  select * into c from cuentas where id = lp.cuenta_id for update;
  perform exigir_rol(c.sede_id, array['mesero','caja']);
  perform exigir(c.estado = 'abierta', 'Solo se cancela en cuentas abiertas');
  if lp.estado = 'cancelada' then return; end if;

  for r in select * from reservas_stock where linea_pedido_id = p_linea and estado = 'activa' for update loop
    update saldos_stock set reservado = reservado - r.cantidad where ubicacion_id = r.ubicacion_id and insumo_id = r.insumo_id;
    update reservas_stock set estado = 'liberada' where id = r.id;
    perform evaluar_reglas(r.ubicacion_id, r.insumo_id);
  end loop;
  -- Ya usada: lo consumido se reclasifica como merma (no cambia la existencia física)
  for m in select ubicacion_id, insumo_id, sum(-cantidad) q from movimientos_stock
           where ref_tipo = 'linea_pedido' and ref_id = p_linea::text and tipo in ('venta','consumo')
           group by ubicacion_id, insumo_id loop
    insert into movimientos_stock (sede_id, insumo_id, ubicacion_id, cantidad, tipo, motivo, ref_tipo, ref_id, perfil_id)
    values (c.sede_id, m.insumo_id, m.ubicacion_id, 0, 'merma',
            format('Cancelada después de preparar (%s): %s', fmt_cant(m.q), coalesce(p_motivo,'')), 'linea_pedido', p_linea::text, auth.uid());
  end loop;

  update lineas_pedido set estado = 'cancelada' where id = p_linea;
  update lineas_comanda set cancelada = true where linea_pedido_id = p_linea returning comanda_id into v_com;
  if v_com is not null and not exists (select 1 from lineas_comanda where comanda_id = v_com and not cancelada) then
    update comandas set estado = 'cancelada' where id = v_com;
  end if;
  if v_com is not null then
    insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
    values ('linea_comanda', p_linea, 'activa', 'cancelada', auth.uid());
  end if;
  update cuentas set total = total - lp.cantidad * lp.precio_unit where id = c.id;
  perform auditar(c.sede_id, 'cancelar_linea', 'lineas_pedido', p_linea::text, to_jsonb(lp), jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function liberar_mesa(p_cuenta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cuentas;
begin
  select * into c from cuentas where id = p_cuenta for update;
  perform exigir(found, 'La cuenta no existe');
  perform exigir_rol(c.sede_id, array['mesero','caja']);
  if c.estado = 'cerrada' then return; end if;
  perform exigir(c.estado = 'pagada', 'La mesa todavía tiene saldo por cobrar');
  update cuentas set estado = 'cerrada', liberada_en = now() where id = c.id;
end $$;

-- ───────────── Caja: base y gastos ─────────────
create or replace function registrar_base(p_op uuid, p_sede uuid, p_base numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v uuid;
begin
  perform exigir_rol(p_sede, array['caja']);
  v_prev := op_iniciar(p_op, 'registrar_base');
  if v_prev is not null then return (v_prev->>'turno_caja_id')::uuid; end if;
  perform exigir(not exists (select 1 from turnos_caja where sede_id = p_sede and cerrado_en is null),
    'Ya hay una base registrada en este turno de caja');
  insert into turnos_caja (sede_id, perfil_id, base) values (p_sede, auth.uid(), p_base) returning id into v;
  insert into movimientos_caja (turno_caja_id, tipo, medio, monto) values (v, 'base', 'efectivo', p_base);
  perform completar_tareas_accion(p_sede, 'registrar_base');
  perform op_terminar(p_op, jsonb_build_object('turno_caja_id', v));
  return v;
end $$;

create or replace function cerrar_caja(p_sede uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol(p_sede, array['caja']);
  update turnos_caja set cerrado_en = now() where sede_id = p_sede and cerrado_en is null;
end $$;

create or replace function registrar_gasto(p_op uuid, p_sede uuid, p_categoria text, p_concepto text,
  p_valor numeric, p_responsable text, p_medio text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v uuid; v_turno uuid;
begin
  perform exigir_rol(p_sede, array['caja']);
  v_prev := op_iniciar(p_op, 'registrar_gasto');
  if v_prev is not null then return (v_prev->>'gasto_id')::uuid; end if;
  select id into v_turno from turnos_caja where sede_id = p_sede and cerrado_en is null;
  insert into gastos_caja (sede_id, turno_caja_id, categoria, concepto, valor, responsable, medio, operacion_id, perfil_id)
  values (p_sede, v_turno, p_categoria, p_concepto, p_valor, p_responsable, p_medio, p_op, auth.uid()) returning id into v;
  if v_turno is not null then
    insert into movimientos_caja (turno_caja_id, tipo, medio, monto, ref_id) values (v_turno, 'gasto', p_medio, -p_valor, v);
  end if;
  perform op_terminar(p_op, jsonb_build_object('gasto_id', v));
  return v;
end $$;

-- ───────────── Inventario: traslados, armado, producción ─────────────
-- Resta en origen y suma en destino en la misma transacción (ej. Subir a nevera, Retirar insumo).
create or replace function trasladar(p_op uuid, p_sede uuid, p_origen text, p_destino text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_o uuid; v_d uuid; it jsonb; v_ins uuid; v_cant numeric;
begin
  perform exigir_rol(p_sede, case p_destino
    when 'nevera_rapidas' then array['rapidas'] when 'armado' then array['armado'] else array['insumos'] end);
  v_prev := op_iniciar(p_op, 'trasladar');
  if v_prev is not null then return v_prev; end if;
  v_o := ubicacion_id(p_sede, p_origen); v_d := ubicacion_id(p_sede, p_destino);
  perform exigir(v_o <> v_d, 'Origen y destino son iguales');
  for it in select * from jsonb_array_elements(p_items) loop
    v_ins := (it->>'insumo_id')::uuid; v_cant := (it->>'cantidad')::numeric;
    continue when coalesce(v_cant, 0) <= 0;
    perform exigir_disponible(v_o, v_ins, v_cant);
    perform stock_mover(v_o, v_ins, -v_cant, 'traslado_salida', 'A ' || p_destino, 'operacion', p_op::text);
    perform stock_mover(v_d, v_ins,  v_cant, 'traslado_entrada', 'Desde ' || p_origen, 'operacion', p_op::text);
  end loop;
  return op_terminar(p_op, jsonb_build_object('ok', true));
end $$;

-- Ingredientes que gasta Armado por cada porción de un sabor (configurable por Administración)
create table if not exists receta_armado (
  resultado_id  uuid not null references insumos(id),     -- porción o personal de un sabor
  insumo_id     uuid not null references insumos(id),
  cantidad      numeric(14,3) not null check (cantidad > 0), -- por unidad producida
  primary key (resultado_id, insumo_id)
);

create or replace function registrar_armado(p_op uuid, p_sede uuid, p_tipo text, p_resultado uuid,
  p_cantidad numeric, p_tortas numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_lote uuid; v_armado uuid; v_tortas uuid; v_base uuid; d record;
begin
  perform exigir_rol(p_sede, array['armado']);
  perform exigir(p_tipo in ('rueda','personales'), 'Tipo de armado inválido');
  if p_tipo = 'rueda' then perform exigir(p_cantidad in (4, 8), 'Una rueda es 4 (½) u 8 (entera) porciones'); end if;
  perform exigir(p_cantidad > 0 and p_tortas >= 0, 'Cantidades inválidas');
  v_prev := op_iniciar(p_op, 'registrar_armado');
  if v_prev is not null then return v_prev; end if;

  v_armado := ubicacion_id(p_sede, 'armado');
  v_tortas := ubicacion_id(p_sede, 'tortas');
  select id into v_base from insumos where codigo = case when p_tipo = 'rueda' then 'torta_grande' else 'torta_pequena' end;

  insert into lotes_produccion (sede_id, tipo, insumo_id, cantidad, operacion_id, perfil_id)
  values (p_sede, p_tipo, p_resultado, p_cantidad, p_op, auth.uid()) returning id into v_lote;

  if p_tortas > 0 then
    perform exigir_disponible(v_tortas, v_base, p_tortas);
    perform stock_mover(v_tortas, v_base, -p_tortas, 'armado', 'Bases usadas en ' || p_tipo, 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, v_base, p_tortas, 'usado');
  end if;
  for d in select * from receta_armado where resultado_id = p_resultado loop
    perform stock_mover(v_armado, d.insumo_id, -(d.cantidad * p_cantidad), 'consumo', 'Armado', 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, d.insumo_id, d.cantidad * p_cantidad, 'usado');
  end loop;
  perform stock_mover(v_armado, p_resultado, p_cantidad, 'produccion', 'Armado ' || p_tipo, 'lote', v_lote::text);
  insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, p_resultado, p_cantidad, 'producido');
  return op_terminar(p_op, jsonb_build_object('lote_id', v_lote));
end $$;

-- Producción de tortas: monjes recibidos y usados, tortas grandes y pequeñas hechas
create or replace function registrar_tortas(p_op uuid, p_sede uuid, p_monjes_recibidos numeric, p_monjes_usados numeric,
  p_grandes numeric, p_pequenas numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_lote uuid; v_u uuid; v_monje uuid; v_g uuid; v_p uuid;
begin
  perform exigir_rol(p_sede, array['tortas']);
  v_prev := op_iniciar(p_op, 'registrar_tortas');
  if v_prev is not null then return v_prev; end if;
  v_u := ubicacion_id(p_sede, 'tortas');
  select id into v_monje from insumos where codigo = 'monje';
  select id into v_g from insumos where codigo = 'torta_grande';
  select id into v_p from insumos where codigo = 'torta_pequena';
  insert into lotes_produccion (sede_id, tipo, cantidad, operacion_id, perfil_id, notas)
  values (p_sede, 'tortas', coalesce(p_grandes,0) + coalesce(p_pequenas,0), p_op, auth.uid(),
          format('Monjes recibidos %s · usados %s', fmt_cant(coalesce(p_monjes_recibidos,0)), fmt_cant(coalesce(p_monjes_usados,0))))
  returning id into v_lote;
  if coalesce(p_monjes_recibidos,0) > 0 then
    perform stock_mover(v_u, v_monje, p_monjes_recibidos, 'recepcion', 'Monjes recibidos', 'lote', v_lote::text);
  end if;
  if coalesce(p_monjes_usados,0) > 0 then
    perform exigir_disponible(v_u, v_monje, p_monjes_usados);
    perform stock_mover(v_u, v_monje, -p_monjes_usados, 'consumo', 'Monjes usados', 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, v_monje, p_monjes_usados, 'usado');
  end if;
  if coalesce(p_grandes,0) > 0 then
    perform stock_mover(v_u, v_g, p_grandes, 'produccion', 'Tortas grandes', 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, v_g, p_grandes, 'producido');
  end if;
  if coalesce(p_pequenas,0) > 0 then
    perform stock_mover(v_u, v_p, p_pequenas, 'produccion', 'Tortas pequeñas', 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, v_p, p_pequenas, 'producido');
  end if;
  return op_terminar(p_op, jsonb_build_object('lote_id', v_lote));
end $$;

-- Producción de insumos (salsas, carnes...). Completa la tarea de reposición y deja otra si sigue bajo.
create or replace function registrar_produccion(p_op uuid, p_sede uuid, p_insumo uuid, p_cantidad numeric,
  p_usados jsonb default '[]'::jsonb, p_tarea uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_lote uuid; v_u uuid; it jsonb; v_t uuid;
begin
  perform exigir_rol(p_sede, array['insumos']);
  perform exigir(p_cantidad > 0, 'Escribe la cantidad real producida');
  v_prev := op_iniciar(p_op, 'registrar_produccion');
  if v_prev is not null then return v_prev; end if;
  v_u := ubicacion_id(p_sede, 'produccion');
  insert into lotes_produccion (sede_id, tipo, insumo_id, cantidad, tarea_id, operacion_id, perfil_id)
  values (p_sede, 'insumo', p_insumo, p_cantidad, p_tarea, p_op, auth.uid()) returning id into v_lote;
  for it in select * from jsonb_array_elements(coalesce(p_usados,'[]'::jsonb)) loop
    continue when coalesce((it->>'cantidad')::numeric, 0) <= 0;
    perform stock_mover(v_u, (it->>'insumo_id')::uuid, -(it->>'cantidad')::numeric, 'consumo', 'Usado en producción', 'lote', v_lote::text);
    insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, (it->>'insumo_id')::uuid, (it->>'cantidad')::numeric, 'usado');
  end loop;
  insert into detalle_lote (lote_id, insumo_id, cantidad, papel) values (v_lote, p_insumo, p_cantidad, 'producido');

  -- Primero se da por hecha la tarea (el trabajo queda registrado)...
  for v_t in select id from tareas where sede_id = p_sede and rol = 'insumos' and estado in ('pendiente','en_proceso')
             and (id = p_tarea or regla_id in (select id from reglas_stock where ubicacion_id = v_u and insumo_id = p_insumo)) loop
    update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(),
      tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()) where id = v_t;
    insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (v_t, 'lista', 'Lote ' || fmt_cant(p_cantidad), auth.uid());
  end loop;
  -- ...y luego sube el stock: si sigue bajo, la regla deja una sola reposición pendiente nueva.
  perform stock_mover(v_u, p_insumo, p_cantidad, 'produccion', 'Lote de producción', 'lote', v_lote::text);
  return op_terminar(p_op, jsonb_build_object('lote_id', v_lote));
end $$;

-- Mesero arma portapizzas con cartones
create or replace function armar_portapizzas(p_op uuid, p_sede uuid, p_cantidad numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_u uuid; v_carton uuid; v_porta uuid; v_lote uuid; v_disp numeric;
begin
  perform exigir_rol(p_sede, array['mesero']);
  v_prev := op_iniciar(p_op, 'armar_portapizzas');
  if v_prev is not null then return v_prev; end if;
  v_u := ubicacion_id(p_sede, 'servicio');
  select id into v_carton from insumos where codigo = 'carton';
  select id into v_porta from insumos where codigo = 'portapizza';
  v_disp := stock_disponible(v_u, v_carton);
  if v_disp < p_cantidad then
    -- Faltan cartones: le llega a Administración "Comprar cartones"
    if not exists (select 1 from tareas where sede_id = p_sede and accion = 'compra:carton' and estado in ('pendiente','en_proceso')) then
      insert into tareas (sede_id, rol, titulo, detalle, prioridad, origen, accion)
      values (p_sede, 'admin', 'Comprar cartones', format('Para armar portapizzas · quedan %s', fmt_cant(v_disp)), 'alta', 'automatica', 'compra:carton');
    end if;
    -- No se lanza error (se perdería la tarea); se libera la operación para poder reintentar
    delete from operaciones where id = p_op;
    return jsonb_build_object('ok', false,
      'error', format('Faltan cartones: hay %s y necesitas %s. Se avisó a Administración.', fmt_cant(v_disp), fmt_cant(p_cantidad)));
  end if;
  insert into lotes_produccion (sede_id, tipo, insumo_id, cantidad, operacion_id, perfil_id)
  values (p_sede, 'portapizzas', v_porta, p_cantidad, p_op, auth.uid()) returning id into v_lote;
  perform stock_mover(v_u, v_carton, -p_cantidad, 'consumo', 'Armado de portapizzas', 'lote', v_lote::text);
  perform stock_mover(v_u, v_porta, p_cantidad, 'produccion', 'Portapizzas armados', 'lote', v_lote::text);
  return op_terminar(p_op, jsonb_build_object('lote_id', v_lote));
end $$;

-- Personal reporta: Queda poco / Se acabó / Conteo
create or replace function reportar_stock(p_sede uuid, p_ubicacion text, p_insumo uuid, p_tipo text, p_conteo numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; v_u uuid; v_n text;
begin
  perform exigir(puede_ver_sede(p_sede), 'No tienes acceso a esta sede');
  v_u := ubicacion_id(p_sede, p_ubicacion);
  select nombre into v_n from insumos where id = p_insumo;
  insert into reportes_stock (sede_id, ubicacion_id, insumo_id, tipo, conteo, saldo_sistema, perfil_id)
  values (p_sede, v_u, p_insumo, p_tipo, p_conteo, stock_disponible(v_u, p_insumo), auth.uid()) returning id into v;
  perform notificar(p_sede, 'admin', null, 'reporte',
    case p_tipo when 'queda_poco' then 'Queda poco · ' when 'se_acabo' then 'Se acabó · ' else 'Conteo · ' end || v_n,
    case when p_conteo is not null then 'Contaron ' || fmt_cant(p_conteo) end, v);
  if p_tipo in ('queda_poco','se_acabo') and not exists (
       select 1 from tareas where sede_id = p_sede and accion = 'compra:' || p_insumo and estado in ('pendiente','en_proceso')) then
    insert into tareas (sede_id, rol, titulo, detalle, prioridad, origen, accion)
    values (p_sede, 'admin', 'Revisar compra · ' || v_n,
            case p_tipo when 'se_acabo' then 'Reportaron que se acabó' else 'Reportaron que queda poco' end,
            case p_tipo when 'se_acabo' then 'alta' else 'media' end, 'automatica', 'compra:' || p_insumo);
  end if;
  return v;
end $$;

-- ───────────── Solo Administración ─────────────
create or replace function ajustar_stock(p_op uuid, p_sede uuid, p_ubicacion text, p_insumo uuid, p_nuevo numeric,
  p_motivo text, p_reporte uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_u uuid; s saldos_stock;
begin
  perform exigir(es_admin(), 'Solo Administración puede ajustar el stock');
  perform exigir(length(trim(coalesce(p_motivo,''))) >= 3, 'El motivo del ajuste es obligatorio');
  perform exigir(p_nuevo >= 0, 'El saldo no puede ser negativo');
  v_prev := op_iniciar(p_op, 'ajustar_stock');
  if v_prev is not null then return v_prev; end if;
  v_u := ubicacion_id(p_sede, p_ubicacion);
  s := stock_fila(v_u, p_insumo);
  perform stock_mover(v_u, p_insumo, p_nuevo - s.fisico, 'ajuste', p_motivo, 'ajuste', p_op::text);
  perform auditar(p_sede, 'ajuste_stock', 'saldos_stock', v_u || '/' || p_insumo,
    jsonb_build_object('saldo', s.fisico), jsonb_build_object('saldo', p_nuevo, 'motivo', p_motivo));
  if p_reporte is not null then
    update reportes_stock set estado = 'corregido', revisado_por = auth.uid(), revisado_en = now() where id = p_reporte;
  end if;
  return op_terminar(p_op, jsonb_build_object('antes', s.fisico, 'despues', p_nuevo));
end $$;

create or replace function cambiar_precio(p_producto uuid, p_sede uuid, p_precio numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_ant numeric;
begin
  perform exigir(es_admin(), 'Solo Administración puede cambiar precios');
  perform exigir(p_precio >= 0, 'Precio inválido');
  select precio into v_ant from productos_sede where producto_id = p_producto and sede_id = p_sede;
  insert into productos_sede (producto_id, sede_id, precio) values (p_producto, p_sede, p_precio)
  on conflict (producto_id, sede_id) do update set precio = excluded.precio;
  insert into precios_historial (producto_id, sede_id, precio_ant, precio_nuevo, perfil_id)
  values (p_producto, p_sede, v_ant, p_precio, auth.uid());
  perform auditar(p_sede, 'cambiar_precio', 'productos_sede', p_producto::text,
    jsonb_build_object('precio', v_ant), jsonb_build_object('precio', p_precio));
end $$;

-- Nueva receta = nueva versión (las ventas anteriores conservan la que usaron)
create or replace function guardar_receta(p_producto uuid, p_detalles jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; v_ver int; d jsonb;
begin
  perform exigir(es_admin(), 'Solo Administración puede cambiar recetas');
  select coalesce(max(version), 0) + 1 into v_ver from recetas where producto_id = p_producto;
  update recetas set vigente = false where producto_id = p_producto and vigente;
  insert into recetas (producto_id, version) values (p_producto, v_ver) returning id into v;
  for d in select * from jsonb_array_elements(p_detalles) loop
    insert into receta_detalles (receta_id, insumo_id, cantidad, ubicacion)
    values (v, (d->>'insumo_id')::uuid, (d->>'cantidad')::numeric, d->>'ubicacion');
  end loop;
  perform auditar(null, 'guardar_receta', 'recetas', v::text, null, p_detalles);
  return v;
end $$;

-- Nueva sede lista para trabajar: mesas, estaciones, ubicaciones, precios y reglas (copiados de una sede modelo)
create or replace function crear_sede(p_nombre text, p_mesas int, p_copiar_de uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; i int; v_modelo uuid; r reglas_stock;
begin
  perform exigir(es_admin(), 'Solo Administración puede crear sedes');
  perform exigir(length(trim(coalesce(p_nombre,''))) > 1, 'Escribe el nombre de la sede');
  perform exigir(p_mesas between 0 and 200, 'Número de mesas inválido');
  insert into sedes (nombre) values (trim(p_nombre)) returning id into v;
  for i in 1..p_mesas loop insert into mesas (sede_id, numero) values (v, i); end loop;
  insert into estaciones (sede_id, codigo, nombre) values (v, 'horno', 'Horno (Caja)'), (v, 'rapidas', 'Comidas rápidas');
  insert into ubicaciones_stock (sede_id, codigo, nombre) values
    (v, 'produccion', 'Producción'), (v, 'tortas', 'Tortas'), (v, 'armado', 'Armado'),
    (v, 'nevera_rapidas', 'Nevera comidas rápidas'), (v, 'servicio', 'Servicio y aseo'), (v, 'bodega', 'Bodega');
  v_modelo := coalesce(p_copiar_de, (select id from sedes where id <> v order by creada_en limit 1));
  if v_modelo is not null then
    insert into productos_sede (producto_id, sede_id, precio, disponible)
    select producto_id, v, precio, disponible from productos_sede where sede_id = v_modelo;
    for r in select * from reglas_stock where sede_id = v_modelo loop
      insert into reglas_stock (sede_id, ubicacion_id, insumo_id, minimo, rol_destino, prioridad, texto, accion, activa)
      values (v, ubicacion_id(v, (select codigo from ubicaciones_stock where id = r.ubicacion_id)),
              r.insumo_id, r.minimo, r.rol_destino, r.prioridad, r.texto, r.accion, r.activa);
    end loop;
  end if;
  -- quien la crea queda como administración de la sede
  insert into accesos_sede (perfil_id, sede_id, rol) values (auth.uid(), v, 'admin') on conflict do nothing;
  perform auditar(v, 'crear_sede', 'sedes', v::text, null, jsonb_build_object('nombre', p_nombre, 'mesas', p_mesas));
  return v;
end $$;

create or replace function configurar_mesas(p_sede uuid, p_total int) returns void
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  perform exigir(es_admin(), 'Solo Administración configura las mesas');
  for i in 1..p_total loop
    insert into mesas (sede_id, numero) values (p_sede, i) on conflict (sede_id, numero) do update set activa = true;
  end loop;
  update mesas set activa = false where sede_id = p_sede and numero > p_total;
end $$;

-- ───────────── Compras ─────────────
create or replace function crear_orden_compra(p_sede uuid, p_proveedor uuid, p_lineas jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; l jsonb;
begin
  perform exigir(es_admin(), 'Solo Administración hace compras');
  insert into ordenes_compra (sede_id, proveedor_id, creada_por) values (p_sede, p_proveedor, auth.uid()) returning id into v;
  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into lineas_compra (orden_id, insumo_id, ubicacion_id, cantidad, precio)
    values (v, (l->>'insumo_id')::uuid, ubicacion_id(p_sede, coalesce(l->>'ubicacion','bodega')),
            (l->>'cantidad')::numeric, (l->>'precio')::numeric);
  end loop;
  return v;
end $$;

create or replace function marcar_orden_pedida(p_orden uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración hace compras');
  update ordenes_compra set estado = 'en_camino', pedida_en = now() where id = p_orden and estado = 'por_comprar';
end $$;

-- Recepción (puede ser parcial): entra solo lo que llegó; lo demás queda pendiente.
create or replace function recibir_compra(p_op uuid, p_orden uuid, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; o ordenes_compra; v_rec uuid; l jsonb; lc lineas_compra; v_cant numeric;
begin
  perform exigir(es_admin(), 'Solo Administración registra recepciones');
  v_prev := op_iniciar(p_op, 'recibir_compra');
  if v_prev is not null then return v_prev; end if;
  select * into o from ordenes_compra where id = p_orden for update;
  perform exigir(found and o.estado in ('por_comprar','en_camino','parcial'), 'Esta orden no está pendiente');
  insert into recepciones (orden_id, operacion_id, perfil_id) values (p_orden, p_op, auth.uid()) returning id into v_rec;
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (l->>'cantidad')::numeric;
    continue when coalesce(v_cant,0) <= 0;
    select * into lc from lineas_compra where id = (l->>'linea_compra_id')::uuid and orden_id = p_orden for update;
    perform exigir(found, 'Línea de compra inválida');
    perform exigir(lc.recibido + v_cant <= lc.cantidad, 'Llegó más de lo pedido; ajusta la orden primero');
    insert into lineas_recepcion (recepcion_id, linea_compra_id, cantidad) values (v_rec, lc.id, v_cant);
    update lineas_compra set recibido = recibido + v_cant where id = lc.id;
    perform stock_mover(lc.ubicacion_id, lc.insumo_id, v_cant, 'recepcion', 'Compra recibida', 'recepcion', v_rec::text);
    if lc.precio is not null and o.proveedor_id is not null then
      insert into proveedor_insumos (proveedor_id, insumo_id, precio) values (o.proveedor_id, lc.insumo_id, lc.precio)
      on conflict (proveedor_id, insumo_id) do update set precio = excluded.precio, actualizado = now();
      insert into proveedor_precios_historial (proveedor_id, insumo_id, precio) values (o.proveedor_id, lc.insumo_id, lc.precio);
    end if;
  end loop;
  update ordenes_compra set estado = case
      when not exists (select 1 from lineas_compra where orden_id = p_orden and recibido < cantidad) then 'recibido'
      else 'parcial' end
  where id = p_orden;
  return op_terminar(p_op, jsonb_build_object('recepcion_id', v_rec));
end $$;

-- ───────────── Vistas para las pantallas ─────────────
-- Caja · Por cobrar: solo mesas con pedido enviado y saldo pendiente
create or replace view v_por_cobrar with (security_invoker = true) as
select c.id as cuenta_id, c.sede_id, m.numero as mesa, c.total, c.pagado, c.total - c.pagado as saldo, c.abierta_en
from cuentas c join mesas m on m.id = c.mesa_id
where c.tipo = 'mesa' and c.estado = 'abierta' and c.total > c.pagado
  and exists (select 1 from pedidos p where p.cuenta_id = c.id);

-- Efectivo esperado por turno de caja
create or replace view v_caja_turnos with (security_invoker = true) as
select t.id, t.sede_id, t.perfil_id, t.base, t.abierto_en, t.cerrado_en,
  coalesce(sum(mc.monto) filter (where mc.tipo = 'pago'), 0) as cobrado,
  coalesce(sum(-mc.monto) filter (where mc.tipo = 'gasto'), 0) as gastos,
  t.base + coalesce(sum(mc.monto) filter (where mc.medio = 'efectivo' and mc.tipo <> 'base'), 0) as efectivo_esperado
from turnos_caja t left join movimientos_caja mc on mc.turno_caja_id = t.id
group by t.id;

-- Saldos con disponible
create or replace view v_saldos with (security_invoker = true) as
select s.sede_id, s.ubicacion_id, u.codigo as ubicacion, s.insumo_id, i.codigo as insumo_codigo, i.nombre as insumo,
  i.unidad, i.categoria, s.fisico, s.reservado, s.fisico - s.reservado as disponible, s.actualizado
from saldos_stock s join ubicaciones_stock u on u.id = s.ubicacion_id join insumos i on i.id = s.insumo_id;

-- Perfil nuevo al crear usuario en Auth
create or replace function trg_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, correo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger auth_nuevo_usuario after insert on auth.users for each row execute function trg_nuevo_usuario();

-- ===== supabase/migrations/20261123000003_seguridad.sql =====
-- Max Pizza · 003 · Permisos en el servidor (RLS) y tiempo real
-- Regla general: el personal LEE lo de sus sedes; los cambios van por las funciones de 002.
-- Administración además edita directamente la configuración (catálogo, reglas, sedes, equipo).

do $$
declare t text;
begin
  foreach t in array array[
    'sedes','roles','permisos','perfiles','accesos_sede','turnos','estaciones','mesas','unidades','categorias','insumos',
    'productos','productos_sede','precios_historial','recetas','receta_detalles','receta_armado','ubicaciones_stock',
    'saldos_stock','movimientos_stock','cuentas','pedidos','lineas_pedido','reservas_stock','comandas','lineas_comanda',
    'historial_estados','turnos_caja','pagos','gastos_caja','movimientos_caja','lotes_produccion','detalle_lote',
    'categorias_tareas','plantillas_checklist','reglas_stock','alertas_stock','tareas','historial_tareas','notificaciones',
    'reportes_stock','proveedores','proveedor_insumos','proveedor_precios_historial','ordenes_compra','lineas_compra',
    'recepciones','lineas_recepcion','historial_auditoria','operaciones']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── Lectura del catálogo general (cualquier persona con sesión) ──
create policy leer on roles for select to authenticated using (true);
create policy leer on permisos for select to authenticated using (true);
create policy leer on unidades for select to authenticated using (true);
create policy leer on categorias for select to authenticated using (true);
create policy leer on insumos for select to authenticated using (true);
create policy leer on productos for select to authenticated using (true);
create policy leer on recetas for select to authenticated using (true);
create policy leer on receta_detalles for select to authenticated using (true);
create policy leer on receta_armado for select to authenticated using (true);
create policy leer on categorias_tareas for select to authenticated using (true);
create policy leer on perfiles for select to authenticated using (true);

-- ── Lectura por sede ──
create policy leer on sedes for select to authenticated using (puede_ver_sede(id));
create policy leer on accesos_sede for select to authenticated using (perfil_id = auth.uid() or es_admin());
create policy leer on turnos for select to authenticated using (perfil_id = auth.uid() or es_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'estaciones','mesas','productos_sede','ubicaciones_stock','saldos_stock','movimientos_stock','cuentas','pedidos',
    'comandas','turnos_caja','pagos','gastos_caja','lotes_produccion','alertas_stock','tareas','reportes_stock',
    'reglas_stock']
  loop
    execute format('create policy leer on %I for select to authenticated using (puede_ver_sede(sede_id))', t);
  end loop;
end $$;

create policy leer on plantillas_checklist for select to authenticated using (sede_id is null or puede_ver_sede(sede_id));
create policy leer on lineas_pedido for select to authenticated
  using (exists (select 1 from cuentas c where c.id = cuenta_id and puede_ver_sede(c.sede_id)));
create policy leer on reservas_stock for select to authenticated
  using (exists (select 1 from ubicaciones_stock u where u.id = ubicacion_id and puede_ver_sede(u.sede_id)));
create policy leer on lineas_comanda for select to authenticated
  using (exists (select 1 from comandas c where c.id = comanda_id and puede_ver_sede(c.sede_id)));
create policy leer on historial_estados for select to authenticated using (true);
create policy leer on historial_tareas for select to authenticated
  using (exists (select 1 from tareas t where t.id = tarea_id and puede_ver_sede(t.sede_id)));
create policy leer on detalle_lote for select to authenticated
  using (exists (select 1 from lotes_produccion l where l.id = lote_id and puede_ver_sede(l.sede_id)));
create policy leer on movimientos_caja for select to authenticated
  using (exists (select 1 from turnos_caja t where t.id = turno_caja_id and tiene_rol(t.sede_id, array['caja'])));

-- Notificaciones: las de mi rol en mi sede, las mías, o todas si soy admin
create policy leer on notificaciones for select to authenticated using (
  es_admin() or perfil_id = auth.uid() or (
    perfil_id is null and exists (select 1 from accesos_sede a where a.perfil_id = auth.uid() and a.sede_id = notificaciones.sede_id and a.rol = notificaciones.rol)));
create policy marcar_leida on notificaciones for update to authenticated using (
  es_admin() or perfil_id = auth.uid() or exists (select 1 from accesos_sede a where a.perfil_id = auth.uid() and a.sede_id = notificaciones.sede_id and a.rol = notificaciones.rol))
  with check (true);

-- ── Solo Administración ──
create policy leer on precios_historial for select to authenticated using (es_admin());
create policy leer on proveedores for select to authenticated using (es_admin());
create policy leer on proveedor_insumos for select to authenticated using (es_admin());
create policy leer on proveedor_precios_historial for select to authenticated using (es_admin());
create policy leer on ordenes_compra for select to authenticated using (es_admin());
create policy leer on lineas_compra for select to authenticated using (es_admin());
create policy leer on recepciones for select to authenticated using (es_admin());
create policy leer on lineas_recepcion for select to authenticated using (es_admin());
create policy leer on historial_auditoria for select to authenticated using (es_admin());

do $$
declare t text;
begin
  -- Configuración que Administración edita directamente (todo queda en las tablas con su historial)
  foreach t in array array[
    'sedes','mesas','estaciones','ubicaciones_stock','categorias','insumos','productos','receta_armado','reglas_stock',
    'plantillas_checklist','categorias_tareas','proveedores','proveedor_insumos','accesos_sede','unidades']
  loop
    execute format('create policy admin_escribe on %I for all to authenticated using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;
create policy admin_edita on perfiles for update to authenticated using (es_admin()) with check (es_admin());
-- Precios: Administración agrega el precio de un producto nuevo; los cambios van por cambiar_precio() (deja historial)
create policy admin_agrega on productos_sede for insert to authenticated with check (es_admin());

-- ── Funciones internas: no se pueden llamar desde la app ──
do $$
declare f text;
begin
  foreach f in array array[
    'op_iniciar(uuid,text)','op_terminar(uuid,jsonb)','notificar(uuid,text,uuid,text,text,text,uuid)',
    'evaluar_regla(uuid)','evaluar_reglas(uuid,uuid)','stock_fila(uuid,uuid)',
    'stock_mover(uuid,uuid,numeric,text,text,text,text,uuid,boolean)','exigir_disponible(uuid,uuid,numeric)',
    'crear_envio(uuid,uuid,jsonb)','consumir_linea(uuid)','completar_tareas_accion(uuid,text)',
    'generar_tareas_plantilla(uuid,text)','auditar(uuid,text,text,text,jsonb,jsonb)','siguiente_numero_pedido(uuid)',
    'trg_regla_cambio()','trg_nuevo_usuario()','exigir_rol(uuid,text[])']
  loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated, anon', f);
    end if;
  end loop;
end $$;

-- Tiempo real (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      cuentas, pedidos, lineas_pedido, comandas, lineas_comanda, pagos, turnos, tareas, alertas_stock,
      saldos_stock, notificaciones, turnos_caja, gastos_caja, reportes_stock;
  end if;
end $$;

-- ===== supabase/migrations/20261123000004_datos_ejemplo.sql =====
-- Max Pizza · 004 · Datos iniciales y de ejemplo
-- Sedes Principal y El Refugio, catálogo, recetas, reglas de stock bajo, plantillas de checklist y saldos iniciales.
-- Precios y mínimos son de ejemplo: todos se cambian desde Administración.

insert into roles (codigo, nombre, orden) values
  ('admin','Administración',1), ('caja','Caja',2), ('mesero','Mesero',3), ('rapidas','Comidas rápidas',4),
  ('armado','Armado de ruedas',5), ('tortas','Producción de tortas',6), ('insumos','Producción de insumos',7);

insert into permisos (rol, permiso) values
  ('admin','todo'),
  ('caja','cobrar'), ('caja','venta_mostrador'), ('caja','pedido_mesa'), ('caja','horno'), ('caja','base'), ('caja','gastos'),
  ('mesero','pedido_mesa'), ('mesero','entregar'), ('mesero','liberar_mesa'), ('mesero','reportar_stock'), ('mesero','portapizzas'),
  ('rapidas','comandas'), ('rapidas','subir_nevera'),
  ('armado','ruedas'), ('armado','personales'), ('armado','retirar_insumo'),
  ('tortas','tortas'), ('insumos','produccion');

insert into unidades (codigo, nombre) values
  ('ml','mililitros'), ('g','gramos'), ('und','unidades'), ('porcion','porciones'), ('torta','tortas');

insert into insumos (codigo, nombre, unidad, categoria) values
  ('monje','Monjes de masa','und','masa'),
  ('torta_grande','Tortas grandes','torta','produccion'),
  ('torta_pequena','Tortas pequeñas','torta','produccion'),
  ('porc_hawaiana','Porciones Hawaiana','porcion','porciones'),
  ('porc_pepperoni','Porciones Pepperoni','porcion','porciones'),
  ('porc_pollo','Porciones Pollo champiñones','porcion','porciones'),
  ('porc_mexicana','Porciones Mexicana','porcion','porciones'),
  ('pers_hawaiana','Personales Hawaiana','und','porciones'),
  ('pers_pepperoni','Personales Pepperoni','und','porciones'),
  ('pers_pollo','Personales Pollo champiñones','und','porciones'),
  ('pers_mexicana','Personales Mexicana','und','porciones'),
  ('salsa_ajo','Salsa de ajo','ml','produccion'),
  ('salsa_bbq','Salsa BBQ','ml','produccion'),
  ('queso','Queso','g','ingredientes'),
  ('carne_res','Carne de res','porcion','produccion'),
  ('carne_costilla','Costilla','porcion','produccion'),
  ('carne_cerdo','Carne de cerdo','porcion','produccion'),
  ('carne_hamburguesa','Carne de hamburguesa','porcion','produccion'),
  ('papas','Papas','porcion','ingredientes'),
  ('pan_hamburguesa','Pan de hamburguesa','und','ingredientes'),
  ('salchicha','Salchicha','und','ingredientes'),
  ('portapizza','Portapizzas armados','und','empaques'),
  ('carton','Cartones','und','empaques'),
  ('servilletas','Servilletas (paquetes)','und','empaques'),
  ('citronela','Citronela','ml','aseo'),
  ('limpido','Límpido','ml','aseo'),
  ('gaseosa','Gaseosa','und','bebidas'),
  ('jugo','Jugo natural','und','bebidas'),
  ('agua','Agua','und','bebidas');

insert into categorias (nombre, tipo, orden) values
  ('Pizzas','pizza',1), ('Comidas rápidas','rapida',2), ('Bebidas','bebida',3);

insert into categorias_tareas (nombre) values ('Apertura'), ('Limpieza'), ('Reposición'), ('Cierre');

-- Sedes iniciales con su estructura
do $$
declare v uuid; n text; i int;
begin
  foreach n in array array['Sede Principal','El Refugio'] loop
    insert into sedes (nombre) values (n) returning id into v;
    for i in 1..(case when n = 'Sede Principal' then 15 else 10 end) loop
      insert into mesas (sede_id, numero) values (v, i);
    end loop;
    insert into estaciones (sede_id, codigo, nombre) values (v,'horno','Horno (Caja)'), (v,'rapidas','Comidas rápidas');
    insert into ubicaciones_stock (sede_id, codigo, nombre) values
      (v,'produccion','Producción'), (v,'tortas','Tortas'), (v,'armado','Armado'),
      (v,'nevera_rapidas','Nevera comidas rápidas'), (v,'servicio','Servicio y aseo'), (v,'bodega','Bodega');
  end loop;
end $$;

-- Productos, recetas y precios
do $$
declare
  c_pizza uuid := (select id from categorias where nombre = 'Pizzas');
  c_rap   uuid := (select id from categorias where nombre = 'Comidas rápidas');
  c_beb   uuid := (select id from categorias where nombre = 'Bebidas');
  p uuid; r uuid; s record; x record; d text[];
begin
  -- Pizzas: porciones y personales salen de lo armado
  for x in select * from (values
      ('Hawaiana','hawaiana'), ('Pepperoni','pepperoni'), ('Pollo champiñones','pollo'), ('Mexicana','mexicana')) t(nombre, cod) loop
    insert into productos (categoria_id, nombre, formato, estacion) values (c_pizza, 'Porción ' || x.nombre, 'porcion', 'horno') returning id into p;
    insert into recetas (producto_id, version) values (p, 1) returning id into r;
    insert into receta_detalles (receta_id, insumo_id, cantidad, ubicacion)
      values (r, (select id from insumos where codigo = 'porc_' || x.cod), 1, 'armado');
    insert into productos_sede (producto_id, sede_id, precio) select p, id, 7000 from sedes;

    insert into productos (categoria_id, nombre, formato, estacion) values (c_pizza, 'Personal ' || x.nombre, 'personal', 'horno') returning id into p;
    insert into recetas (producto_id, version) values (p, 1) returning id into r;
    insert into receta_detalles (receta_id, insumo_id, cantidad, ubicacion)
      values (r, (select id from insumos where codigo = 'pers_' || x.cod), 1, 'armado');
    insert into productos_sede (producto_id, sede_id, precio) select p, id, 16000 from sedes;

    -- Lo que gasta Armado por cada porción / personal
    insert into receta_armado (resultado_id, insumo_id, cantidad) values
      ((select id from insumos where codigo = 'porc_' || x.cod), (select id from insumos where codigo = 'salsa_ajo'), 10),
      ((select id from insumos where codigo = 'porc_' || x.cod), (select id from insumos where codigo = 'queso'), 40),
      ((select id from insumos where codigo = 'pers_' || x.cod), (select id from insumos where codigo = 'salsa_ajo'), 30),
      ((select id from insumos where codigo = 'pers_' || x.cod), (select id from insumos where codigo = 'queso'), 120);
  end loop;

  -- Comidas rápidas: se consumen de la nevera al preparar
  for x in select * from (values
      ('Hamburguesa', 18000, array['carne_hamburguesa:1','pan_hamburguesa:1','queso:30','salsa_ajo:20','papas:1']),
      ('Picada de res', 22000, array['carne_res:2','papas:1','salsa_bbq:30']),
      ('Costillas BBQ', 28000, array['carne_costilla:2','papas:1','salsa_bbq:40']),
      ('Sándwich de cerdo', 16000, array['carne_cerdo:1','pan_hamburguesa:1','salsa_ajo:20']),
      ('Salchipapa', 14000, array['salchicha:2','papas:1','salsa_ajo:20'])) t(nombre, precio, rec) loop
    insert into productos (categoria_id, nombre, formato, estacion) values (c_rap, x.nombre, 'unidad', 'rapidas') returning id into p;
    insert into recetas (producto_id, version) values (p, 1) returning id into r;
    insert into receta_detalles (receta_id, insumo_id, cantidad, ubicacion)
      select r, (select id from insumos where codigo = split_part(e, ':', 1)), split_part(e, ':', 2)::numeric, 'nevera_rapidas'
      from unnest(x.rec) e;
    insert into productos_sede (producto_id, sede_id, precio) select p, id, x.precio from sedes;
  end loop;

  -- Bebidas: salen de bodega al enviar
  for x in select * from (values ('Gaseosa', 4000, 'gaseosa'), ('Jugo natural', 6000, 'jugo'), ('Agua', 3000, 'agua')) t(nombre, precio, cod) loop
    insert into productos (categoria_id, nombre, formato, estacion) values (c_beb, x.nombre, 'unidad', 'ninguna') returning id into p;
    insert into recetas (producto_id, version) values (p, 1) returning id into r;
    insert into receta_detalles (receta_id, insumo_id, cantidad, ubicacion)
      values (r, (select id from insumos where codigo = x.cod), 1, 'bodega');
    insert into productos_sede (producto_id, sede_id, precio) select p, id, x.precio from sedes;
  end loop;
end $$;

-- Saldos iniciales (antes de las reglas, para que no nazcan alertas falsas)
do $$
declare s uuid; x record;
begin
  for s in select id from sedes loop
    for x in select * from (values
      ('tortas','monje',30), ('tortas','torta_grande',20), ('tortas','torta_pequena',15),
      ('armado','porc_hawaiana',16), ('armado','porc_pepperoni',16), ('armado','porc_pollo',12), ('armado','porc_mexicana',12),
      ('armado','pers_hawaiana',4), ('armado','pers_pepperoni',4), ('armado','pers_pollo',3), ('armado','pers_mexicana',3),
      ('armado','salsa_ajo',2000), ('armado','queso',5000),
      ('produccion','carne_res',100), ('produccion','carne_hamburguesa',12), ('produccion','carne_costilla',30),
      ('produccion','carne_cerdo',30), ('produccion','salsa_ajo',4000), ('produccion','salsa_bbq',3000),
      ('nevera_rapidas','carne_res',20), ('nevera_rapidas','carne_hamburguesa',15), ('nevera_rapidas','carne_costilla',10),
      ('nevera_rapidas','carne_cerdo',10), ('nevera_rapidas','salsa_ajo',1500), ('nevera_rapidas','salsa_bbq',1500),
      ('nevera_rapidas','queso',3000), ('nevera_rapidas','papas',40), ('nevera_rapidas','pan_hamburguesa',30),
      ('nevera_rapidas','salchicha',40),
      ('servicio','portapizza',60), ('servicio','carton',80), ('servicio','servilletas',20),
      ('servicio','citronela',3000), ('servicio','limpido',4000),
      ('bodega','gaseosa',48), ('bodega','jugo',20), ('bodega','agua',24)
    ) t(ubic, ins, cant) loop
      perform stock_mover(ubicacion_id(s, x.ubic), (select id from insumos where codigo = x.ins), x.cant,
                          'ajuste', 'Saldo inicial', 'inicial', null);
    end loop;
  end loop;
end $$;

-- Reglas de stock bajo (las del documento) para cada sede
do $$
declare s uuid; x record;
begin
  for s in select id from sedes loop
    for x in select * from (values
      ('produccion','carne_res',          50, 'insumos','alta', 'Preparar carne de res',          'produccion:carne_res'),
      ('produccion','carne_hamburguesa',   7, 'insumos','alta', 'Preparar carne de hamburguesa',  'produccion:carne_hamburguesa'),
      ('produccion','carne_costilla',     10, 'insumos','media','Preparar costilla',              'produccion:carne_costilla'),
      ('produccion','carne_cerdo',        10, 'insumos','media','Preparar carne de cerdo',        'produccion:carne_cerdo'),
      ('produccion','salsa_ajo',        1000, 'insumos','alta', 'Hacer salsa de ajo',             'produccion:salsa_ajo'),
      ('produccion','salsa_bbq',        1000, 'insumos','media','Hacer salsa BBQ',                'produccion:salsa_bbq'),
      ('nevera_rapidas','carne_res',       5, 'rapidas','alta', 'Traer carne de res',             'subir_nevera:carne_res'),
      ('nevera_rapidas','carne_hamburguesa',5,'rapidas','alta', 'Traer carne de hamburguesa',     'subir_nevera:carne_hamburguesa'),
      ('nevera_rapidas','salsa_ajo',     300, 'rapidas','media','Traer salsa de ajo',             'subir_nevera:salsa_ajo'),
      ('armado','salsa_ajo',             500, 'armado', 'alta', 'Traer salsa de ajo',             'retirar:salsa_ajo'),
      ('armado','porc_hawaiana',           5, 'armado', 'alta', 'Armar Hawaiana',                 'rueda:porc_hawaiana'),
      ('armado','porc_pepperoni',          5, 'armado', 'alta', 'Armar Pepperoni',                'rueda:porc_pepperoni'),
      ('armado','porc_pollo',              5, 'armado', 'alta', 'Armar Pollo champiñones',        'rueda:porc_pollo'),
      ('armado','porc_mexicana',           5, 'armado', 'alta', 'Armar Mexicana',                 'rueda:porc_mexicana'),
      ('tortas','torta_grande',            8, 'tortas', 'alta', 'Reponer tortas grandes',         'tortas'),
      ('tortas','torta_pequena',           6, 'tortas', 'media','Reponer tortas pequeñas',        'tortas'),
      ('servicio','portapizza',           30, 'mesero', 'media','Armar portapizzas',              'portapizzas'),
      ('servicio','carton',               20, 'admin',  'alta', 'Comprar cartones',               'compra:carton'),
      ('servicio','citronela',           500, 'admin',  'media','Revisar compra · Citronela',     'compra:citronela')
    ) t(ubic, ins, minimo, rol, prio, texto, accion) loop
      insert into reglas_stock (sede_id, ubicacion_id, insumo_id, minimo, rol_destino, prioridad, texto, accion)
      values (s, ubicacion_id(s, x.ubic), (select id from insumos where codigo = x.ins), x.minimo, x.rol, x.prio, x.texto, x.accion);
    end loop;
  end loop;
end $$;

-- Plantillas de checklist por rol (se crean al iniciar turno)
insert into plantillas_checklist (rol, categoria_id, titulo, prioridad, accion, orden)
select x.rol, (select id from categorias_tareas where nombre = x.cat), x.titulo, x.prio, x.accion, x.orden
from (values
  ('caja','Apertura','Registrar base','alta','registrar_base',1),
  ('caja','Apertura','Revisar sencillo para cambio','media',null,2),
  ('caja','Cierre','Cuadrar caja al cierre','alta',null,3),
  ('mesero','Apertura','Organizar y limpiar mesas','alta',null,1),
  ('mesero','Apertura','Revisar servilletas y salseros','media',null,2),
  ('mesero','Cierre','Recoger fichas de mesa','baja',null,3),
  ('rapidas','Apertura','Revisar nevera','alta',null,1),
  ('rapidas','Limpieza','Limpiar plancha y freidora','media',null,2),
  ('armado','Apertura','Revisar ingredientes de armado','alta',null,1),
  ('armado','Limpieza','Limpiar mesa de armado','baja',null,2),
  ('tortas','Apertura','Recibir y contar monjes','alta',null,1),
  ('tortas','Limpieza','Limpiar área de tortas','baja',null,2),
  ('insumos','Apertura','Revisar stock de salsas y carnes','alta',null,1),
  ('insumos','Limpieza','Limpiar cocina de producción','baja',null,2)
) x(rol, cat, titulo, prio, accion, orden);

-- Proveedores de ejemplo
insert into proveedores (nombre, whatsapp, dias_entrega, condiciones) values
  ('Empaques (ejemplo)', '573000000001', 'Lunes y jueves', 'Contraentrega'),
  ('Aseo (ejemplo)', '573000000002', 'Martes', 'Crédito 15 días'),
  ('Carnes (ejemplo)', '573000000003', 'Todos los días', 'Contado');
insert into proveedor_insumos (proveedor_id, insumo_id, precio)
select p.id, i.id, x.precio from (values
  ('Empaques (ejemplo)','carton',900), ('Empaques (ejemplo)','servilletas',4500),
  ('Aseo (ejemplo)','citronela',12), ('Aseo (ejemplo)','limpido',6),
  ('Carnes (ejemplo)','carne_res',3500), ('Carnes (ejemplo)','carne_hamburguesa',3000)
) x(prov, ins, precio) join proveedores p on p.nombre = x.prov join insumos i on i.codigo = x.ins;


-- ===== supabase/migrations/20261123000005_permisos_api.sql =====
-- Max Pizza · 005 · Permisos de la API para usuarios con sesión
-- Los proyectos nuevos de Supabase no exponen las tablas solas: hay que darlas explícitamente.
-- Igual manda RLS (003): esto solo abre la puerta; las políticas deciden qué filas ve y cambia cada quien.

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Configuración que Administración edita directo (RLS solo deja a Administración)
grant insert, update, delete on
  sedes, mesas, estaciones, ubicaciones_stock, categorias, insumos, productos, receta_armado, reglas_stock,
  plantillas_checklist, categorias_tareas, proveedores, proveedor_insumos, accesos_sede, unidades
to authenticated;
grant update on perfiles, notificaciones to authenticated;
grant insert on productos_sede to authenticated;

-- Funciones: todas las de negocio se pueden llamar; las internas quedan bloqueadas otra vez
grant execute on all functions in schema public to authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'op_iniciar(uuid,text)','op_terminar(uuid,jsonb)','notificar(uuid,text,uuid,text,text,text,uuid)',
    'evaluar_regla(uuid)','evaluar_reglas(uuid,uuid)','stock_fila(uuid,uuid)',
    'stock_mover(uuid,uuid,numeric,text,text,text,text,uuid,boolean)','exigir_disponible(uuid,uuid,numeric)',
    'crear_envio(uuid,uuid,jsonb)','consumir_linea(uuid)','completar_tareas_accion(uuid,text)',
    'generar_tareas_plantilla(uuid,text)','auditar(uuid,text,text,text,jsonb,jsonb)','siguiente_numero_pedido(uuid)',
    'trg_regla_cambio()','trg_nuevo_usuario()','exigir_rol(uuid,text[])']
  loop
    execute format('revoke execute on function %s from public, authenticated, anon', f);
  end loop;
end $$;

-- Lo que se cree después también queda disponible
alter default privileges in schema public grant select on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- ===== supabase/migrations/20261123000006_tareas_reposicion.sql =====
-- Max Pizza · 006 · Cierre de tareas de reposición
-- 1) Cuando el área repone el stock (traslado, rueda, tortas...), su tarea queda lista aunque estuviera en proceso.
-- 2) Si alguien marca lista una reposición y el stock sigue bajo, nace una sola reposición pendiente nueva.

create or replace function evaluar_regla(p_regla uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r reglas_stock;
  v_saldo numeric;
  v_unidad text;
  v_insumo text;
  a alertas_stock;
  t tareas;
  v_detalle text;
begin
  select * into r from reglas_stock where id = p_regla;
  if not found then return; end if;

  select coalesce(s.fisico - s.reservado, 0) into v_saldo
    from saldos_stock s where s.ubicacion_id = r.ubicacion_id and s.insumo_id = r.insumo_id;
  v_saldo := coalesce(v_saldo, 0);
  select i.unidad, i.nombre into v_unidad, v_insumo from insumos i where i.id = r.insumo_id;
  v_detalle := format('Quedan %s %s · mínimo %s', fmt_cant(v_saldo), v_unidad, fmt_cant(r.minimo));

  select * into a from alertas_stock where regla_id = r.id and estado = 'activa' for update;
  select * into t from tareas where regla_id = r.id and estado in ('pendiente','en_proceso') for update;

  if r.activa and v_saldo <= r.minimo then
    -- Alerta: una sola activa; si el saldo sigue bajando se actualiza la misma
    if a.id is null then
      insert into alertas_stock (regla_id, sede_id, saldo) values (r.id, r.sede_id, v_saldo) returning * into a;
      perform notificar(r.sede_id, 'admin', null, 'stock_bajo', 'Stock bajo · ' || v_insumo, v_detalle, a.id);
      perform notificar(r.sede_id, r.rol_destino, r.responsable_id, 'tarea', r.texto, v_detalle, a.id);
    else
      update alertas_stock set saldo = v_saldo, actualizada = now() where id = a.id;
    end if;
    -- Tarea: un solo pendiente de reposición por regla
    if t.id is null then
      insert into tareas (sede_id, rol, asignada_a, titulo, detalle, prioridad, origen, accion, regla_id, alerta_id)
      values (r.sede_id, r.rol_destino, r.responsable_id, r.texto, v_detalle, r.prioridad, 'automatica', r.accion, r.id, a.id)
      returning * into t;
      insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'creada', v_detalle, auth.uid());
    else
      update tareas set detalle = v_detalle, alerta_id = a.id, prioridad = r.prioridad, titulo = r.texto,
        rol = case when estado = 'pendiente' then r.rol_destino else rol end,
        asignada_a = case when estado = 'pendiente' then r.responsable_id else asignada_a end
      where id = t.id;
    end if;
  else
    -- Repuesto (o regla pausada): se cierra la alerta
    if a.id is not null then
      update alertas_stock set estado = 'cerrada', saldo = v_saldo, cerrada_en = now(), actualizada = now() where id = a.id;
    end if;
    -- Si quien repuso es del área, la tarea (pendiente o en proceso) queda lista a su nombre.
    -- Si repuso alguien de otra área: la pendiente se archiva y la que está en proceso no se toca.
    if t.id is not null then
      if auth.uid() is not null and exists (
           select 1 from accesos_sede x where x.perfil_id = auth.uid() and x.sede_id = r.sede_id and x.rol = t.rol) then
        update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(), detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'lista', 'Stock repuesto', auth.uid());
      elsif t.estado = 'pendiente' then
        update tareas set estado = 'archivada', detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'archivada', 'Stock repuesto', auth.uid());
      end if;
    end if;
  end if;
end $$;


create or replace function tarea_completar(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir(found, 'La tarea no existe');
  perform exigir_rol(t.sede_id, array[t.rol]);
  if t.estado in ('lista','archivada') then return; end if;
  update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(),
    tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now())
  where id = p_tarea;
  insert into historial_tareas (tarea_id, evento, perfil_id) values (p_tarea, 'lista', auth.uid());
  -- Si era una reposición automática y el stock sigue bajo, queda una sola reposición pendiente nueva
  if t.regla_id is not null then perform evaluar_regla(t.regla_id); end if;
end $$;

-- ===== supabase/migrations/20261123000007_tiempo_real_reglas.sql =====
-- Max Pizza · 007 · Tiempo real también para reglas y alertas de stock (Administración y pantallas de stock)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reglas_stock') then
    alter publication supabase_realtime add table reglas_stock;
  end if;
end $$;

-- ===== supabase/migrations/20261123000008_administracion.sql =====
-- Max Pizza · 008 · Administración
-- Usuarios desde la app (sin clave secreta), historial de precios automático, conteos revisables, análisis de consumo.

-- ───────── Equipo: crear usuarios, cambiar clave, activar/desactivar ─────────
create or replace function admin_crear_usuario(p_correo text, p_clave text, p_nombre text, p_accesos jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid; v_correo text := lower(trim(p_correo)); a jsonb;
begin
  perform exigir(es_admin(), 'Solo Administración crea usuarios');
  perform exigir(v_correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Correo inválido');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  perform exigir(length(trim(coalesce(p_nombre,''))) > 1, 'Escribe el nombre');
  perform exigir(not exists (select 1 from auth.users where lower(email) = v_correo), 'Ya existe un usuario con ese correo');
  v := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', v_correo,
    crypt(p_clave, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nombre', trim(p_nombre)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', v_correo, 'email_verified', true), 'email', now(), now(), now());
  insert into perfiles (id, nombre, correo) values (v, trim(p_nombre), v_correo) on conflict (id) do update set nombre = excluded.nombre;
  for a in select * from jsonb_array_elements(coalesce(p_accesos, '[]')) loop
    insert into accesos_sede (perfil_id, sede_id, rol) values (v, (a->>'sede_id')::uuid, a->>'rol') on conflict do nothing;
  end loop;
  perform auditar(null, 'crear_usuario', 'perfiles', v::text, null, jsonb_build_object('correo', v_correo, 'accesos', p_accesos));
  return v;
end $$;

create or replace function admin_cambiar_clave(p_perfil uuid, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir(es_admin(), 'Solo Administración restablece accesos');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')), updated_at = now() where id = p_perfil;
  perform auditar(null, 'cambiar_clave', 'perfiles', p_perfil::text, null, null);
end $$;

create or replace function admin_activar_usuario(p_perfil uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración activa o desactiva cuentas');
  perform exigir(p_perfil <> auth.uid() or p_activo, 'No puedes desactivar tu propia cuenta');
  update perfiles set activo = p_activo where id = p_perfil;
  update auth.users set banned_until = case when p_activo then null else 'infinity'::timestamptz end where id = p_perfil;
  if not p_activo then update turnos set fin = now() where perfil_id = p_perfil and fin is null; end if;
  perform auditar(null, case when p_activo then 'activar_usuario' else 'desactivar_usuario' end, 'perfiles', p_perfil::text, null, null);
end $$;

-- ───────── Precios: el historial se guarda solo, con cualquier cambio ─────────
create or replace function trg_precio_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.precio is distinct from old.precio then
    insert into precios_historial (producto_id, sede_id, precio_ant, precio_nuevo, perfil_id)
    values (new.producto_id, new.sede_id, case when tg_op = 'UPDATE' then old.precio end, new.precio, auth.uid());
    perform auditar(new.sede_id, 'cambiar_precio', 'productos_sede', new.producto_id::text,
      case when tg_op = 'UPDATE' then jsonb_build_object('precio', old.precio) end, jsonb_build_object('precio', new.precio));
  end if;
  return new;
end $$;
create trigger productos_sede_historial after insert or update on productos_sede
  for each row execute function trg_precio_historial();

create or replace function cambiar_precio(p_producto uuid, p_sede uuid, p_precio numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración puede cambiar precios');
  perform exigir(p_precio >= 0, 'Precio inválido');
  insert into productos_sede (producto_id, sede_id, precio) values (p_producto, p_sede, p_precio)
  on conflict (producto_id, sede_id) do update set precio = excluded.precio;
end $$;

create policy admin_edita on productos_sede for update to authenticated using (es_admin()) with check (es_admin());
create policy admin_revisa on reportes_stock for update to authenticated using (es_admin()) with check (es_admin());
grant update on productos_sede, reportes_stock to authenticated;

-- ───────── Merma con cantidad (para el análisis) ─────────
alter table movimientos_stock add column if not exists cantidad_ref numeric(14,3);

create or replace function cancelar_linea(p_linea uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare lp lineas_pedido; c cuentas; r reservas_stock; m record; v_com uuid;
begin
  select * into lp from lineas_pedido where id = p_linea for update;
  perform exigir(found, 'La línea no existe');
  select * into c from cuentas where id = lp.cuenta_id for update;
  perform exigir_rol(c.sede_id, array['mesero','caja']);
  perform exigir(c.estado = 'abierta', 'Solo se cancela en cuentas abiertas');
  if lp.estado = 'cancelada' then return; end if;

  for r in select * from reservas_stock where linea_pedido_id = p_linea and estado = 'activa' for update loop
    update saldos_stock set reservado = reservado - r.cantidad where ubicacion_id = r.ubicacion_id and insumo_id = r.insumo_id;
    update reservas_stock set estado = 'liberada' where id = r.id;
    perform evaluar_reglas(r.ubicacion_id, r.insumo_id);
  end loop;
  -- Ya usada: lo consumido se reclasifica como merma (no cambia la existencia física)
  for m in select ubicacion_id, insumo_id, sum(-cantidad) q from movimientos_stock
           where ref_tipo = 'linea_pedido' and ref_id = p_linea::text and tipo in ('venta','consumo')
           group by ubicacion_id, insumo_id loop
    insert into movimientos_stock (sede_id, insumo_id, ubicacion_id, cantidad, cantidad_ref, tipo, motivo, ref_tipo, ref_id, perfil_id)
    values (c.sede_id, m.insumo_id, m.ubicacion_id, 0, m.q, 'merma',
            format('Cancelada después de preparar (%s): %s', fmt_cant(m.q), coalesce(p_motivo,'')), 'linea_pedido', p_linea::text, auth.uid());
  end loop;

  update lineas_pedido set estado = 'cancelada' where id = p_linea;
  update lineas_comanda set cancelada = true where linea_pedido_id = p_linea returning comanda_id into v_com;
  if v_com is not null and not exists (select 1 from lineas_comanda where comanda_id = v_com and not cancelada) then
    update comandas set estado = 'cancelada' where id = v_com;
  end if;
  if v_com is not null then
    insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
    values ('linea_comanda', p_linea, 'activa', 'cancelada', auth.uid());
  end if;
  update cuentas set total = total - lp.cantidad * lp.precio_unit where id = c.id;
  perform auditar(c.sede_id, 'cancelar_linea', 'lineas_pedido', p_linea::text, to_jsonb(lp), jsonb_build_object('motivo', p_motivo));
end $$;

-- ───────── Análisis: consumo por categoría e insumo ─────────
create or replace function analisis_consumo(p_sede uuid default null, p_dias int default 7)
returns table (sede text, categoria text, insumo text, unidad text, usado numeric, merma numeric, existencia numeric)
language sql stable security definer set search_path = public as $$
  with m as (
    select ms.sede_id, ms.insumo_id,
      sum(case when ms.tipo in ('venta','consumo') then -ms.cantidad else 0 end) usado,
      sum(case when ms.tipo = 'merma' then coalesce(ms.cantidad_ref, -ms.cantidad)
               when ms.tipo = 'ajuste' and ms.cantidad < 0 and ms.motivo ilike 'merma%' then -ms.cantidad else 0 end) merma
    from movimientos_stock ms
    where ms.creado_en >= now() - make_interval(days => p_dias)
      and (p_sede is null or ms.sede_id = p_sede)
    group by ms.sede_id, ms.insumo_id
  ), e as (
    select sede_id, insumo_id, sum(fisico) existencia from saldos_stock
    where (p_sede is null or sede_id = p_sede) group by sede_id, insumo_id
  )
  select s.nombre, i.categoria, i.nombre, i.unidad, coalesce(m.usado, 0), coalesce(m.merma, 0), coalesce(e.existencia, 0)
  from e join insumos i on i.id = e.insumo_id join sedes s on s.id = e.sede_id
  left join m on m.sede_id = e.sede_id and m.insumo_id = e.insumo_id
  where es_admin()
  order by i.categoria, i.nombre, s.nombre
$$;

-- Las de Administración se pueden llamar (cada una revisa es_admin); el disparador no.
grant execute on function admin_crear_usuario(text,text,text,jsonb), admin_cambiar_clave(uuid,text),
  admin_activar_usuario(uuid,boolean), analisis_consumo(uuid,int), cancelar_linea(uuid,text) to authenticated;
revoke execute on function trg_precio_historial() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function trg_precio_historial() from authenticated, anon;
  end if;
end $$;

-- Compras: Administración guarda historial de precios del proveedor y puede anular órdenes
create policy admin_escribe on proveedor_precios_historial for insert to authenticated with check (es_admin());
create policy admin_edita on ordenes_compra for update to authenticated using (es_admin()) with check (es_admin());
grant insert on proveedor_precios_historial to authenticated;
grant update on ordenes_compra to authenticated;
