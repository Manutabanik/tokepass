-- =============================================================================
-- P45: Mesas (admit_count → N QRs), Combos (tier↔ extras), Cortesías masivas
-- =============================================================================

-- 1) Mesas / agrupaciones
alter table public.ticket_tiers
  add column if not exists admit_count integer not null default 1;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_admit_count_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_admit_count_check
  check (admit_count between 1 and 50);

comment on column public.ticket_tiers.admit_count is
  'QRs independientes por unidad vendida. Ej: Mesa para 4 → admit_count=4.';

alter table public.tickets
  add column if not exists group_id uuid;

alter table public.tickets
  add column if not exists group_slot integer;

alter table public.tickets
  add column if not exists batch_id uuid;

alter table public.tickets
  drop constraint if exists tickets_group_slot_check;

alter table public.tickets
  add constraint tickets_group_slot_check
  check (group_slot is null or group_slot between 1 and 50);

create index if not exists tickets_group_id_idx
  on public.tickets (group_id)
  where group_id is not null;

create index if not exists tickets_batch_id_idx
  on public.tickets (batch_id)
  where batch_id is not null;

create index if not exists tickets_event_holder_dni_idx
  on public.tickets (event_id, holder_dni)
  where holder_dni is not null;

comment on column public.tickets.group_id is
  'Agrupa los N QRs de una misma mesa/unidad comprada.';
comment on column public.tickets.batch_id is
  'Lote de emisión masiva de cortesías (CSV o innombrado).';

-- 2) Combos: extras incluidos en un tipo de entrada
create table if not exists public.ticket_tier_combo_items (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.ticket_tiers (id) on delete cascade,
  event_item_id uuid not null references public.event_items (id) on delete cascade,
  quantity integer not null default 1
    check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  unique (tier_id, event_item_id)
);

create index if not exists ticket_tier_combo_items_tier_idx
  on public.ticket_tier_combo_items (tier_id);

create index if not exists ticket_tier_combo_items_item_idx
  on public.ticket_tier_combo_items (event_item_id);

comment on table public.ticket_tier_combo_items is
  'Extras (gastronomía/merch) incluidos al emitir un ticket_tier tipo Combo.';

alter table public.ticket_tier_combo_items enable row level security;

drop policy if exists ticket_tier_combo_items_select on public.ticket_tier_combo_items;
create policy ticket_tier_combo_items_select
  on public.ticket_tier_combo_items
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = tier_id
        and (
          e.status = 'published'
          or e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  );

