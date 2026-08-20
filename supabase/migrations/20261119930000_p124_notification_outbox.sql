-- P124 · Outbox de notificaciones (email / WhatsApp)
-- El finalize y las cesiones encolan en la misma TX. El worker envia despues.

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  type text not null,
  channel text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint notification_outbox_type_check
    check (type in ('order_paid', 'ticket_transfer', 'pos_issue')),
  constraint notification_outbox_channel_check
    check (channel in ('email', 'whatsapp')),
  constraint notification_outbox_status_check
    check (status in ('pending', 'processing', 'processed', 'failed'))
);

create index if not exists notification_outbox_queue_idx
  on public.notification_outbox (status, available_at, created_at)
  where status in ('pending', 'failed');

create unique index if not exists notification_outbox_order_paid_uidx
  on public.notification_outbox (order_id, type, channel)
  where order_id is not null and type in ('order_paid', 'pos_issue');

create unique index if not exists notification_outbox_transfer_uidx
  on public.notification_outbox ((payload ->> 'transfer_id'), channel)
  where type = 'ticket_transfer' and payload ? 'transfer_id';

alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from public, anon, authenticated;
grant all on table public.notification_outbox to service_role;

create or replace function public.enqueue_notification_outbox(
  p_order_id uuid,
  p_type text,
  p_channel text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_type not in ('order_paid', 'ticket_transfer', 'pos_issue') then
    raise exception 'invalid_notification_type' using errcode = '22023';
  end if;
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'invalid_notification_channel' using errcode = '22023';
  end if;

  insert into public.notification_outbox (
    order_id, type, channel, payload, status
  )
  values (
    p_order_id,
    p_type,
    p_channel,
    coalesce(p_payload, '{}'::jsonb),
    'pending'
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    if p_type = 'ticket_transfer' then
      select id into v_id
      from public.notification_outbox
      where type = 'ticket_transfer'
        and channel = p_channel
        and payload ->> 'transfer_id' = coalesce(p_payload ->> 'transfer_id', '')
      order by created_at desc
      limit 1;
    else
      select id into v_id
      from public.notification_outbox
      where type = p_type
        and channel = p_channel
        and order_id is not distinct from p_order_id
      order by created_at desc
      limit 1;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.enqueue_notification_outbox(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_notification_outbox(uuid, text, text, jsonb)
  to service_role;

create or replace function public.enqueue_order_paid_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type text;
  v_event_title text;
  v_ticket_ids uuid[];
begin
  if tg_op = 'UPDATE' and old.status::text = 'paid' then
    return new;
  end if;

  if new.payment_method in ('cash_pos', 'card_pos', 'transfer_pos') then
    v_type := 'pos_issue';
  else
    v_type := 'order_paid';
  end if;

  select coalesce(e.title, 'Evento TokePass')
    into v_event_title
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  where t.order_id = new.id
  limit 1;

  select coalesce(array_agg(t.id), '{}'::uuid[])
    into v_ticket_ids
  from public.tickets as t
  where t.order_id = new.id;

  perform public.enqueue_notification_outbox(
    new.id,
    v_type,
    'email',
    jsonb_build_object(
      'order_id', new.id,
      'event_title', coalesce(v_event_title, 'Evento TokePass'),
      'payment_method', new.payment_method,
      'ticket_ids', to_jsonb(v_ticket_ids),
      'phone', new.customer_phone
    )
  );

  perform public.enqueue_notification_outbox(
    new.id,
    v_type,
    'whatsapp',
    jsonb_build_object(
      'order_id', new.id,
      'event_title', coalesce(v_event_title, 'Evento TokePass'),
      'payment_method', new.payment_method,
      'ticket_ids', to_jsonb(v_ticket_ids),
      'phone', new.customer_phone
    )
  );

  return new;
end;
$$;

drop trigger if exists notification_outbox_on_order_paid on public.orders;
create trigger notification_outbox_on_order_paid
  after insert or update of status on public.orders
  for each row
  when (new.status::text = 'paid')
  execute function public.enqueue_order_paid_notifications();

create or replace function public.enqueue_ticket_transfer_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_title text;
  v_order_id uuid;
begin
  select t.order_id, coalesce(e.title, 'Evento TokePass')
    into v_order_id, v_event_title
  from public.tickets as t
  left join public.events as e on e.id = t.event_id
  where t.id = new.original_ticket_id;

  perform public.enqueue_notification_outbox(
    v_order_id,
    'ticket_transfer',
    'email',
    jsonb_build_object(
      'transfer_id', new.id,
      'receiver_email', new.receiver_email,
      'event_title', coalesce(v_event_title, 'Evento TokePass'),
      'sender_user_id', new.sender_id,
      'ticket_id', new.original_ticket_id,
      'open_claim', coalesce(new.open_claim, false)
    )
  );

  return new;
end;
$$;

drop trigger if exists notification_outbox_on_ticket_transfer on public.ticket_transfers;
create trigger notification_outbox_on_ticket_transfer
  after insert on public.ticket_transfers
  for each row
  execute function public.enqueue_ticket_transfer_notifications();

create or replace function public.claim_notification_outbox(
  p_limit integer default 15
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 40));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with picked as (
    select n.id
    from public.notification_outbox as n
    where n.status in ('pending', 'failed')
      and n.available_at <= now()
      and n.attempts < 12
    order by n.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_outbox as n
  set
    status = 'processing',
    attempts = n.attempts + 1
  from picked
  where n.id = picked.id
  returning n.*;
end;
$$;

revoke all on function public.claim_notification_outbox(integer) from public;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create or replace function public.requeue_notification_outbox(
  p_order_id uuid,
  p_type text,
  p_payload jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'invalid_order_id' using errcode = '22023';
  end if;
  if p_type not in ('order_paid', 'ticket_transfer', 'pos_issue') then
    raise exception 'invalid_notification_type' using errcode = '22023';
  end if;

  update public.notification_outbox
  set
    status = 'pending',
    attempts = 0,
    last_error = null,
    available_at = now(),
    processed_at = null,
    payload = case
      when p_payload is null then payload
      else payload || p_payload
    end
  where order_id = p_order_id
    and type = p_type;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    perform public.enqueue_notification_outbox(
      p_order_id,
      p_type,
      'email',
      coalesce(p_payload, '{}'::jsonb)
    );
    perform public.enqueue_notification_outbox(
      p_order_id,
      p_type,
      'whatsapp',
      coalesce(p_payload, '{}'::jsonb)
    );
    return 2;
  end if;

  return v_count;
end;
$$;

revoke all on function public.requeue_notification_outbox(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.requeue_notification_outbox(uuid, text, jsonb)
  to service_role;
