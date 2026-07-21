-- =============================================================================
-- Tokepass · Sistema RRPP (Relacionistas Públicos)
-- Evoluciona `promoters` de alcance por-evento → por-organizador con referral_code.
-- Nota: 00008 ya existe (storage); este archivo es 00009.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Evolucionar tabla promoters
-- -----------------------------------------------------------------------------

drop policy if exists "promoters_select_related" on public.promoters;
drop policy if exists "promoters_manage_owner_or_super_admin" on public.promoters;
drop policy if exists "promoters_update_owner_or_super_admin" on public.promoters;
drop policy if exists "promoters_delete_owner_or_super_admin" on public.promoters;

alter table public.promoters
  add column if not exists organizer_id uuid references public.profiles(id) on delete cascade,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists name text,
  add column if not exists commission_rate numeric(5, 4),
  add column if not exists referral_code text;

-- Backfill desde el esquema legado (event_id / profile_id / commission_percentage / custom_link)
-- Nota: en UPDATE ... FROM de Postgres, la tabla destino no puede referenciarse
-- en el ON de un JOIN; las condiciones van en el WHERE.
update public.promoters as p
set
  organizer_id = coalesce(p.organizer_id, e.organizer_id),
  user_id = coalesce(p.user_id, p.profile_id),
  name = coalesce(
    nullif(btrim(p.name), ''),
    nullif(btrim(pr.full_name), ''),
    'Promotor'
  ),
  commission_rate = coalesce(
    p.commission_rate,
    least(1::numeric, greatest(0::numeric, p.commission_percentage / 100.0))
  ),
  referral_code = coalesce(
    nullif(btrim(p.referral_code), ''),
    upper(regexp_replace(coalesce(p.custom_link, p.id::text), '[^a-zA-Z0-9]+', '-', 'g'))
  )
from public.events as e,
     public.profiles as pr
where e.id = p.event_id
  and pr.id = p.profile_id;

-- Filas huérfanas (sin evento): usar profile_id como organizer
update public.promoters
set
  organizer_id = coalesce(organizer_id, profile_id),
  user_id = coalesce(user_id, profile_id),
  name = coalesce(nullif(btrim(name), ''), 'Promotor'),
  commission_rate = coalesce(commission_rate, 0.10),
  referral_code = coalesce(
    nullif(btrim(referral_code), ''),
    'RRPP-' || upper(substr(replace(id::text, '-', ''), 1, 8))
  )
where organizer_id is null
   or name is null
   or commission_rate is null
   or referral_code is null;

-- Unicidad de referral_code (resolver colisiones antes del unique)
do $$
declare
  r record;
  v_code text;
  v_n integer;
begin
  for r in
    select id, referral_code
    from public.promoters
    order by created_at
  loop
    v_code := upper(r.referral_code);
    v_n := 0;
    while exists (
      select 1
      from public.promoters
      where upper(referral_code) = v_code
        and id <> r.id
    ) loop
      v_n := v_n + 1;
      v_code := upper(r.referral_code) || '-' || v_n::text;
    end loop;

    update public.promoters
    set referral_code = v_code
    where id = r.id;
  end loop;
end;
$$;

alter table public.promoters
  alter column organizer_id set not null,
  alter column name set not null,
  alter column commission_rate set not null,
  alter column referral_code set not null;

alter table public.promoters
  drop constraint if exists promoters_event_profile_key;

alter table public.promoters
  drop constraint if exists promoters_commission_percentage_check;

alter table public.promoters
  drop constraint if exists promoters_custom_link_key;

drop index if exists public.promoters_event_id_idx;
drop index if exists public.promoters_profile_id_idx;

alter table public.promoters
  drop column if exists event_id,
  drop column if exists profile_id,
  drop column if exists commission_percentage,
  drop column if exists custom_link;

alter table public.promoters
  drop constraint if exists promoters_commission_rate_check;

alter table public.promoters
  add constraint promoters_commission_rate_check
  check (commission_rate >= 0 and commission_rate <= 1);

create unique index if not exists promoters_referral_code_key
  on public.promoters (upper(referral_code));

