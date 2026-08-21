-- P137: las acreditaciones no consumen ni validan cupo comercial de ticket_tiers.
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

  if v_channel <> 'accreditation'
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

  if v_channel <> 'accreditation' then
    update public.ticket_tiers
    set sold = sold + v_units
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
  'Emite un lote Print Studio. Acreditaciones: sin cupo comercial ni incremento de sold.';
