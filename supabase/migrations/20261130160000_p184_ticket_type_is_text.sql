-- P184 · tickets.ticket_type es text (P55). Varias RPCs viejas castean a
-- public.ticket_type, un tipo que nunca se creó. Eso tumba el reserve del
-- sandbox: type "public.ticket_type" does not exist.
-- Un domain de text hace válidos esos casts y sigue insertando en columnas text.
-- Mismo parche para order_status por si quedó algún cast de P167/P168.

do $$
begin
  if not exists (
    select 1
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_type'
  ) then
    execute 'create domain public.ticket_type as text';
  end if;

  if not exists (
    select 1
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'order_status'
  ) then
    execute 'create domain public.order_status as text';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_type'
      and t.typtype = 'd'
  ) then
    execute $c$
      comment on domain public.ticket_type is
        'Alias de text. tickets.ticket_type nunca fue enum; las RPCs casteaban a este nombre.'
    $c$;
  end if;

  if exists (
    select 1
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'order_status'
      and t.typtype = 'd'
  ) then
    execute $c$
      comment on domain public.order_status is
        'Alias de text. orders.status nunca fue enum; P167/P168 casteaban a este nombre.'
    $c$;
  end if;
end
$$;
