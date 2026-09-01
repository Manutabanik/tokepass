-- P201 · Aislar cupo digital (web/POS/cortesía) del cupo de papel (batch_print).
-- capacity/sold siguen siendo el balde digital. physical_* es independiente
-- para inyectar stock de imprenta sin canibalizar la venta web.
-- assert_logical_sector_stock suma ticket_tiers.sold: al dejar de incrementar
-- sold en batch_print, el techo GA de zona ya no cuenta el papel.

-- ---------------------------------------------------------------------------
-- 1) Columnas de control
-- ---------------------------------------------------------------------------
alter table public.ticket_tiers
  add column if not exists digital_capacity integer not null default 0,
  add column if not exists physical_capacity integer not null default 0,
  add column if not exists physical_issued integer not null default 0;

comment on column public.ticket_tiers.digital_capacity is
  'Cupo de venta digital (web, POS, cortesía). Se mantiene alineado a capacity.';
comment on column public.ticket_tiers.physical_capacity is
  'Cupo de papel (batch_print). Independiente del cupo digital; se puede inyectar.';
comment on column public.ticket_tiers.physical_issued is
  'Unidades de papel emitidas. No incrementa sold.';
comment on column public.ticket_tiers.sold is
  'Unidades del cupo digital (online, pos, complimentary). El papel no suma.';

update public.ticket_tiers
set digital_capacity = greatest(0, capacity)
where digital_capacity is distinct from greatest(0, capacity);

-- El papel histórico comió sold: devolverlo al cupo web y moverlo al balde físico.
with paper as (
  select
    t.tier_id,
    count(*)::integer as qty
  from public.tickets as t
  where t.issuance_channel = 'batch_print'
    and coalesce(t.is_test, false) = false
    and t.status not in (
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    )
  group by t.tier_id
)
update public.ticket_tiers as tt
set
  physical_issued = paper.qty,
  physical_capacity = greatest(tt.physical_capacity, paper.qty),
  sold = greatest(0, tt.sold - paper.qty)
from paper
where tt.id = paper.tier_id;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_digital_capacity_nonneg,
  drop constraint if exists ticket_tiers_physical_capacity_nonneg,
  drop constraint if exists ticket_tiers_physical_issued_nonneg,
  drop constraint if exists ticket_tiers_physical_issued_le_capacity;

alter table public.ticket_tiers
  add constraint ticket_tiers_digital_capacity_nonneg
    check (digital_capacity >= 0),
  add constraint ticket_tiers_physical_capacity_nonneg
    check (physical_capacity >= 0),
  add constraint ticket_tiers_physical_issued_nonneg
    check (physical_issued >= 0),
  add constraint ticket_tiers_physical_issued_le_capacity
    check (physical_issued <= physical_capacity);

