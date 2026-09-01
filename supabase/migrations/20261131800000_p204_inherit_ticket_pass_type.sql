-- P204 · tickets.ticket_type hereda el tipo del tier padre.
-- P80/claim_and_reserve omitían la columna y el default era admission,
-- así los extras (tier_type=addon / ticket_type=extra) quedaban como ingreso.

create or replace function public.resolve_ticket_pass_type(
  p_tier_type text,
  p_ticket_type text,
  p_category text,
  p_name text
)
returns text
language plpgsql
immutable
as $$
declare
  v_tier text := lower(btrim(coalesce(p_tier_type, '')));
  v_kind text := lower(btrim(coalesce(p_ticket_type, '')));
  v_cat text := lower(btrim(coalesce(p_category, '')));
  v_name text := lower(btrim(coalesce(p_name, '')));
begin
  if v_kind = 'parking'
     or v_cat = 'parking'
     or v_name ~* '(estacionamiento|parking|cochera)' then
    return 'parking';
  end if;

  if v_tier = 'addon'
     or v_kind in ('extra', 'access_pass')
     or v_cat in ('special', 'addon', 'access_pass') then
    return 'access_pass';
  end if;

  return 'admission';
end;
$$;

comment on function public.resolve_ticket_pass_type(text, text, text, text) is
  'Mapea ticket_tiers (addon/extra/parking) a tickets.ticket_type (admission|parking|access_pass).';

create or replace function public.inherit_ticket_pass_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_tier record;
begin
  if new.tier_id is null then
    return new;
  end if;

  select
    tt.tier_type,
    tt.ticket_type,
    tt.category,
    tt.name
  into v_tier
  from public.ticket_tiers as tt
  where tt.id = new.tier_id;

  if not found then
    return new;
  end if;

  new.ticket_type := public.resolve_ticket_pass_type(
    v_tier.tier_type,
    v_tier.ticket_type,
    v_tier.category,
    v_tier.name
  );
  return new;
end;
$$;

drop trigger if exists tickets_inherit_pass_type on public.tickets;
create trigger tickets_inherit_pass_type
before insert or update of tier_id on public.tickets
for each row
execute function public.inherit_ticket_pass_type();

update public.tickets as t
set ticket_type = public.resolve_ticket_pass_type(
  tt.tier_type,
  tt.ticket_type,
  tt.category,
  tt.name
)
from public.ticket_tiers as tt
where t.tier_id = tt.id
  and coalesce(t.ticket_type, 'admission') = 'admission'
  and public.resolve_ticket_pass_type(
    tt.tier_type,
    tt.ticket_type,
    tt.category,
    tt.name
  ) is distinct from 'admission';
