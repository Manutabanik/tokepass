-- P148: Paso 3 del wizard (medios de cobro y política de devolución)
-- persiste en events. Defaults iguales a la UI histórica.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'event_refund_policy'
  ) then
    create type public.event_refund_policy as enum (
      'organizer',
      'no_refunds',
      'until_24h'
    );
  end if;
end
$$;

alter table public.events
  add column if not exists accepts_mercado_pago boolean not null default true;

alter table public.events
  add column if not exists accepts_pos_payments boolean not null default true;

alter table public.events
  add column if not exists refund_policy public.event_refund_policy not null default 'organizer';

comment on column public.events.accepts_mercado_pago is
  'Si el evento acepta cobro online con Mercado Pago.';
comment on column public.events.accepts_pos_payments is
  'Si el evento acepta cobro en boletería (efectivo, tarjeta o transferencia).';
comment on column public.events.refund_policy is
  'Política de devolución: a criterio del organizador, sin devoluciones, o hasta 24 h antes.';
