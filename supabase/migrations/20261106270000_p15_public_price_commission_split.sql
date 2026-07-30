-- =============================================================================
-- P15: All-In commission is a percentage of the public ticket price
-- =============================================================================
-- profiles.service_charge_rate remains the source of truth. Existing RPCs
-- already load it with coalesce(service_charge_rate, 0.15); redefining these
-- helpers keeps event creation/editing and checkout calculations aligned.

create or replace function public.all_in_public_price(
  p_base numeric,
  p_rate numeric default 0.15
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce(p_base, 0)
      / (
        1
        - greatest(0, least(0.9999, coalesce(p_rate, 0.15)))
      ),
    2
  );
$$;

create or replace function public.all_in_platform_fee(
  p_base numeric,
  p_rate numeric default 0.15
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    public.all_in_public_price(p_base, p_rate) - coalesce(p_base, 0),
    2
  );
$$;

comment on column public.profiles.service_charge_rate is
  'Porcentaje retenido por Tokepass sobre el precio público All-In (0.15 = 15%).';

comment on function public.all_in_public_price(numeric, numeric) is
  'Reconstruye el precio público desde el neto: neto / (1 - rate).';

comment on function public.all_in_platform_fee(numeric, numeric) is
  'Comisión incluida en el precio público: público - neto.';
