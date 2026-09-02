-- P209 · Elimina los getters de hold que quedaron huérfanos tras la
-- modularización del checkout. `get_seating_unit_cart_hold` y `get_ga_cart_hold`
-- perdieron su único llamador cuando se borraron las Server Actions
-- `getSeatingUnitCartHold` y `getGaCartHold`. Ninguna otra función SQL las
-- invoca, así que no hay dependencias internas que romper.
--
-- La firma va explícita a propósito: `drop function` sin lista de argumentos
-- falla con "function name is not unique" si en la base desplegada existe
-- alguna sobrecarga que no esté en las migraciones.

drop function if exists public.get_seating_unit_cart_hold(uuid, uuid, uuid);
drop function if exists public.get_ga_cart_hold(uuid, uuid);
