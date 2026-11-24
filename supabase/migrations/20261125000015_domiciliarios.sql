-- Max Pizza · 015 · Domiciliarios: ven los domicilios confirmados y el primero que toca "Yo lo llevo" se lo queda.

insert into roles (codigo, nombre, orden) values ('domiciliario', 'Domiciliario', 8) on conflict (codigo) do nothing;
insert into permisos (rol, permiso) values ('domiciliario', 'domicilios') on conflict do nothing;

alter table pedidos_online add column if not exists domiciliario_id uuid references perfiles(id);
alter table pedidos_online add column if not exists tomado_en timestamptz;

-- "Yo lo llevo": atómico. Si dos tocan a la vez, solo uno gana; al otro le dice quién lo tomó.
create or replace function domicilio_tomar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare po pedidos_online; v_nombre text;
begin
  select * into po from pedidos_online where id = p_id;
  perform exigir(found, 'El pedido no existe');
  perform exigir_rol(po.sede_id, array['domiciliario']);
  select nombre into v_nombre from perfiles where id = auth.uid();
  update pedidos_online set domiciliario_id = auth.uid(), domiciliario = v_nombre, tomado_en = now()
   where id = p_id and domiciliario_id is null and entrega = 'domicilio'
     and estado in ('confirmado','en_preparacion','listo')
  returning * into po;
  if not found then
    select * into po from pedidos_online where id = p_id;
    if po.domiciliario_id = auth.uid() then return jsonb_build_object('ok', true); end if;
    perform exigir(false, case when po.domiciliario is not null then 'Ya lo tomó ' || po.domiciliario
                               else 'Este pedido ya no está disponible' end);
  end if;
  insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id) values ('domicilio', p_id, null, 'tomado', auth.uid());
  perform notificar(po.sede_id, 'caja', null, 'domicilio', '🛵 ' || v_nombre || ' lleva el pedido ' || po.codigo, po.barrio, po.id);
  return jsonb_build_object('ok', true);
end $$;

-- Soltar (solo quien lo tomó y antes de salir)
create or replace function domicilio_soltar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare po pedidos_online;
begin
  select * into po from pedidos_online where id = p_id for update;
  perform exigir(found and po.domiciliario_id = auth.uid(), 'Este pedido no es tuyo');
  perform exigir(po.estado in ('confirmado','en_preparacion','listo'), 'Ya saliste con este pedido');
  update pedidos_online set domiciliario_id = null, domiciliario = null, tomado_en = null where id = p_id;
  insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id) values ('domicilio', p_id, 'tomado', 'soltado', auth.uid());
end $$;

-- El domiciliario sale (con el pedido listo) y lo entrega
create or replace function domicilio_avanzar(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare po pedidos_online;
begin
  select * into po from pedidos_online where id = p_id for update;
  perform exigir(found and po.domiciliario_id = auth.uid(), 'Este pedido no es tuyo');
  perform exigir_rol(po.sede_id, array['domiciliario']);
  if po.estado = p_estado then return; end if;
  perform exigir((p_estado = 'en_camino' and po.estado = 'listo') or (p_estado = 'entregado' and po.estado = 'en_camino'),
    case when p_estado = 'en_camino' then 'Espera a que el pedido esté listo' else 'Primero marca que saliste' end);
  update pedidos_online set estado = p_estado,
    salio_en = case when p_estado = 'en_camino' then now() else salio_en end,
    entregado_en = case when p_estado = 'entregado' then now() else entregado_en end
  where id = p_id;
  if p_estado = 'entregado' then
    perform notificar(po.sede_id, 'caja', null, 'domicilio', '✅ Entregado ' || po.codigo || ' · ' || coalesce(po.domiciliario, ''),
      case when po.medio = 'efectivo' then 'Trae el efectivo: $' || to_char(po.total, 'FM999G999G999') end, po.id);
  end if;
end $$;

-- Aviso a los domiciliarios cuando Caja confirma un domicilio
create or replace function trg_domicilio_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entrega = 'domicilio' and new.domiciliario_id is null and new.estado = 'confirmado' and old.estado = 'recibido' then
    perform notificar(new.sede_id, 'domiciliario', null, 'domicilio', '🛵 Domicilio disponible · ' || coalesce(new.barrio, ''),
      '$' || to_char(new.total, 'FM999G999G999'), new.id);
  end if;
  return new;
end $$;
drop trigger if exists pedidos_online_aviso on pedidos_online;
create trigger pedidos_online_aviso after update of estado on pedidos_online for each row execute function trg_domicilio_aviso();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function domicilio_tomar(uuid), domicilio_soltar(uuid), domicilio_avanzar(uuid, text) to authenticated;
  end if;
end $$;
