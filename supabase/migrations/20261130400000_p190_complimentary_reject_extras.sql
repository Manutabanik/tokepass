-- P190: complimentary RPC must not issue extras as door tickets.
-- Body is P139 plus assert_pos_admission_tier (P189) after the tier lock.

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

  perform public.assert_pos_admission_tier(p_event_id, p_tier_id);

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
          batch_id, max_admissions, admissions_used, issuance_channel
        )
        values (
          p_event_id, p_tier_id, p_staff_id,
          'cpl_' || replace(gen_random_uuid()::text, '-', ''),
          v_secret, 'valid'::public.ticket_status, v_order_id,
          false, 'Cortesía', null, v_group_id,
          case when v_admit > 1 then v_slot else null end,
          v_batch_id, 1, 0, 'complimentary'
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
      if v_dni is not null and (length(v_dni) < 7 or length(v_dni) > 11) then
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
          batch_id, max_admissions, admissions_used, issuance_channel
        )
        values (
          p_event_id, p_tier_id, p_staff_id,
          'cpl_' || replace(gen_random_uuid()::text, '-', ''),
          v_secret, 'valid'::public.ticket_status, v_order_id,
          false, v_name, v_dni, v_email, v_group_id,
          case when v_admit > 1 then v_slot else null end,
          v_batch_id, 1, 0, 'complimentary'
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
