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