drop policy if exists ticket_tier_combo_items_write on public.ticket_tier_combo_items;
create policy ticket_tier_combo_items_write
  on public.ticket_tier_combo_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = tier_id
        and (
          e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = tier_id
        and (
          e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  );

grant select, insert, update, delete on public.ticket_tier_combo_items to authenticated;
grant all on public.ticket_tier_combo_items to service_role;

-- Store combo: producto que incluye acceso a puerta
alter table public.event_items
  add column if not exists includes_tier_id uuid
    references public.ticket_tiers (id) on delete set null;

alter table public.event_items
  add column if not exists includes_tier_qty integer not null default 0;

alter table public.event_items
  drop constraint if exists event_items_includes_tier_qty_check;

alter table public.event_items
  add constraint event_items_includes_tier_qty_check
  check (includes_tier_qty between 0 and 20);

comment on column public.event_items.includes_tier_id is
  'Si está set, al vender este combo de tienda se emiten includes_tier_qty tickets del tier.';

-- 3) Helper: emitir redenciones de combo por unidad (group)
create or replace function public.fulfill_tier_combo_items(
  p_order_id uuid,
  p_tier_id uuid,
  p_owner_id uuid,
  p_status text default 'pending'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comp record;
  v_item public.event_items%rowtype;
  v_q integer;
  v_i integer;
  v_created integer := 0;
  v_status text := lower(coalesce(p_status, 'pending'));
begin
  if v_status not in ('pending', 'valid') then
    v_status := 'pending';
  end if;

  for v_comp in
    select c.event_item_id, c.quantity
    from public.ticket_tier_combo_items c
    where c.tier_id = p_tier_id
  loop
    select * into v_item
    from public.event_items ei
    where ei.id = v_comp.event_item_id
    for update of ei;

    if not found or not v_item.is_active then
      raise exception 'COMBO_ITEM_UNAVAILABLE' using errcode = 'P0001';
    end if;

    v_q := greatest(1, v_comp.quantity);
    if v_item.stock < v_q then
      raise exception 'COMBO_ITEM_OUT_OF_STOCK' using errcode = 'P0001';
    end if;

    update public.event_items
    set stock = stock - v_q, updated_at = now()
    where id = v_item.id;

    for v_i in 1..v_q loop
      insert into public.item_redemptions (
        order_id,
        item_id,
        user_id,
        qr_code_token,
        status
      )
      values (
        p_order_id,
        v_item.id,
        p_owner_id,
        'cmb_' || replace(gen_random_uuid()::text, '-', ''),
        v_status
      );
      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.fulfill_tier_combo_items(uuid, uuid, uuid, text) from public;
grant execute on function public.fulfill_tier_combo_items(uuid, uuid, uuid, text)
  to authenticated, service_role;

-- 4) reserve_tickets_tx — expand admit_count + combos
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
  v_admit integer;
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
  v_unit integer;
  v_slot integer;
  v_one_id uuid;
  v_group_id uuid;
  v_requested integer := 0;
  v_owned_held integer := 0;
  v_max_per_user integer := 10;
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

  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 10)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  -- Cupo por persona = unidades × admit_count
  select coalesce(sum(
    greatest(1, coalesce((
      select tt.admit_count
      from public.ticket_tiers tt
      where tt.id = nullif(value ->> 'tier_id', '')::uuid
    ), 1))
    * coalesce((value ->> 'quantity')::integer, 0)
  ), 0)
    into v_requested
  from jsonb_array_elements(p_items);

  v_owned_held := public.count_user_event_tickets_for_limit(p_event_id, p_owner_id);

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

  -- Orden primero (necesitamos order_id para combos)
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
    0,
    0,
    0,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

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
      tt.sold,
      greatest(1, least(50, coalesce(tt.admit_count, 1)))
      into v_tier_event_id, v_price, v_unit_fee, v_capacity, v_sold, v_admit
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

    for v_unit in 1..v_quantity loop
      v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

      for v_slot in 1..v_admit loop
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');

        insert into public.tickets (
          event_id,
          tier_id,
          owner_id,
          qr_code,
          totp_secret,
          status,
          order_id,
          group_id,
          group_slot,
          max_admissions,
          admissions_used
        )
        values (
          p_event_id,
          v_tier_id,
          p_owner_id,
          gen_random_uuid()::text,
          v_secret,
          'pending_payment'::public.ticket_status,
          v_order_id,
          v_group_id,
          case when v_admit > 1 then v_slot else null end,
          1,
          0
        )
        returning id into v_one_id;

        v_ticket_ids := array_append(v_ticket_ids, v_one_id);
      end loop;

      perform public.fulfill_tier_combo_items(
        v_order_id,
        v_tier_id,
        p_owner_id,
        'pending'
      );
    end loop;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_service_charge, 2);
  v_total_amount := v_subtotal;

  update public.orders
  set
    subtotal = v_subtotal,
    service_charge = v_service_charge,
    total_amount = v_total_amount,
    updated_at = now()
  where id = v_order_id;

  foreach v_one_id in array v_ticket_ids
  loop
    order_id := v_order_id;
    ticket_id := v_one_id;
    subtotal := v_subtotal;
    service_charge := v_service_charge;
    total_amount := v_total_amount;
    return next;
  end loop;
