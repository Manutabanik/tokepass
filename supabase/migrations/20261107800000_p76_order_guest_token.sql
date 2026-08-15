-- P76 Native guest access token on orders (no third-party auth).

alter table public.orders
  add column if not exists guest_token text;

create unique index if not exists orders_guest_token_uidx
  on public.orders (guest_token)
  where guest_token is not null;
