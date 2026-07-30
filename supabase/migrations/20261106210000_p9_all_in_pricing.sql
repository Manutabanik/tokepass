-- =============================================================================
-- P9 - All-In Pricing
-- =============================================================================
-- ticket_tiers.price becomes the public (all-in) price.
-- base_price = organizer net; platform_fee = public - base.
-- orders.service_charge remains an internal ledger field (portion of total).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Schema + helpers
-- -----------------------------------------------------------------------------
alter table public.ticket_tiers
  add column if not exists base_price numeric(12, 2),
  add column if not exists platform_fee numeric(12, 2);

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
    coalesce(p_base, 0) * (1 + greatest(0, least(1, coalesce(p_rate, 0.15)))),
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

revoke all on function public.all_in_public_price(numeric, numeric) from public;
grant execute on function public.all_in_public_price(numeric, numeric)
  to authenticated, service_role;

revoke all on function public.all_in_platform_fee(numeric, numeric) from public;
grant execute on function public.all_in_platform_fee(numeric, numeric)
  to authenticated, service_role;

-- Backfill: existing price is pre-fee base. Promote to all-in public price.
update public.ticket_tiers as tt
set
  base_price = coalesce(tt.base_price, tt.price),
  price = public.all_in_public_price(
    coalesce(tt.base_price, tt.price),
    coalesce(p.service_charge_rate, 0.15)
  ),
  platform_fee = public.all_in_platform_fee(
    coalesce(tt.base_price, tt.price),
    coalesce(p.service_charge_rate, 0.15)
  )
from public.events as e
join public.profiles as p on p.id = e.organizer_id
where e.id = tt.event_id
  and (
    tt.base_price is null
    or tt.platform_fee is null
    or tt.platform_fee = 0 and tt.price = coalesce(tt.base_price, tt.price)
  );

-- Safety for orphan tiers
update public.ticket_tiers
set
  base_price = coalesce(base_price, price),
  platform_fee = coalesce(
    platform_fee,
    public.all_in_platform_fee(coalesce(base_price, price), 0.15)
  ),
  price = case
    when base_price is null then public.all_in_public_price(price, 0.15)
    when platform_fee is null or platform_fee = 0 then
      public.all_in_public_price(base_price, 0.15)
    else price
  end
where base_price is null
   or platform_fee is null;

alter table public.ticket_tiers
  alter column base_price set default 0,
  alter column platform_fee set default 0;

alter table public.ticket_tiers
  alter column base_price set not null,
  alter column platform_fee set not null;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_base_price_check;
alter table public.ticket_tiers
  add constraint ticket_tiers_base_price_check
  check (base_price >= 0);

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_platform_fee_check;
alter table public.ticket_tiers
  add constraint ticket_tiers_platform_fee_check
  check (platform_fee >= 0);

comment on column public.ticket_tiers.price is
  'Precio final All-In publicado al comprador (incluye comisión Tokepass).';
comment on column public.ticket_tiers.base_price is
  'Ingreso neto deseado del organizador por entrada.';
comment on column public.ticket_tiers.platform_fee is
  'Comisión unitaria Tokepass absorbida en price (price - base_price).';

comment on column public.orders.subtotal is
  'Monto bruto All-In cobrado (entradas públicas + consumiciones).';
comment on column public.orders.service_charge is
  'Porción de comisión Tokepass retenida internamente (no se suma encima del total).';
comment on column public.orders.total_amount is
  'Monto cobrado en pasarela (= subtotal All-In).';

comment on column public.profiles.service_charge_rate is
  'Markup All-In sobre el neto del organizador (0.15 => público = neto × 1.15).';