end;
$$;

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- 5) create_pos_sale_tx — admit_count + combos + DNI/turno
create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null
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
  v_admit integer;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_method text;
  v_phone text;
  v_dni text;
  v_name text;
  v_unit integer;
  v_slot integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_group_id uuid;
  v_rate numeric(5, 4) := 0.15;
  v_shift public.cashier_shifts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := lower(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('cash_pos', 'transfer_pos', 'card_pos') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  v_dni := nullif(regexp_replace(coalesce(p_customer_dni, ''), '\D', '', 'g'), '');
  if v_dni is null or length(v_dni) < 7 or length(v_dni) > 11 then
    raise exception 'DNI_REQUIRED' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_name is null then
    v_name := 'Comprador POS';
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

  if p_shift_id is not null then
    select * into v_shift
    from public.cashier_shifts s
    where s.id = p_shift_id
    for update of s;
  else
    select * into v_shift
    from public.cashier_shifts s
    where s.event_id = p_event_id
      and s.cashier_id = p_staff_id
      and s.status = 'open'
    for update of s
    limit 1;
  end if;

  if not found then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'open'
     or v_shift.event_id is distinct from p_event_id
     or v_shift.cashier_id is distinct from p_staff_id then
    raise exception 'SHIFT_INVALID' using errcode = '23514';
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
    tt.sold,
    greatest(1, least(50, coalesce(tt.admit_count, 1)))
    into v_tier_event, v_price, v_unit_fee, v_capacity, v_sold, v_admit
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
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone,
    cashier_shift_id
  )
  values (
    p_staff_id,
    v_subtotal,
    round(v_unit_fee * p_quantity, 2),
    v_subtotal,
    'paid',
    v_method,
    v_phone,
    v_shift.id
  )
  returning id into v_order_id;

  for v_unit in 1..p_quantity loop
    v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

    for v_slot in 1..v_admit loop
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
        totp_secret,
        holder_name,
        holder_dni,
        group_id,
        group_slot,
        max_admissions,
        admissions_used
      )
      values (
        p_event_id,
        p_tier_id,
        p_staff_id,
        v_qr,
        'valid'::public.ticket_status,
        v_order_id,
        false,
        v_secret,
        v_name,
        v_dni,
        v_group_id,
        case when v_admit > 1 then v_slot else null end,
        1,
        0
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

    perform public.fulfill_tier_combo_items(
      v_order_id,
      p_tier_id,
      p_staff_id,
      'valid'
    );
  end loop;

  update public.cashier_shifts
  set
    cash_sales_total = cash_sales_total
      + case when v_method = 'cash_pos' then v_subtotal else 0 end,
    card_sales_total = card_sales_total
      + case when v_method = 'card_pos' then v_subtotal else 0 end,
    transfer_sales_total = transfer_sales_total
      + case when v_method = 'transfer_pos' then v_subtotal else 0 end,
    tickets_sold = tickets_sold + (p_quantity * v_admit),
    updated_at = now()
  where id = v_shift.id;
end;
$$;

revoke all on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid
) from public;
grant execute on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid
) to authenticated, service_role;

