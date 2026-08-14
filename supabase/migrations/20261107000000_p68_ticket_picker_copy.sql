-- P68: B2C ticket picker copy — short tier description, highlight badge,
-- and organizer-configurable default tab (Campo vs Ubicaciones).

alter table public.ticket_tiers
  add column if not exists description text;

alter table public.ticket_tiers
  add column if not exists highlight_badge text;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_description_len;

alter table public.ticket_tiers
  add constraint ticket_tiers_description_len
  check (description is null or char_length(description) <= 180);

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_highlight_badge_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_highlight_badge_check
  check (highlight_badge is null or highlight_badge = 'bestseller');

comment on column public.ticket_tiers.description is
  'Copia corta para el picker B2C (qué incluye la entrada).';

comment on column public.ticket_tiers.highlight_badge is
  'Badge opcional del organizador. bestseller = Más vendida.';

alter table public.events
  add column if not exists default_ticket_tab text not null default 'auto';

alter table public.events
  drop constraint if exists events_default_ticket_tab_check;

alter table public.events
  add constraint events_default_ticket_tab_check
  check (default_ticket_tab in ('auto', 'seated', 'general', 'bundle', 'addon'));

comment on column public.events.default_ticket_tab is
  'Tab inicial del picker B2C. auto = el de más stock público restante.';
