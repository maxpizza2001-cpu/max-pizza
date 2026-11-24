-- Max Pizza · 007 · Tiempo real también para reglas y alertas de stock (Administración y pantallas de stock)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reglas_stock') then
    alter publication supabase_realtime add table reglas_stock;
  end if;
end $$;