create index if not exists promoters_organizer_id_idx
  on public.promoters (organizer_id);

create index if not exists promoters_user_id_idx
  on public.promoters (user_id);

comment on table public.promoters is
  'RRPP del organizador: link de ventas (?ref=CODE) y comisión sobre órdenes paid.';

comment on column public.promoters.commission_rate is
  'Fracción decimal (0.10 = 10%).';

comment on column public.promoters.referral_code is
  'Código único compartible, ej. TOMAS-VIP.';

-- orders.promoter_id ya existe desde 00003; asegurar índice
create index if not exists orders_promoter_id_idx
  on public.orders (promoter_id);

-- -----------------------------------------------------------------------------
-- 2) Validación: el promoter debe pertenecer al organizador del evento
-- -----------------------------------------------------------------------------

create or replace function public.validate_ticket_relations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_related_event_id uuid;
  v_order_buyer_id uuid;
  v_promoter_organizer_id uuid;
  v_event_organizer_id uuid;
  v_seat_status public.seat_status;
begin
  select tt.event_id
    into v_related_event_id
  from public.ticket_tiers as tt
  where tt.id = new.tier_id;

  if v_related_event_id is distinct from new.event_id then
    raise exception 'Ticket tier does not belong to the selected event'
      using errcode = '23514';
  end if;

  if new.seat_id is not null then
    select ez.event_id, s.status
      into v_related_event_id, v_seat_status
    from public.seats as s
    join public.event_zones as ez on ez.id = s.zone_id
    where s.id = new.seat_id
    for update of s;

    if v_related_event_id is distinct from new.event_id then
      raise exception 'Seat does not belong to the selected event'
        using errcode = '23514';
    end if;

    if v_seat_status = 'sold'::public.seat_status
       and (tg_op = 'INSERT' or old.seat_id is distinct from new.seat_id) then
      raise exception 'Seat is already sold'
        using errcode = '23505';
    end if;
  end if;

  if new.order_id is not null then
    select o.buyer_id, p.organizer_id
      into v_order_buyer_id, v_promoter_organizer_id
    from public.orders as o
    left join public.promoters as p on p.id = o.promoter_id
    where o.id = new.order_id;

    if v_order_buyer_id is distinct from new.owner_id then
      raise exception 'Ticket owner does not match the order buyer'
        using errcode = '23514';
    end if;

    if v_promoter_organizer_id is not null then
      select e.organizer_id
        into v_event_organizer_id
      from public.events as e
      where e.id = new.event_id;

      if v_promoter_organizer_id is distinct from v_event_organizer_id then
        raise exception 'Promoter does not belong to the event organizer'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Resolver referral de forma segura (no confiar en promoter_id del cliente)
-- -----------------------------------------------------------------------------

