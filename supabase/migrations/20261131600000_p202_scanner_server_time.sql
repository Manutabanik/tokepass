-- P202 · Hora de pared de Postgres para alinear el reloj del escáner.
-- clock_timestamp() (no now() transaccional) para no heredar el start de un RPC largo.

create or replace function public.scanner_server_time()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

comment on function public.scanner_server_time() is
  'Epoch ms de la DB. El escáner online alinea su reloj interno para Living QR de 30s.';

revoke all on function public.scanner_server_time() from public;
grant execute on function public.scanner_server_time()
  to anon, authenticated, service_role;
