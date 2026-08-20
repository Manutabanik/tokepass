-- P130 · Estado dead en colas + replay de webhooks (super_admin)

-- -----------------------------------------------------------------------------
-- 1) CHECK status incluye dead
-- -----------------------------------------------------------------------------
alter table public.payment_webhook_events
  drop constraint if exists payment_webhook_events_status_check;

alter table public.payment_webhook_events
  add constraint payment_webhook_events_status_check
  check (status in ('pending', 'processing', 'processed', 'failed', 'dead'));

comment on column public.payment_webhook_events.status is
  'pending=ACK al PSP; processing=worker; processed=finalize ok; failed=reintento; dead=agotado (>=12).';

alter table public.notification_outbox
  drop constraint if exists notification_outbox_status_check;

alter table public.notification_outbox
  add constraint notification_outbox_status_check
  check (status in ('pending', 'processing', 'processed', 'failed', 'dead'));

comment on column public.notification_outbox.status is
  'pending=encolado; processing=worker; processed=enviado; failed=reintento; dead=agotado (>=12).';

-- -----------------------------------------------------------------------------
-- 2) Reabrir dead (y failed) cuando llega un evento nuevo o un dispute
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_payment_webhook_event(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns table (
  id uuid,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider public.payment_provider_type;
  v_tx text := nullif(btrim(coalesce(p_external_event_id, '')), '');
  v_type text := coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment');
  v_dispute boolean := v_type ~* 'chargeback|in_mediation|refund';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_tx is null then
    return;
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return;
  end;

  return query
  insert into public.payment_webhook_events (
    provider,
    external_event_id,
    event_type,
    payload,
    status,
    processed_at,
    available_at,
    last_error
  )
  values (
    v_provider,
    v_tx,
    v_type,
    coalesce(p_payload, '{}'::jsonb),
    'pending',
    null,
    now(),
    null
  )
  on conflict (provider, external_event_id) do update
  set
    payload = excluded.payload,
    event_type = excluded.event_type,
    status = case
      when public.payment_webhook_events.status = 'processing'
        then public.payment_webhook_events.status
      when v_dispute
        or public.payment_webhook_events.status in ('pending', 'failed', 'dead')
        then 'pending'
      else public.payment_webhook_events.status
    end,
    processed_at = case
      when public.payment_webhook_events.status = 'processing'
        then public.payment_webhook_events.processed_at
      when v_dispute
        or public.payment_webhook_events.status in ('pending', 'failed', 'dead')
        then null
      else public.payment_webhook_events.processed_at
    end,
    attempts = case
      when public.payment_webhook_events.status = 'processing'
        then public.payment_webhook_events.attempts
      when v_dispute
        or public.payment_webhook_events.status in ('pending', 'failed', 'dead')
        then 0
      else public.payment_webhook_events.attempts
    end,
    available_at = now(),
    last_error = null
  where public.payment_webhook_events.status in (
    'pending',
    'failed',
    'processed',
    'processing',
    'dead'
  )
  returning
    public.payment_webhook_events.id,
    public.payment_webhook_events.status::text;

  if not found then
    return query
    select e.id, e.status
    from public.payment_webhook_events as e
    where e.provider = v_provider
      and e.external_event_id = v_tx;
  end if;
end;
$$;

revoke all on function public.enqueue_payment_webhook_event(text, text, text, jsonb)
  from public;
grant execute on function public.enqueue_payment_webhook_event(text, text, text, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- 3) Replay DLQ: solo service_role o super_admin
-- -----------------------------------------------------------------------------
create or replace function public.replay_dead_webhook_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.is_super_admin()
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_event_id is null then
    return false;
  end if;

  update public.payment_webhook_events
  set
    status = 'pending',
    attempts = 0,
    available_at = now(),
    last_error = null,
    processed_at = null
  where id = p_event_id
    and status = 'dead';

  return found;
end;
$$;

revoke all on function public.replay_dead_webhook_event(uuid) from public, anon;
grant execute on function public.replay_dead_webhook_event(uuid)
  to authenticated, service_role;

comment on function public.replay_dead_webhook_event(uuid) is
  'Reencola un webhook dead. Solo super_admin o service_role.';