-- 6) Emisión masiva de cortesías
create or replace function public.issue_complimentary_batch_tx(
  p_event_id uuid,
  p_staff_id uuid,
  p_tier_id uuid,
  p_mode text,
  p_guests jsonb default '[]'::jsonb,
  p_unnamed_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_event public.events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_admit integer;
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_batch_id uuid := gen_random_uuid();
  v_order_id uuid;
  v_guest jsonb;
  v_units integer := 0;
  v_qr_total integer := 0;
  v_unit integer;
  v_slot integer;
  v_group_id uuid;
  v_secret text;
  v_name text;
  v_dni text;
  v_email text;
  v_phone text;
  v_free_cap integer;
  v_free_used integer;
  v_ticket_ids uuid[] := '{}';
  v_one uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_mode not in ('named', 'unnamed') then
    raise exception 'INVALID_MODE' using errcode = '22023';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_event.organizer_id is distinct from p_staff_id
     and not exists (
       select 1 from public.profiles p
       where p.id = p_staff_id and p.role = 'super_admin'
     ) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  select * into v_tier
  from public.ticket_tiers tt
  where tt.id = p_tier_id
  for update of tt;

  if not found or v_tier.event_id is distinct from p_event_id then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_admit := greatest(1, least(50, coalesce(v_tier.admit_count, 1)));

  if v_mode = 'named' then
    if p_guests is null or jsonb_typeof(p_guests) <> 'array'
       or jsonb_array_length(p_guests) < 1 then
      raise exception 'GUESTS_REQUIRED' using errcode = '22023';
    end if;
    v_units := jsonb_array_length(p_guests);
  else
    v_units := coalesce(p_unnamed_count, 0);
    if v_units < 1 then
      raise exception 'COUNT_REQUIRED' using errcode = '22023';
    end if;
  end if;

  v_qr_total := v_units * v_admit;
  if v_qr_total > 3000 then
    raise exception 'BATCH_TOO_LARGE' using errcode = '22023';
  end if;

  if (v_tier.capacity - v_tier.sold) < v_units then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  v_free_cap := coalesce(v_event.max_free_tickets, 0);
  if v_free_cap > 0 then
    select count(*)::integer into v_free_used
    from public.tickets t
    where t.event_id = p_event_id
      and t.batch_id is not null
      and t.status::text in ('valid', 'used', 'pending_payment', 'scanned');

    if (v_free_used + v_qr_total) > v_free_cap then
      raise exception 'FREE_CAP_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  update public.ticket_tiers
  set sold = sold + v_units
  where id = p_tier_id;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method
  )
  values (
    p_staff_id,
    0,
    0,
    0,
    'paid',
    'cash_pos'
  )
  returning id into v_order_id;

  if v_mode = 'unnamed' then
    for v_unit in 1..v_units loop
      v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;
      for v_slot in 1..v_admit loop
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');
        insert into public.tickets (
          event_id, tier_id, owner_id, qr_code, totp_secret, status, order_id,
          is_dynamic_qr, holder_name, holder_dni, group_id, group_slot,
          batch_id, max_admissions, admissions_used
        )
        values (
          p_event_id, p_tier_id, p_staff_id,
          'cpl_' || replace(gen_random_uuid()::text, '-', ''),
          v_secret, 'valid'::public.ticket_status, v_order_id,
          false, 'Cortesía', null, v_group_id,
          case when v_admit > 1 then v_slot else null end,
          v_batch_id, 1, 0
        )
        returning id into v_one;
        v_ticket_ids := array_append(v_ticket_ids, v_one);
      end loop;
      perform public.fulfill_tier_combo_items(v_order_id, p_tier_id, p_staff_id, 'valid');
    end loop;
  else
    for v_guest in select value from jsonb_array_elements(p_guests)
    loop
      v_dni := nullif(regexp_replace(coalesce(v_guest ->> 'dni', ''), '\D', '', 'g'), '');
      if v_dni is null or length(v_dni) < 7 or length(v_dni) > 11 then
        raise exception 'DNI_REQUIRED' using errcode = '22023';
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
          'Invitado'
        );
      end if;

      v_email := nullif(lower(btrim(coalesce(v_guest ->> 'email', ''))), '');
      v_phone := nullif(btrim(coalesce(v_guest ->> 'telefono', v_guest ->> 'phone', '')), '');

      v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;
      for v_slot in 1..v_admit loop
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');
        insert into public.tickets (
          event_id, tier_id, owner_id, qr_code, totp_secret, status, order_id,
          is_dynamic_qr, holder_name, holder_dni, holder_email, group_id, group_slot,
          batch_id, max_admissions, admissions_used
        )
        values (
          p_event_id, p_tier_id, p_staff_id,
          'cpl_' || replace(gen_random_uuid()::text, '-', ''),
          v_secret, 'valid'::public.ticket_status, v_order_id,
          false, v_name, v_dni, v_email, v_group_id,
          case when v_admit > 1 then v_slot else null end,
          v_batch_id, 1, 0
        )
        returning id into v_one;
        v_ticket_ids := array_append(v_ticket_ids, v_one);
      end loop;
      perform public.fulfill_tier_combo_items(v_order_id, p_tier_id, p_staff_id, 'valid');
    end loop;
  end if;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'order_id', v_order_id,
    'units', v_units,
    'tickets_issued', coalesce(array_length(v_ticket_ids, 1), 0),
    'admit_count', v_admit,
    'ticket_ids', to_jsonb(v_ticket_ids)
  );
end;
$$;

revoke all on function public.issue_complimentary_batch_tx(
  uuid, uuid, uuid, text, jsonb, integer
) from public;
grant execute on function public.issue_complimentary_batch_tx(
  uuid, uuid, uuid, text, jsonb, integer
) to authenticated, service_role;

comment on function public.issue_complimentary_batch_tx is
  'Emite hasta 3000 QRs de cortesía (CSV nominado o lote innombrado) en una sola TX.';