-- ---------------------------------------------------------------------------
-- 2) Clasificación de canal (SQL, espejo de lib/inventory/channel-stock.ts)
-- ---------------------------------------------------------------------------
create or replace function public.ticket_channel_uses_digital_stock(p_channel text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select lower(btrim(coalesce(p_channel, 'online'))) in (
    'online',
    'pos',
    'complimentary'
  );
$$;

create or replace function public.ticket_channel_uses_physical_stock(p_channel text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select lower(btrim(coalesce(p_channel, ''))) = 'batch_print';
$$;

comment on function public.ticket_channel_uses_digital_stock(text) is
  'online / pos / complimentary consumen capacity-sold.';
comment on function public.ticket_channel_uses_physical_stock(text) is
  'batch_print consume physical_capacity / physical_issued.';

revoke all on function public.ticket_channel_uses_digital_stock(text) from public;
revoke all on function public.ticket_channel_uses_physical_stock(text) from public;
grant execute on function public.ticket_channel_uses_digital_stock(text)
  to authenticated, service_role;
grant execute on function public.ticket_channel_uses_physical_stock(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) capacity <-> digital_capacity
-- ---------------------------------------------------------------------------
create or replace function public.ticket_tiers_sync_digital_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.physical_capacity := greatest(0, coalesce(new.physical_capacity, 0));
  new.physical_issued := greatest(0, coalesce(new.physical_issued, 0));
  new.digital_capacity := greatest(0, coalesce(new.digital_capacity, 0));
  new.capacity := greatest(0, coalesce(new.capacity, 0));

  if tg_op = 'INSERT' then
    if new.digital_capacity = 0 and new.capacity > 0 then
      new.digital_capacity := new.capacity;
    elsif new.capacity = 0 and new.digital_capacity > 0 then
      new.capacity := new.digital_capacity;
    else
      new.digital_capacity := new.capacity;
    end if;
    return new;
  end if;

  if new.capacity is distinct from old.capacity
     and new.digital_capacity is not distinct from old.digital_capacity then
    new.digital_capacity := new.capacity;
  elsif new.digital_capacity is distinct from old.digital_capacity then
    new.capacity := new.digital_capacity;
  else
    new.digital_capacity := new.capacity;
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_tiers_sync_digital_capacity on public.ticket_tiers;
create trigger ticket_tiers_sync_digital_capacity
before insert or update of capacity, digital_capacity, physical_capacity, physical_issued
on public.ticket_tiers
for each row
execute function public.ticket_tiers_sync_digital_capacity();

-- ---------------------------------------------------------------------------
-- 4) Sandbox: congelar también physical_issued
-- ---------------------------------------------------------------------------
create or replace function public.ticket_tiers_ignore_sandbox_sold_increment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting('tokepass.resetting_test_inventory', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (
       coalesce(new.sold, 0) is distinct from coalesce(old.sold, 0)
       or coalesce(new.physical_issued, 0)
         is distinct from coalesce(old.physical_issued, 0)
       or coalesce(new.physical_capacity, 0)
         is distinct from coalesce(old.physical_capacity, 0)
     )
     and not public.event_uses_live_stock(new.event_id) then
    new.sold := old.sold;
    new.physical_issued := old.physical_issued;
    new.physical_capacity := old.physical_capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_tiers_ignore_sandbox_sold_increment on public.ticket_tiers;
create trigger ticket_tiers_ignore_sandbox_sold_increment
before update of sold, physical_issued, physical_capacity
on public.ticket_tiers
for each row
execute function public.ticket_tiers_ignore_sandbox_sold_increment();

-- ---------------------------------------------------------------------------
-- 5) Recontar sold digital + papel (publish / reset sandbox)
-- ---------------------------------------------------------------------------
create or replace function public.recount_event_tier_channel_stock(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_event_id is null then
    return;
  end if;

  update public.ticket_tiers as tt
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.tier_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
      and public.ticket_channel_uses_digital_stock(t.issuance_channel)
    group by t.tier_id
  ) as units
  where tt.id = units.tier_id
    and tt.event_id = p_event_id;

  update public.ticket_tiers as tt
  set sold = 0
  where tt.event_id = p_event_id
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.tier_id = tt.id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
        and public.ticket_channel_uses_digital_stock(t.issuance_channel)
    );

  update public.ticket_tiers as tt
  set
    physical_issued = coalesce(units.qty, 0),
    physical_capacity = greatest(tt.physical_capacity, coalesce(units.qty, 0))
  from (
    select
      t.tier_id,
      count(*)::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
      and public.ticket_channel_uses_physical_stock(t.issuance_channel)
    group by t.tier_id
  ) as units
  where tt.id = units.tier_id
    and tt.event_id = p_event_id;

  update public.ticket_tiers as tt
  set physical_issued = 0
  where tt.event_id = p_event_id
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.tier_id = tt.id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
        and public.ticket_channel_uses_physical_stock(t.issuance_channel)
    );

  update public.ticket_tiers as tt
  set digital_capacity = tt.capacity
  where tt.event_id = p_event_id
    and tt.digital_capacity is distinct from tt.capacity;
end;
$$;

