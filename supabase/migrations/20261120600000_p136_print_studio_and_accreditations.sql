-- =============================================================================
-- P136: Print Studio + acreditaciones (canal, folio, plantillas, lotes)
-- Additive: no altera columnas existentes de tickets.
-- =============================================================================

-- 1) Plantillas de diseño (mm / DPI / layout). Sin inventario.
create table if not exists public.ticket_templates (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  medium text not null default 'press_sheet',
  page_width_mm numeric not null default 150,
  page_height_mm numeric not null default 70,
  dpi integer not null default 300,
  layout_json jsonb not null default '{}'::jsonb,
  assets_json jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_templates_medium_check
    check (medium in ('press_sheet', 'thermal_80', 'thermal_58', 'badge', 'wristband')),
  constraint ticket_templates_dpi_check
    check (dpi between 72 and 600),
  constraint ticket_templates_page_check
    check (page_width_mm > 0 and page_height_mm > 0),
  constraint ticket_templates_name_len
    check (char_length(btrim(name)) between 2 and 80)
);

create index if not exists ticket_templates_organizer_idx
  on public.ticket_templates (organizer_id, created_at desc);

drop trigger if exists ticket_templates_set_updated_at on public.ticket_templates;
create trigger ticket_templates_set_updated_at
before update on public.ticket_templates
for each row execute function public.set_updated_at();

comment on table public.ticket_templates is
  'Diseños de entrada física / acreditación. El inventario vive en tickets.';

-- 2) Lotes de emisión (folios + plantilla).
create table if not exists public.ticket_print_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.ticket_templates (id) on delete set null,
  tier_id uuid references public.ticket_tiers (id) on delete set null,
  name text not null,
  mode text not null default 'unnamed',
  channel text not null default 'batch_print',
  series_code text not null default 'A',
  seq_start integer not null default 1,
  seq_end integer not null,
  status text not null default 'ready',
  issued_count integer not null default 0,
  artifact_csv_url text,
  artifact_pdf_url text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint ticket_print_batches_mode_check
    check (mode in ('unnamed', 'named', 'seated', 'accreditation')),
  constraint ticket_print_batches_channel_check
    check (channel in ('batch_print', 'complimentary', 'accreditation')),
  constraint ticket_print_batches_status_check
    check (status in ('draft', 'ready', 'void')),
  constraint ticket_print_batches_seq_check
    check (seq_start >= 1 and seq_end >= seq_start),
  constraint ticket_print_batches_series_check
    check (series_code ~ '^[A-Z0-9]{1,8}$'),
  constraint ticket_print_batches_name_len
    check (char_length(btrim(name)) between 2 and 80)
);

create index if not exists ticket_print_batches_event_idx
  on public.ticket_print_batches (event_id, created_at desc);

create index if not exists ticket_print_batches_organizer_idx
  on public.ticket_print_batches (organizer_id, created_at desc);

comment on table public.ticket_print_batches is
  'Lote de imprenta, cortesía o acreditación con serie y rango de folios.';

-- 3) Columnas nuevas en tickets (nullable / default).
alter table public.tickets
  add column if not exists issuance_channel text not null default 'online';

alter table public.tickets
  add column if not exists print_batch_id uuid;

alter table public.tickets
  add column if not exists serial_label text;

alter table public.tickets
  add column if not exists serial_seq integer;

alter table public.tickets
  add column if not exists staff_role text;

alter table public.tickets
  add column if not exists staff_company text;

alter table public.tickets
  drop constraint if exists tickets_issuance_channel_check;

alter table public.tickets
  add constraint tickets_issuance_channel_check
  check (
    issuance_channel in (
      'online',
      'pos',
      'batch_print',
      'complimentary',
      'accreditation'
    )
  );

alter table public.tickets
  drop constraint if exists tickets_serial_seq_check;

alter table public.tickets
  add constraint tickets_serial_seq_check
  check (serial_seq is null or serial_seq >= 1);

alter table public.tickets
  drop constraint if exists tickets_print_batch_id_fkey;

alter table public.tickets
  add constraint tickets_print_batch_id_fkey
  foreign key (print_batch_id)
  references public.ticket_print_batches (id)
  on delete set null;

create unique index if not exists idx_tickets_batch_serial
  on public.tickets (print_batch_id, serial_seq)
  where print_batch_id is not null;

create index if not exists tickets_issuance_channel_idx
  on public.tickets (event_id, issuance_channel);

create index if not exists tickets_print_batch_id_idx
  on public.tickets (print_batch_id)
  where print_batch_id is not null;

comment on column public.tickets.issuance_channel is
  'Canal de emisión: online | pos | batch_print | complimentary | accreditation.';
comment on column public.tickets.print_batch_id is
  'Lote de Print Studio. Distinto del batch_id huérfano de cortesías legacy.';
comment on column public.tickets.serial_label is
  'Folio humano, ej. A-00001.';
comment on column public.tickets.staff_role is
  'Rol de acreditación (Técnica, Prensa, VIP, Producción).';
comment on column public.tickets.staff_company is
  'Empresa / medio de la acreditación.';

-- Backfill de canal a partir de señales existentes. No toca filas ya etiquetadas.
update public.tickets as t
set issuance_channel = 'pos'
where t.issuance_channel = 'online'
  and (
    t.qr_code like 'pos_%'
    or exists (
      select 1
      from public.orders as o
      where o.id = t.order_id
        and o.payment_method::text in ('cash_pos', 'card_pos', 'transfer_pos')
        and t.batch_id is null
    )
  );

update public.tickets as t
set issuance_channel = 'complimentary'
where t.issuance_channel = 'online'
  and t.batch_id is not null;

-- 4) RLS: el organizador ve y muta sus plantillas y lotes.
alter table public.ticket_templates enable row level security;
alter table public.ticket_print_batches enable row level security;

revoke all on table public.ticket_templates from public, anon;
revoke all on table public.ticket_print_batches from public, anon;

grant select, insert, update, delete on table public.ticket_templates
  to authenticated;
grant select, insert, update on table public.ticket_print_batches
  to authenticated;
grant all on table public.ticket_templates to service_role;
grant all on table public.ticket_print_batches to service_role;

drop policy if exists ticket_templates_select_own on public.ticket_templates;
create policy ticket_templates_select_own
  on public.ticket_templates
  for select
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

drop policy if exists ticket_templates_insert_own on public.ticket_templates;
create policy ticket_templates_insert_own
  on public.ticket_templates
  for insert
  to authenticated
  with check (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

drop policy if exists ticket_templates_update_own on public.ticket_templates;
create policy ticket_templates_update_own
  on public.ticket_templates
  for update
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  )
  with check (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

drop policy if exists ticket_print_batches_select_own on public.ticket_print_batches;
create policy ticket_print_batches_select_own
  on public.ticket_print_batches
  for select
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

drop policy if exists ticket_print_batches_insert_own on public.ticket_print_batches;
create policy ticket_print_batches_insert_own
  on public.ticket_print_batches
  for insert
  to authenticated
  with check (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

drop policy if exists ticket_print_batches_update_own on public.ticket_print_batches;
create policy ticket_print_batches_update_own
  on public.ticket_print_batches
  for update
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  );

-- 5) RPC: emite el lote y los tickets estáticos (TPS) en una transacción.
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

  if (v_tier.capacity - v_tier.sold) < v_units then
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

  update public.ticket_tiers
  set sold = sold + v_units
  where id = p_tier_id;

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
  'Emite un lote Print Studio: tickets is_dynamic_qr=false, folio y canal. El payload TPS se firma en app.';
