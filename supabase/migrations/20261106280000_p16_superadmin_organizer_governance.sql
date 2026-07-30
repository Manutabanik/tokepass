-- =============================================================================
-- P16: Superadmin organizer governance
-- =============================================================================

alter type public.organizer_approval_status
  add value if not exists 'suspended';

create or replace function public.is_approved_organizer(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = p_user_id
      and (
        p.role::text = 'super_admin'
        or (
          p.role::text = 'admin'
          and p.organizer_approval_status::text = 'approved'
        )
      )
  );
$$;

revoke all on function public.is_approved_organizer(uuid) from public;
grant execute on function public.is_approved_organizer(uuid)
  to authenticated, service_role;

-- Reservation RPCs run as SECURITY DEFINER, so RLS alone cannot stop sales.
-- This invariant blocks every new ticket issuance path (general, seating, POS)
-- when the event organizer is not approved.
create or replace function public.enforce_approved_organizer_ticket_issuance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizer_id uuid;
begin
  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = new.event_id;

  if v_organizer_id is null
     or not public.is_approved_organizer(v_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_require_approved_organizer on public.tickets;
create trigger tickets_require_approved_organizer
before insert on public.tickets
for each row execute function public.enforce_approved_organizer_ticket_issuance();

revoke all on function public.enforce_approved_organizer_ticket_issuance()
  from public, anon, authenticated;
grant execute on function public.enforce_approved_organizer_ticket_issuance()
  to service_role;

comment on function public.is_approved_organizer(uuid) is
  'True only for superadmins or organizers whose lifecycle status is approved.';