comment on function public.recount_event_tier_channel_stock(uuid) is
  'Reconstruye sold (digital) y physical_issued (papel) desde tickets de producción.';

revoke all on function public.recount_event_tier_channel_stock(uuid)
  from public, anon, authenticated;
grant execute on function public.recount_event_tier_channel_stock(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6) Print Studio: batch_print inyecta y consume physical_*, nunca sold
-- ---------------------------------------------------------------------------
create or replace function public.issue_print_batch_tx(
  p_event_id uuid,
  p_staff_id uuid,
  p_tier_id uuid,
  p_template_id uuid,
  p_name text,
  p_mode text,
  p_channel text,
  p_series_code text,
  p_seq_start integer,
  p_unnamed_count integer,
  p_guests jsonb default '[]'::jsonb,
  p_default_staff_role text default null,
  p_default_staff_company text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_event public.events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_series text := upper(btrim(coalesce(p_series_code, 'A')));
  v_seq integer := greatest(1, coalesce(p_seq_start, 1));
  v_seq_start integer := greatest(1, coalesce(p_seq_start, 1));
  v_units integer := 0;
  v_i integer;
  v_guest jsonb;
  v_batch_id uuid;
  v_order_id uuid;
  v_secret text;
  v_name text;
  v_dni text;
  v_email text;
  v_role text;
  v_company text;
  v_seat uuid;
  v_label text;
  v_one uuid;
  v_ticket_ids uuid[] := '{}';
  v_is_test boolean := false;
  v_ticket_type text;
  v_holder_fallback text;
  v_free_cap integer;
  v_free_used integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_mode not in ('unnamed', 'named', 'seated', 'accreditation') then
    raise exception 'INVALID_MODE' using errcode = '22023';
  end if;

  if v_channel not in ('batch_print', 'complimentary', 'accreditation') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;

  if v_series !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'INVALID_SERIES' using errcode = '22023';
  end if;

  if p_event_id is null or p_staff_id is null or p_tier_id is null then
    raise exception 'Datos incompletos' using errcode = '22023';
  end if;

  select * into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_event.organizer_id is distinct from p_staff_id
     and not exists (
       select 1 from public.profiles as p
       where p.id = p_staff_id and p.role::text = 'super_admin'
     ) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  if p_template_id is not null
     and not exists (
       select 1
       from public.ticket_templates as tpl
       where tpl.id = p_template_id
         and (
           tpl.organizer_id = v_event.organizer_id
           or tpl.organizer_id = p_staff_id
         )
     ) then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found or v_tier.event_id is distinct from p_event_id then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_guests is not null
     and jsonb_typeof(p_guests) = 'array'
     and jsonb_array_length(p_guests) > 0 then
    v_units := jsonb_array_length(p_guests);
  elsif v_mode in ('named', 'seated') then
    raise exception 'GUESTS_REQUIRED' using errcode = '22023';
  else
    v_units := coalesce(p_unnamed_count, 0);
  end if;

  if v_units < 1 then
    raise exception 'COUNT_REQUIRED' using errcode = '22023';
  end if;

  if v_units > 1000 then
    raise exception 'BATCH_TOO_LARGE' using errcode = '22023';
  end if;

  -- Cortesía sigue en el balde digital. Papel no valida ni toca capacity/sold.
  if v_channel = 'complimentary'
     and (v_tier.capacity - v_tier.sold) < v_units then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  if v_channel = 'complimentary' then
    v_free_cap := coalesce(v_event.max_free_tickets, 0);
    if v_free_cap > 0 then
      select count(*)::integer into v_free_used
      from public.tickets as t
      where t.event_id = p_event_id
        and t.issuance_channel = 'complimentary'
        and t.status::text in ('valid', 'used', 'pending_payment', 'scanned');

      if (v_free_used + v_units) > v_free_cap then
        raise exception 'FREE_CAP_EXCEEDED' using errcode = 'P0001';
      end if;
    end if;
  end if;

  v_is_test := v_event.status::text in (
    'draft',
    'pending_approval',
    'needs_revision',
    'rejected'
  );

  v_ticket_type := case
    when v_channel = 'accreditation' then 'access_pass'
    else 'admission'
  end;

  v_holder_fallback := case v_channel
    when 'accreditation' then 'Acreditación'
    when 'complimentary' then 'Cortesía'
    else 'Entrada impresa'
  end;

  insert into public.ticket_print_batches (
    event_id,
    organizer_id,
    template_id,
    tier_id,
    name,
    mode,
    channel,
    series_code,
    seq_start,
    seq_end,
    status,
    issued_count,
    created_by
  )
  values (
    p_event_id,
    v_event.organizer_id,
    p_template_id,
    p_tier_id,
    btrim(p_name),
    v_mode,
    v_channel,
    v_series,
    v_seq,
    v_seq + v_units - 1,
    'ready',
    0,
    p_staff_id
  )
  returning id into v_batch_id;

  if v_channel = 'complimentary' then
    update public.ticket_tiers
    set sold = sold + v_units
    where id = p_tier_id;
  elsif v_channel = 'batch_print' then
    update public.ticket_tiers
    set
      physical_capacity = greatest(physical_capacity, physical_issued + v_units),
      physical_issued = physical_issued + v_units
    where id = p_tier_id;
  end if;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    is_test,
    environment
  )
  values (
    p_staff_id,
    0,
    0,
    0,
    'paid',
    'cash_pos',
    v_is_test,
    case when v_is_test then 'test' else 'production' end
  )
  returning id into v_order_id;

  if p_guests is not null
     and jsonb_typeof(p_guests) = 'array'
     and jsonb_array_length(p_guests) > 0 then
    for v_guest in select value from jsonb_array_elements(p_guests)
    loop
      v_dni := nullif(regexp_replace(coalesce(v_guest ->> 'dni', ''), '\D', '', 'g'), '');
      if v_channel <> 'accreditation'
         and v_mode in ('named', 'seated') then
        if v_dni is null or length(v_dni) < 7 or length(v_dni) > 11 then
          raise exception 'DNI_REQUIRED' using errcode = '22023';
        end if;
      elsif v_dni is not null
            and (length(v_dni) < 7 or length(v_dni) > 11) then
        raise exception 'DNI_INVALID' using errcode = '22023';
      end if;

      v_name := nullif(btrim(
        concat_ws(
          ' ',
          nullif(btrim(coalesce(v_guest ->> 'nombre', v_guest ->> 'name', '')), ''),
          nullif(btrim(coalesce(v_guest ->> 'apellido', v_guest ->> 'last_name', '')), '')
        )
      ), '');
      if v_name is null then
        v_name := coalesce(
          nullif(btrim(coalesce(v_guest ->> 'full_name', '')), ''),
          v_holder_fallback
        );
      end if;

      v_email := nullif(lower(btrim(coalesce(v_guest ->> 'email', ''))), '');
      v_role := nullif(btrim(coalesce(
        v_guest ->> 'staff_role',
        v_guest ->> 'staffRole',
        p_default_staff_role,
        ''
      )), '');
      v_company := nullif(btrim(coalesce(
        v_guest ->> 'staff_company',
        v_guest ->> 'staffCompany',
        p_default_staff_company,
        ''
      )), '');
      v_seat := nullif(btrim(coalesce(v_guest ->> 'seating_unit_id', v_guest ->> 'seatingUnitId', '')), '')::uuid;

      v_label := v_series || '-' || lpad(v_seq::text, 5, '0');
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret,
        status,
        order_id,
        is_dynamic_qr,
        holder_name,
        holder_dni,
        holder_email,
        seating_unit_id,
        batch_id,
        print_batch_id,
        issuance_channel,
        serial_label,
        serial_seq,
        staff_role,
        staff_company,
        max_admissions,
        admissions_used,
        is_test,
        ticket_type
      )
      values (
        p_event_id,
        p_tier_id,
        p_staff_id,
        'batch_' || replace(gen_random_uuid()::text, '-', ''),
        v_secret,
        'valid'::public.ticket_status,
        v_order_id,
        false,
        v_name,
        v_dni,
        v_email,
        v_seat,
        case when v_channel = 'complimentary' then v_batch_id else null end,
        v_batch_id,
        v_channel,
        v_label,
        v_seq,
        v_role,
        v_company,
        1,
        0,
        v_is_test,
        v_ticket_type::public.ticket_type
      )
      returning id into v_one;

      v_ticket_ids := array_append(v_ticket_ids, v_one);
      v_seq := v_seq + 1;
    end loop;
  else
    for v_i in 1..v_units loop
      v_label := v_series || '-' || lpad(v_seq::text, 5, '0');
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret,
        status,
        order_id,
        is_dynamic_qr,
        holder_name,
        batch_id,
        print_batch_id,
        issuance_channel,
        serial_label,
        serial_seq,
        staff_role,
        staff_company,
        max_admissions,
        admissions_used,
        is_test,
        ticket_type
      )
      values (
        p_event_id,
        p_tier_id,
        p_staff_id,
        'batch_' || replace(gen_random_uuid()::text, '-', ''),
        v_secret,
        'valid'::public.ticket_status,
        v_order_id,
        false,
        v_holder_fallback,
        case when v_channel = 'complimentary' then v_batch_id else null end,
        v_batch_id,
        v_channel,
        v_label,
        v_seq,
        nullif(btrim(coalesce(p_default_staff_role, '')), ''),
        nullif(btrim(coalesce(p_default_staff_company, '')), ''),
        1,
        0,
        v_is_test,
        v_ticket_type::public.ticket_type
      )
      returning id into v_one;

      v_ticket_ids := array_append(v_ticket_ids, v_one);
      v_seq := v_seq + 1;
    end loop;
  end if;

  update public.ticket_print_batches
  set issued_count = coalesce(array_length(v_ticket_ids, 1), 0)
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'order_id', v_order_id,
    'issued_count', coalesce(array_length(v_ticket_ids, 1), 0),
    'seq_start', v_seq_start,
    'seq_end', v_seq - 1,
    'series_code', v_series,
    'ticket_ids', to_jsonb(v_ticket_ids)
  );