-- -----------------------------------------------------------------------------
-- 2) reserve_tickets_tx — fee is already inside public price
-- -----------------------------------------------------------------------------
create or replace function public.reserve_tickets_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_item jsonb;
  v_tier_id uuid;
  v_quantity integer;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_rate numeric(5, 4);
  v_subtotal numeric(12, 2) := 0;
  v_service_charge numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
  v_order_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_i integer;
  v_one_id uuid;
  v_requested integer := 0;
  v_owned_held integer := 0;
  v_max_per_user integer := 4;
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_owner_id is null then
    raise exception 'event_id y owner_id son obligatorios'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debés indicar al menos un ítem de compra'
      using errcode = '22023';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 4)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
    and e.status = 'published'::public.event_status
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(p_items);

  select count(*)::integer
    into v_owned_held
  from public.tickets as t
  where t.event_id = p_event_id
    and t.owner_id = p_owner_id
    and t.status in (
      'valid'::public.ticket_status,
      'pending_payment'::public.ticket_status
    );

  if (v_owned_held + v_requested) > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  if p_promoter_id is not null then
    if not exists (
      select 1
      from public.promoters as pr
      where pr.id = p_promoter_id
        and pr.organizer_id = v_organizer_id
    ) then
      raise exception 'Promoter inválido para este evento'
        using errcode = '23514';
    end if;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_tier_id := (v_item ->> 'tier_id')::uuid;
    exception
      when others then
        raise exception 'tier_id inválido' using errcode = '22P02';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select
      tt.event_id,
      tt.price,
      coalesce(
        tt.platform_fee,
        public.all_in_platform_fee(coalesce(tt.base_price, tt.price), v_rate)
      ),
      tt.capacity,
      tt.sold
      into v_tier_event_id, v_price, v_unit_fee, v_capacity, v_sold
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    if v_tier_event_id is distinct from p_event_id then
      raise exception 'El tier no pertenece al evento'
        using errcode = '23514';
    end if;

    if (v_capacity - v_sold) < v_quantity then
      raise exception 'Sold out'
        using errcode = 'P0001';
    end if;

    update public.ticket_tiers
    set sold = sold + v_quantity
    where id = v_tier_id;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_service_charge := v_service_charge + (v_unit_fee * v_quantity);

    for v_i in 1..v_quantity loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret,
        status
      )
      values (
        p_event_id,
        v_tier_id,
        p_owner_id,
        gen_random_uuid()::text,
        v_secret,
        'pending_payment'::public.ticket_status
      )
      returning id into v_one_id;

      v_ticket_ids := array_append(v_ticket_ids, v_one_id);
    end loop;
  end loop;

  -- All-In: public gross is the charged total; fee is an internal split.
  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_service_charge, 2);
  v_total_amount := v_subtotal;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    p_owner_id,
    v_subtotal,
    v_service_charge,
    v_total_amount,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

  update public.tickets
  set order_id = v_order_id
  where id = any (v_ticket_ids);

  return query
  select
    v_order_id,
    t.id,
    v_subtotal,
    v_service_charge,
    v_total_amount
  from unnest(v_ticket_ids) as t(id);
end;
$$;

comment on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) is
  'Reserva tickets All-In: total = precio público; service_charge = comisión interna.';

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from anon;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) create_pos_sale_tx — charge public price + record fee
-- -----------------------------------------------------------------------------
create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  totp_secret text,
  qr_code text,
  unit_price numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_event public.events%rowtype;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event uuid;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_service_charge numeric(12, 2);
  v_method text;
  v_phone text;
  v_i integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_is_dynamic boolean;
  v_rate numeric(5, 4) := 0.15;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := lower(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('cash_pos', 'transfer_pos') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.user_is_event_organizer_or_staff(
    p_event_id,
    p_staff_id,
    array['cashier'::public.event_staff_role]
  ) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  if v_event.status::text not in ('published', 'draft') then
    raise exception 'EVENT_NOT_SELLABLE' using errcode = '23514';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_event.organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  select
    tt.event_id,
    tt.price,
    coalesce(
      tt.platform_fee,
      public.all_in_platform_fee(coalesce(tt.base_price, tt.price), v_rate)
    ),
    tt.capacity,
    tt.sold
    into v_tier_event, v_price, v_unit_fee, v_capacity, v_sold
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.id = p_tier_id
      and (
        lower(tt.name) like '%freepass%'
        or lower(tt.name) like '%cortes%'
      )
  ) then
    raise exception 'TIER_NOT_ALLOWED_POS' using errcode = '23514';
  end if;

  if (v_capacity - v_sold) < p_quantity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  v_subtotal := round(v_price * p_quantity, 2);
  v_service_charge := round(v_unit_fee * p_quantity, 2);
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_is_dynamic := coalesce(v_event.qr_type, 'dynamic') = 'dynamic';

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone
  )
  values (
    p_staff_id,
    v_subtotal,
    v_service_charge,
    v_subtotal,
    'paid',
    v_method,
    v_phone
  )
  returning id into v_order_id;

  for v_i in 1..p_quantity loop
    v_secret := encode(extensions.gen_random_bytes(24), 'hex');
    v_qr := 'pos_' || replace(gen_random_uuid()::text, '-', '');

    insert into public.tickets (
      event_id,
      tier_id,
      owner_id,
      qr_code,
      status,
      order_id,
      is_dynamic_qr,
      totp_secret
    )
    values (
      p_event_id,
      p_tier_id,
      p_staff_id,
      v_qr,
      'valid'::public.ticket_status,
      v_order_id,
      v_is_dynamic,
      v_secret
    )
    returning id into v_ticket_id;

    order_id := v_order_id;
    ticket_id := v_ticket_id;
    totp_secret := v_secret;
    qr_code := v_qr;
    unit_price := v_price;
    total_amount := v_subtotal;
    return next;
  end loop;
end;
$$;

