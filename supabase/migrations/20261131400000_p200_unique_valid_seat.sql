-- P200 · Candado DB de asiento ocupado
--
-- La unicidad de butaca hoy vive en RPCs + FOR UPDATE. Este índice es el
-- freno absoluto ante un insert/update suelto (SQL editor, bug, job).
--
-- Adaptaciones respecto del SQL de diseño:
-- * tickets.status no tiene 'reserved' (enum ticket_status). El hold de
--   checkout es pending_payment; reserved vive en event_seating_units.
-- * used/scanned siguen ocupando la butaca: si no entran al predicado, un
--   ticket escaneado liberaría el índice y se podría volver a vender.
-- * Mesas (P53): N QRs válidos por seating_unit_id (group_slot 1..N).
--   El índice homónimo cubre asiento simple (group_slot IS NULL). El de
--   slot cubre la plaza de mesa.

do $$
declare
  v_dup integer;
begin
  select count(*)
    into v_dup
  from (
    select t.event_id, t.seating_unit_id
    from public.tickets as t
    where t.seating_unit_id is not null
      and t.group_slot is null
      and t.status in (
        'pending_payment'::public.ticket_status,
        'valid'::public.ticket_status,
        'used'::public.ticket_status,
        'scanned'::public.ticket_status
      )
    group by t.event_id, t.seating_unit_id
    having count(*) > 1
  ) as d;

  if v_dup > 0 then
    raise exception
      'unique_valid_seat: % asientos simples ocupados más de una vez'
      , v_dup
      using errcode = '23505';
  end if;

  select count(*)
    into v_dup
  from (
    select t.event_id, t.seating_unit_id, t.group_slot
    from public.tickets as t
    where t.seating_unit_id is not null
      and t.group_slot is not null
      and t.status in (
        'pending_payment'::public.ticket_status,
        'valid'::public.ticket_status,
        'used'::public.ticket_status,
        'scanned'::public.ticket_status
      )
    group by t.event_id, t.seating_unit_id, t.group_slot
    having count(*) > 1
  ) as d;

  if v_dup > 0 then
    raise exception
      'unique_valid_seat_slot: % plazas de mesa ocupadas más de una vez'
      , v_dup
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists unique_valid_seat
  on public.tickets (event_id, seating_unit_id)
  where status in (
      'pending_payment'::public.ticket_status,
      'valid'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    )
    and seating_unit_id is not null
    and group_slot is null;

create unique index if not exists unique_valid_seat_slot
  on public.tickets (event_id, seating_unit_id, group_slot)
  where status in (
      'pending_payment'::public.ticket_status,
      'valid'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    )
    and seating_unit_id is not null
    and group_slot is not null;

comment on index public.unique_valid_seat is
  'Un ticket ocupante por (evento, butaca) cuando no hay group_slot. Impide doble venta a nivel DB.';
comment on index public.unique_valid_seat_slot is
  'Un ticket ocupante por (evento, mesa, plaza). Mesas: N QRs, un group_slot cada uno.';