end;
$$;

revoke all on function public.issue_print_batch_tx(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, jsonb, text, text
) from public, anon;
grant execute on function public.issue_print_batch_tx(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, jsonb, text, text
) to authenticated, service_role;

comment on function public.issue_print_batch_tx is
  'Print Studio. batch_print inyecta physical_capacity y no toca sold. Cortesía: cupo digital. Acreditación: sin stock comercial.';

comment on function public.assert_logical_sector_stock(uuid, uuid, integer) is
  'Techo GA de zona. Suma ticket_tiers.sold (solo cupo digital; el papel vive en physical_issued).';

-- ---------------------------------------------------------------------------
-- 7) Al publicar, recontar cupos por canal (después del sold legado)
-- ---------------------------------------------------------------------------
create or replace function public.reset_event_test_inventory_internal(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
  v_order_ids uuid[] := '{}'::uuid[];
begin
  if p_event_id is null then
    raise exception 'event_id requerido' using errcode = '22023';
  end if;

  if not exists (select 1 from public.events as e where e.id = p_event_id) then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  perform set_config('tokepass.resetting_test_inventory', '1', true);

  select coalesce(array_agg(distinct t.order_id), '{}'::uuid[])
    into v_order_ids
  from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = true
    and t.order_id is not null;

  delete from public.event_ga_cart_holds
  where event_id = p_event_id;

  if to_regclass('public.ticket_action_consents') is not null then
    execute $sql$
      delete from public.ticket_action_consents as c
      where exists (
        select 1
        from public.tickets as t
        where t.id = c.ticket_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  if to_regclass('public.payouts_pending') is not null then
    execute $sql$
      delete from public.payouts_pending as pay
      where exists (
        select 1
        from public.ticket_resale_listings as l
        join public.tickets as t on t.id = l.ticket_id
        where l.id = pay.listing_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  if to_regclass('public.ticket_resale_listings') is not null then
    execute $sql$
      delete from public.ticket_resale_listings as l
      where exists (
        select 1
        from public.tickets as t
        where t.id = l.ticket_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  delete from public.ticket_transfers as tr
  where exists (
    select 1
    from public.tickets as t
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
      and t.id in (tr.original_ticket_id, tr.new_ticket_id)
  );

  delete from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = true;

  get diagnostics v_deleted = row_count;

  if coalesce(array_length(v_order_ids, 1), 0) > 0 then
    update public.orders as o
    set
      status = 'expired',
      is_test = true,
      environment = 'test',
      payment_method = coalesce(nullif(o.payment_method, ''), 'test_sandbox'),
      updated_at = now()
    where o.id = any(v_order_ids)
      and coalesce(o.is_test, false) = true
      and not exists (
        select 1
        from public.tickets as t
        where t.order_id = o.id
          and coalesce(t.is_test, false) = false
      );
  end if;

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    sold_order_id = null,
    updated_at = now()
  where u.event_id = p_event_id
    and u.status in ('sold', 'reserved')
    and (
      exists (
        select 1
        from public.orders as o
        where o.id in (u.sold_order_id, u.reserved_order_id)
          and coalesce(o.is_test, false) = true
      )
      or not exists (
        select 1
        from public.tickets as t
        where t.seating_unit_id = u.id
          and coalesce(t.is_test, false) = false
          and t.status not in (
            'cancelled'::public.ticket_status,
            'revoked'::public.ticket_status
          )
      )
    );

  update public.ticket_tier_phases as p
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.phase_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and t.phase_id is not null
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
      and public.ticket_channel_uses_digital_stock(t.issuance_channel)
    group by t.phase_id
  ) as units
  where p.id = units.phase_id;

  update public.ticket_tier_phases as p
  set sold = 0
  where p.tier_id in (
      select tt.id from public.ticket_tiers as tt where tt.event_id = p_event_id
    )
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.phase_id = p.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
        and public.ticket_channel_uses_digital_stock(t.issuance_channel)
    );

  perform public.recount_event_tier_channel_stock(p_event_id);

  return coalesce(v_deleted, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) KPIs: Vendidos Web vs Impresos (Papel)
-- ---------------------------------------------------------------------------
create or replace function public.get_event_dashboard_metrics(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capacity integer := 0;
  v_web_sold integer := 0;
  v_paper_issued integer := 0;
  v_digital_occupied integer := 0;
  v_revenue numeric(14, 2) := 0;
begin
  if p_event_id is null then
    return jsonb_build_object(
      'tickets_sold', 0,
      'web_sold', 0,
      'paper_issued', 0,
      'revenue', 0,
      'capacity', 0,
      'available', 0
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not exists (
       select 1
       from public.events as e
       where e.id = p_event_id
         and e.organizer_id = auth.uid()
     )
     and not public.user_is_event_organizer_or_staff(
       p_event_id,
       auth.uid(),
       array['door_staff'::public.event_staff_role]
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(0, coalesce(tt.digital_capacity, tt.capacity))), 0)::integer
    into v_capacity
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id;

  select
    coalesce(count(*) filter (
      where coalesce(t.issuance_channel, 'online') in ('online', 'pos')
    ), 0)::integer,
    coalesce(count(*) filter (
      where t.issuance_channel = 'batch_print'
    ), 0)::integer,
    coalesce(count(*) filter (
      where public.ticket_channel_uses_digital_stock(t.issuance_channel)
    ), 0)::integer
    into v_web_sold, v_paper_issued, v_digital_occupied
  from public.tickets as t
  join public.orders as o on o.id = t.order_id
  where t.event_id = p_event_id
    and o.status = 'paid'
    and coalesce(t.is_test, false) = false
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(o.payment_method, '') is distinct from 'test_sandbox'
    and t.status not in (
      'pending_payment'::public.ticket_status,
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    );

  select coalesce(sum(o.total_amount), 0)
    into v_revenue
  from public.orders as o
  where o.status = 'paid'
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(o.payment_method, '') is distinct from 'test_sandbox'
    and exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
    );

  return jsonb_build_object(
    'tickets_sold', v_web_sold,
    'web_sold', v_web_sold,
    'paper_issued', v_paper_issued,
    'revenue', v_revenue,
    'capacity', v_capacity,
    'available', greatest(0, v_capacity - v_digital_occupied)
  );
end;
$$;

comment on function public.get_event_dashboard_metrics(uuid) is
  'KPIs del evento. tickets_sold/web_sold = venta digital; paper_issued = imprenta. available es cupo web.';

create or replace function public.get_organizer_metrics(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross_revenue numeric(14, 2) := 0;
  v_tokepass_service_charge numeric(14, 2) := 0;
  v_organizer_net_payout numeric(14, 2) := 0;
  v_tickets_sold integer := 0;
  v_web_sold integer := 0;
  v_paper_issued integer := 0;
  v_active_events integer := 0;
  v_recent_sales jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not public.is_approved_organizer(p_organizer_id) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
  end if;

  select
    l.gross_revenue,
    l.tokepass_service_charge,
    l.organizer_net_payout
  into
    v_gross_revenue,
    v_tokepass_service_charge,
    v_organizer_net_payout
  from public.organizer_paid_ledger(p_organizer_id, false) as l;

  select
    coalesce(count(*) filter (
      where coalesce(t.issuance_channel, 'online') in ('online', 'pos')
    ), 0)::integer,
    coalesce(count(*) filter (
      where t.issuance_channel = 'batch_print'
    ), 0)::integer
    into v_web_sold, v_paper_issued
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  join public.orders as o on o.id = t.order_id
  where e.organizer_id = p_organizer_id
    and o.status = 'paid'
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(t.is_test, false) = false
    and not public.is_sandbox_event_status(e.status)
    and t.status not in (
      'pending_payment'::public.ticket_status,
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    );

  v_tickets_sold := v_web_sold;

  select coalesce(count(*)::integer, 0)
    into v_active_events
  from public.events as e
  where e.organizer_id = p_organizer_id
    and e.status = 'published'::public.event_status;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'date', x.created_at,
          'amount', x.total_amount,
          'status', x.status,
          'buyer_name', x.buyer_name
        )
        order by x.created_at desc
      )
      from (
        select
          o.id,
          o.created_at,
          o.total_amount,
          o.status,
          coalesce(
            nullif(btrim(p.full_name), ''),
            p.email,
            'Comprador'
          ) as buyer_name
        from public.orders as o
        left join public.profiles as p on p.id = o.buyer_id
        where o.status = 'paid'
          and coalesce(o.is_test, false) = false
          and coalesce(o.environment, 'production') is distinct from 'test'
          and exists (
            select 1
            from public.tickets as t
            join public.events as e on e.id = t.event_id
            where t.order_id = o.id
              and e.organizer_id = p_organizer_id
              and coalesce(t.is_test, false) = false
              and not public.is_sandbox_event_status(e.status)
          )
        order by o.created_at desc
        limit 5
      ) as x
    ),
    '[]'::jsonb
  )
    into v_recent_sales;

  return jsonb_build_object(
    'gross_revenue', v_gross_revenue,
    'tokepass_service_charge', v_tokepass_service_charge,
    'organizer_net_payout', v_organizer_net_payout,
    'total_revenue', v_gross_revenue,
    'tickets_sold', v_tickets_sold,
    'web_sold', v_web_sold,
    'paper_issued', v_paper_issued,
    'active_events', v_active_events,
    'recent_sales', v_recent_sales
  );
end;
$$;

comment on function public.get_organizer_metrics(uuid) is
  'KPIs del organizador. web_sold = venta digital; paper_issued = imprenta. Recaudacion de produccion.';