revoke all on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  from public;
grant execute on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) create_complete_event_tx — persist base_price / platform_fee / public price
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
  v_existing_venue_id uuid;
  v_rate numeric(5, 4) := 0.15;
  v_base_price numeric(12, 2);
  v_platform_fee numeric(12, 2);
  v_public_price numeric(12, 2);
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception
      'Forbidden: el organizador no está aprobado o no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = p_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
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

  begin
    v_existing_venue_id := nullif(btrim(payload ->> 'venue_id'), '')::uuid;
  exception
    when others then
      raise exception 'venue_id inválido' using errcode = '22P02';
  end;

  if v_existing_venue_id is not null then
    select v.id, v.name, v.location, v.capacity
      into v_venue_id, v_venue_name, v_venue_location, v_venue_capacity
    from public.venues as v
    where v.id = v_existing_venue_id
      and v.organizer_id = p_organizer_id;

    if v_venue_id is null then
      raise exception 'Recinto no encontrado o no pertenece al organizador'
        using errcode = '42501';
    end if;
  else
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

    insert into public.venues (organizer_id, name, location, capacity)
    values (p_organizer_id, v_venue_name, v_venue_location, v_venue_capacity)
    returning id into v_venue_id;
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
    coalesce(v_location, v_venue_location, v_venue_name),
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

    -- Prefer explicit base/fee/public from payload; otherwise treat price as public
    -- and reverse-split, or treat base_price as net.
    if v_tier ? 'base_price' then
      v_base_price := coalesce((v_tier ->> 'base_price')::numeric(12, 2), 0);
      v_public_price := coalesce(
        (v_tier ->> 'price')::numeric(12, 2),
        public.all_in_public_price(v_base_price, v_rate)
      );
      v_platform_fee := coalesce(
        (v_tier ->> 'platform_fee')::numeric(12, 2),
        round(v_public_price - v_base_price, 2)
      );
    else
      v_public_price := coalesce((v_tier ->> 'price')::numeric(12, 2), 0);
      v_base_price := round(v_public_price / (1 + v_rate), 2);
      v_platform_fee := round(v_public_price - v_base_price, 2);
    end if;

    if v_base_price < 0 or v_platform_fee < 0 or v_public_price < 0 then
      raise exception 'Montos del tier "%" inválidos', v_tier ->> 'name'
        using errcode = '22023';
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
      event_id,
      name,
      price,
      base_price,
      platform_fee,
      capacity,
      sold,
      time_limit,
      bonus_reward,
      zone_id
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      v_public_price,
      v_base_price,
      v_platform_fee,
      (v_tier ->> 'capacity')::integer,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id
    );
  end loop;

  return v_event_id;

exception
  when others then
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Finance summary — POS fees reduce MP liquidable balance
-- -----------------------------------------------------------------------------
create or replace function public.get_organizer_finance_summary(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross numeric(14, 2) := 0;
  v_mp_gross numeric(14, 2) := 0;
  v_pos_cash numeric(14, 2) := 0;
  v_mp_fees numeric(14, 2) := 0;
  v_pos_fees numeric(14, 2) := 0;
  v_platform_fees numeric(14, 2) := 0;
  v_net_liquidable numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_settlements jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.subtotal, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0),
    coalesce(
      sum(
        case
          when payment_method = 'mercadopago' then total_amount
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos') then total_amount
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum(
        case
          when payment_method = 'mercadopago' then service_charge
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos') then service_charge
          else 0
        end
      ),
      0
    ),
    coalesce(sum(service_charge), 0)
  into v_gross, v_mp_gross, v_pos_cash, v_mp_fees, v_pos_fees, v_platform_fees
  from paid_orders;

  -- MP cash held by Tokepass, minus MP fee and POS fee debt.
  v_net_liquidable := round(v_mp_gross - v_mp_fees - v_pos_fees, 2);

  select coalesce(sum(net_amount), 0)
    into v_settled
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'completed';

  select coalesce(sum(net_amount), 0)
    into v_pending_settlement
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'pending';

  v_available := greatest(0, v_net_liquidable - v_settled - v_pending_settlement);

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'grossAmount', s.gross_amount,
          'platformFee', s.platform_fee,
          'netAmount', s.net_amount,
          'status', s.status,
          'periodLabel', s.period_label,
          'notes', s.notes,
          'completedAt', s.completed_at,
          'createdAt', s.created_at
        )
        order by s.created_at desc
      )
      from (
        select *
        from public.organizer_settlements
        where organizer_id = p_organizer_id
        order by created_at desc
        limit 50
      ) as s
    ),
    '[]'::jsonb
  )
  into v_settlements;

  return jsonb_build_object(
    'grossRevenue', v_gross,
    'platformFees', v_platform_fees,
    'mpPlatformFees', v_mp_fees,
    'posPlatformFees', v_pos_fees,
    'netRevenue', v_net_liquidable,
    'mercadopagoGross', v_mp_gross,
    'posGross', v_pos_cash,
    'mpGrossTotal', v_mp_gross,
    'posCashTotal', v_pos_cash,
    'netLiquidable', v_net_liquidable,
    'settledNet', v_settled,
    'pendingSettlementNet', v_pending_settlement,
    'availableToSettle', v_available,
    'platformFeeDebt', greatest(0, -v_net_liquidable),
    'settlements', v_settlements
  );
end;
$$;

revoke all on function public.get_organizer_finance_summary(uuid) from public;
grant execute on function public.get_organizer_finance_summary(uuid)
  to authenticated, service_role;
