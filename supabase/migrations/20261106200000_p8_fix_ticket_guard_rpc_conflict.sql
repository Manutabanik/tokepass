-- =============================================================================
-- P8 - Allow authorized SECURITY DEFINER RPCs to mutate ticket internals
-- =============================================================================
-- Direct authenticated writes remain restricted to scan columns by the column
-- grants established in P4/P5. The trigger only enforces scanner invariants;
-- checking auth.role() here also blocked legitimate authenticated RPC calls.

create or replace function public.enforce_ticket_scan_column_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_door_only boolean := false;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.validated_at is distinct from old.validated_at
       and new.scanned_at is not distinct from old.scanned_at then
      new.scanned_at := new.validated_at;
    elsif new.scanned_at is distinct from old.scanned_at
       and new.validated_at is not distinct from old.validated_at then
      new.validated_at := new.scanned_at;
    end if;

    v_is_door_only :=
      public.user_has_event_staff_role(
        old.event_id,
        auth.uid(),
        'door_staff'::public.event_staff_role
      )
      and not public.owns_event(old.event_id)
      and not public.is_super_admin();

    if v_is_door_only and new.status is distinct from old.status then
      if not (
        old.status = 'valid'::public.ticket_status
        and new.status = 'used'::public.ticket_status
      ) then
        raise exception 'TICKET_SCAN_TRANSITION_DENIED'
          using errcode = '42501';
      end if;

      if new.validated_by is distinct from auth.uid() then
        raise exception 'TICKET_VALIDATED_BY_REQUIRED'
          using errcode = '42501';
      end if;

      if new.scanned_at is null then
        raise exception 'TICKET_SCANNED_AT_REQUIRED'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Keep direct clients limited to scanner-controlled fields. Internal RPCs run
-- as their function owner and retain access to transfer/order/QR columns.
revoke update on public.tickets from authenticated, anon;
grant update (status, scanned_at, validated_at, validated_by)
  on public.tickets to authenticated;
