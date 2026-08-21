-- P144: modalidad de entrega (presencial / online) y campos opcionales
-- para expandir TokePass a cursos y webinars sin romper el flujo de predio.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'event_delivery_mode'
  ) then
    create type public.event_delivery_mode as enum ('PRESENCIAL', 'ONLINE');
  end if;
end
$$;

alter table public.events
  add column if not exists delivery_mode public.event_delivery_mode not null default 'PRESENCIAL';

alter table public.events
  add column if not exists access_link text;

comment on column public.events.delivery_mode is
  'PRESENCIAL = puerta/QR. ONLINE = transmisión; no exige recinto.';
comment on column public.events.access_link is
  'URL de acceso (Zoom/Meet/LMS). Solo revelar post-compra. No exponer en catálogo público.';

alter table public.events
  alter column location drop not null;

alter table public.tickets
  alter column qr_code drop not null;

alter table public.tickets
  alter column totp_secret drop not null;

update public.events e
set delivery_mode = 'ONLINE'
where e.delivery_mode = 'PRESENCIAL'
  and (
    lower(trim(coalesce(e.location, ''))) in ('online', 'streaming / online')
    or exists (
      select 1
      from public.venues v
      where v.id = e.venue_id
        and (
          lower(trim(v.name)) = 'streaming / online'
          or lower(trim(coalesce(v.location, ''))) = 'online'
        )
    )
  );

insert into public.event_categories (name, slug, icon_name, sort_order, is_active)
values ('Cursos & Negocios', 'cursos-negocios', 'graduationcap', 50, true)
on conflict (slug) do nothing;

create index if not exists events_delivery_mode_idx
  on public.events (delivery_mode);