create or replace function public.resolve_promoter_for_checkout(
  p_referral_code text,
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promoter_id uuid;
begin
  if p_referral_code is null or btrim(p_referral_code) = '' or p_event_id is null then
    return null;
  end if;

  select p.id
    into v_promoter_id
  from public.promoters as p
  join public.events as e
    on e.id = p_event_id
   and e.organizer_id = p.organizer_id
  where upper(p.referral_code) = upper(btrim(p_referral_code))
  limit 1;

  return v_promoter_id;
end;
$$;

comment on function public.resolve_promoter_for_checkout(text, uuid) is
  'Resuelve ?ref=CODE → promoter_id solo si el RRPP pertenece al organizador del evento.';

revoke all on function public.resolve_promoter_for_checkout(text, uuid) from public;
grant execute on function public.resolve_promoter_for_checkout(text, uuid)
  to anon, authenticated, service_role;

-- Claim seguro: el RRPP se vincula a auth.uid() solo si user_id es null
create or replace function public.claim_promoter_by_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_user uuid;
  v_code text;
  v_referral text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then
    raise exception 'Código vacío' using errcode = '22023';
  end if;

  select p.id, p.user_id, p.referral_code
    into v_id, v_owner, v_referral
  from public.promoters as p
  where upper(p.referral_code) = v_code
  for update;

  if v_id is null then
    raise exception 'Código no encontrado' using errcode = 'P0002';
  end if;

  if v_owner is not null and v_owner <> v_user then
    raise exception 'Código ya vinculado a otra cuenta' using errcode = '23505';
  end if;

  if v_owner is null then
    update public.promoters
    set user_id = v_user
    where id = v_id;
  end if;

  return v_referral;
end;
$$;

revoke all on function public.claim_promoter_by_code(text) from public;
grant execute on function public.claim_promoter_by_code(text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RLS promoters (organizador + promotor vinculado)
-- -----------------------------------------------------------------------------

create policy "promoters_select_related"
on public.promoters
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or user_id = (select auth.uid())
  or (select public.is_super_admin())
);

create policy "promoters_insert_organizer"
on public.promoters
for insert
to authenticated
with check (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

create policy "promoters_update_organizer_or_self"
on public.promoters
for update
to authenticated
using (
  organizer_id = (select auth.uid())
  or user_id = (select auth.uid())
  or (select public.is_super_admin())
)
with check (
  organizer_id = (select auth.uid())
  or user_id = (select auth.uid())
  or (select public.is_super_admin())
);

create policy "promoters_delete_organizer"
on public.promoters
for delete
to authenticated
using (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

-- -----------------------------------------------------------------------------
-- 5) create_complete_event_tx: quitar insert legado en promoters
--     (misma lógica que 00008; RRPP vive en /admin/promoters)
-- -----------------------------------------------------------------------------

create or replace function public.create_complete_event_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_event_id uuid;
  v_zone_id uuid;
  v_zone_ids uuid[] := '{}';
  v_zone jsonb;
  v_tier jsonb;
  v_zone_index integer;
  v_zone_type public.zone_type;
  v_zone_capacity integer;
  v_rows integer;
  v_seats_per_row integer;
  v_row_idx integer;
  v_seat_idx integer;
  v_row_label text;
  v_venue_name text;
  v_venue_location text;
  v_venue_capacity integer;
  v_title text;
  v_description text;
  v_date timestamptz;
  v_location text;
  v_image_url text;
  v_time_limit time;
  v_bonus_reward text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_organizer_id
      and profiles.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Forbidden: el organizador no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  v_title := nullif(btrim(payload ->> 'title'), '');
  v_description := nullif(btrim(payload ->> 'description'), '');
  v_location := nullif(btrim(payload ->> 'location'), '');
  v_image_url := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), '')
  );

  begin
    v_date := (payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha del evento inválida'
        using errcode = '22007';
  end;

  if v_title is null then
    raise exception 'El título del evento es obligatorio'
      using errcode = '22023';
  end if;

  if v_date is null then
    raise exception 'La fecha del evento es obligatoria'
      using errcode = '22023';
  end if;

  v_venue_name := nullif(btrim(payload #>> '{venue,name}'), '');
  v_venue_location := coalesce(
    nullif(btrim(payload #>> '{venue,location}'), ''),
    v_venue_name,
    v_location
  );
  v_venue_capacity := coalesce((payload #>> '{venue,capacity}')::integer, 0);

  if v_venue_name is null then
    raise exception 'El nombre del recinto es obligatorio'
      using errcode = '22023';
  end if;

  if v_venue_capacity <= 0 then
    raise exception 'La capacidad del recinto debe ser mayor a cero'
      using errcode = '22023';
  end if;

  if v_location is null then
    v_location := v_venue_location;
  end if;

  if payload -> 'zones' is null
     or jsonb_typeof(payload -> 'zones') <> 'array'
     or jsonb_array_length(payload -> 'zones') = 0 then
    raise exception 'Debes definir al menos una zona'
      using errcode = '22023';
  end if;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes definir al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  insert into public.venues (organizer_id, name, location, capacity)
  values (p_organizer_id, v_venue_name, v_venue_location, v_venue_capacity)
  returning id into v_venue_id;

  insert into public.events (
    organizer_id,
    title,
    description,
    date,
    location,
    image_url,
    flyer_url,
    venue_id,
    status
  )
  values (
    p_organizer_id,
    v_title,
    v_description,
    v_date,
    v_location,
    v_image_url,
    v_image_url,
    v_venue_id,
    'draft'::public.event_status
  )
  returning id into v_event_id;

  for v_zone in select value from jsonb_array_elements(payload -> 'zones')
  loop
    begin
      v_zone_type := (v_zone ->> 'type')::public.zone_type;
    exception
      when others then
        raise exception 'Tipo de zona inválido: %', v_zone ->> 'type'
          using errcode = '22P02';
    end;

    v_zone_capacity := coalesce((v_zone ->> 'capacity')::integer, 0);

    if nullif(btrim(v_zone ->> 'name'), '') is null then
      raise exception 'Cada zona debe tener un nombre' using errcode = '22023';
    end if;

    if v_zone_capacity <= 0 then
      raise exception 'La capacidad de la zona "%" debe ser mayor a cero',
        v_zone ->> 'name' using errcode = '22023';
    end if;

    insert into public.event_zones (event_id, name, type, capacity)
    values (v_event_id, btrim(v_zone ->> 'name'), v_zone_type, v_zone_capacity)
    returning id into v_zone_id;

    v_zone_ids := array_append(v_zone_ids, v_zone_id);

    if v_zone_type = 'reserved_seating'::public.zone_type then
      v_rows := coalesce((v_zone ->> 'rows')::integer, 0);
      v_seats_per_row := coalesce((v_zone ->> 'seats_per_row')::integer, 0);

      if v_rows <= 0 or v_seats_per_row <= 0 then
        raise exception 'La zona "%" requiere filas y asientos por fila',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      if (v_rows * v_seats_per_row) > 5000 then
        raise exception 'La zona "%" supera el máximo de 5000 asientos por creación',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      for v_row_idx in 1..v_rows loop
        if v_row_idx <= 26 then
          v_row_label := chr(64 + v_row_idx);
        else
          v_row_label :=
            chr(64 + ((v_row_idx - 1) / 26))
            || chr(65 + ((v_row_idx - 1) % 26));
        end if;

        for v_seat_idx in 1..v_seats_per_row loop
          insert into public.seats (zone_id, row_label, seat_number, status)
          values (
            v_zone_id,
            v_row_label,
            v_seat_idx::text,
            'available'::public.seat_status
          );
        end loop;
      end loop;
    end if;
  end loop;

  for v_tier in select value from jsonb_array_elements(payload -> 'tiers')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada tier debe tener un nombre' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'capacity')::integer, 0) < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    v_zone_index := coalesce((v_tier ->> 'zone_index')::integer, 0);
    v_zone_id := null;

    if v_zone_index >= 0 and v_zone_index < cardinality(v_zone_ids) then
      v_zone_id := v_zone_ids[v_zone_index + 1];
    end if;

    v_time_limit := null;
    if nullif(btrim(v_tier ->> 'time_limit'), '') is not null then
      begin
        v_time_limit := (v_tier ->> 'time_limit')::time;
      exception
        when others then
          raise exception 'time_limit inválido en tier "%"', v_tier ->> 'name'
            using errcode = '22007';
      end;
    end if;

    v_bonus_reward := nullif(btrim(v_tier ->> 'bonus_reward'), '');

    insert into public.ticket_tiers (
      event_id, name, price, capacity, sold, time_limit, bonus_reward, zone_id
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      (v_tier ->> 'price')::numeric(12, 2),
      (v_tier ->> 'capacity')::integer,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id
    );
  end loop;

  -- RRPP se gestiona desde /admin/promoters (no auto-crear por evento).

  return v_event_id;

exception
  when others then
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

comment on function public.create_complete_event_tx(jsonb, uuid) is
  'Crea venue, event (draft + flyer), zones, seats y tiers. RRPP → /admin/promoters.';

revoke all on function public.create_complete_event_tx(jsonb, uuid) from public;
revoke all on function public.create_complete_event_tx(jsonb, uuid) from anon;
grant execute on function public.create_complete_event_tx(jsonb, uuid)
  to authenticated, service_role;