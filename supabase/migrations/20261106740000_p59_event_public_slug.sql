-- =============================================================================
-- Tokepass · Slug publico SEO de eventos
-- 2026-08-14
--
-- URL canónica: /eventos/{slug}
-- El slug se genera una vez (titulo + 8 chars del UUID) y no se reescribe
-- al cambiar el titulo, para preservar indexacion.
-- =============================================================================

create or replace function public.tokepass_slugify(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(coalesce(nullif(btrim(p_text), ''), 'evento'));
  s := translate(
    s,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'
  );
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  if s is null or s = '' then
    s := 'evento';
  end if;
  return left(s, 72);
end;
$$;

comment on function public.tokepass_slugify(text) is
  'Normaliza titulos de evento a slugs ASCII para URLs publicas.';

alter table public.events
  add column if not exists slug text;

update public.events
set slug = public.tokepass_slugify(title)
  || '-'
  || substr(replace(id::text, '-', ''), 1, 8)
where slug is null or btrim(slug) = '';

alter table public.events
  alter column slug set not null;

create unique index if not exists events_slug_key
  on public.events (slug);

create or replace function public.events_assign_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.tokepass_slugify(new.title)
      || '-'
      || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists events_assign_slug on public.events;
create trigger events_assign_slug
  before insert or update of slug, title
  on public.events
  for each row
  execute function public.events_assign_slug();

comment on column public.events.slug is
  'Identificador publico estable para /eventos/{slug}. No reescribir una vez asignado.';
