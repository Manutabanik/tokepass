-- P115a · Enum reserved (transaccion propia)
-- Postgres 55P04: un valor de enum nuevo no se puede usar hasta el COMMIT.
-- Correr este archivo SOLO y esperar OK. Despues P115b.

alter type public.ticket_resale_listing_status
  add value if not exists 'reserved';
