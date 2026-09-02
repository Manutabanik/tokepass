# Base de datos y seguridad

Documentación del esquema de TokePass: relaciones exactas entre `events`, `ticket_tiers`,
`tickets` y `event_seating_units`, el modelo de Row Level Security, y cómo los bloqueos
transaccionales en SQL evitan la sobreventa.

El contrato tipado vive en `types/database.ts` (4774 líneas). La verdad del esquema vive en
`supabase/migrations/` (240 archivos, orden alfabético = cronológico). Cuando difieren, **gana
el SQL**: varios `Relationships` de `database.ts` están vacíos o incompletos.

La última migración es **P209**
(`20261132300000_p209_drop_unused_cart_hold_getters.sql`), que elimina dos funciones de lectura
de holds; está documentada en 6.2. Todavía no se regeneraron los tipos, así que hoy
`database.ts` declara funciones que el SQL ya borró.

## Índice

1. [Las cuatro tablas centrales](#1-las-cuatro-tablas-centrales)
2. [Relaciones exactas](#2-relaciones-exactas)
3. [Restricciones e invariantes de esquema](#3-restricciones-e-invariantes-de-esquema)
4. [Row Level Security](#4-row-level-security)
5. [Bloqueos transaccionales y anti-sobreventa](#5-bloqueos-transaccionales-y-anti-sobreventa)
6. [Ciclo de vida del hold](#6-ciclo-de-vida-del-hold)
7. [Defensas en profundidad](#7-defensas-en-profundidad)
8. [Deuda y riesgos verificados](#8-deuda-y-riesgos-verificados)

---

## 1. Las cuatro tablas centrales

### 1.1 El modelo en una frase

`events` es el show. `ticket_tiers` son los **SKU** que se venden (una tarifa, un combo, un
extra). `event_seating_units` son los **lugares físicos** materializados desde el mapa
interactivo. `tickets` son las **unidades vendidas**, y son la única tabla que toca las otras
tres a la vez.

```
                    ┌──────────┐
                    │  events  │
                    └────┬─────┘
              ┌──────────┼──────────────┐
              │          │              │
        ┌─────▼──────┐   │   ┌──────────▼────────────┐
        │ticket_tiers│   │   │ event_seating_units   │
        │   (SKU)    │◄──┼───┤ (lugar en el mapa)    │
        └─────┬──────┘   │   └──────────┬────────────┘
              │          │              │
              │     ┌────▼────┐         │
              └────►│ tickets │◄────────┘
                    └─────────┘
                         ▲
                    ┌────┴────┐
                    │ orders  │
                    └─────────┘
```

`event_seating_units.tier_id` no es decorativo: **cada lugar del mapa pertenece a una
tarifa**, y de ahí sale el precio. Es el puente entre la geometría del mapa
(`docs/MAP_BUILDER.md`) y el inventario vendible.

### 1.2 Columnas que importan

No es el listado completo — es el subconjunto que participa de las relaciones, los bloqueos y
la seguridad.

**`events`**

| Columna | Tipo | Rol |
| --- | --- | --- |
| `id` | `uuid` PK | — |
| `organizer_id` | `uuid` → `profiles.id` | Dueño; base de casi toda policy de escritura |
| `status` | `event_status` | `draft`, `published`, `cancelled`, `completed`, `archived`, `rejected`, `pending_approval`, `needs_revision`, `paused`, `cancellation_requested` |
| `visibility` | `text` CHECK | `public` \| `private` \| `guest_list_only` |
| `qr_type` | `text` CHECK | `dynamic` \| `static` — decide Living QR vs estático (`docs/WALLET_SECURITY.md`) |
| `max_tickets_per_user` | `integer` | Fallback del tope por SKU (ver §8.2) |
| `venue_map` | `jsonb` | Estado del editor de mapas |
| `slug`, `preview_key` | `text` UNIQUE | Acceso público y preview de borrador |
| `is_deleted` | `boolean` | Soft delete (P166); hay una policy **restrictiva** que lo filtra |
| `schedule_days` | `jsonb` | Espejo desnormalizado de `event_schedules` |

**`ticket_tiers`**

| Columna | Tipo | Rol |
| --- | --- | --- |
| `id` | `uuid` PK | — |
| `event_id` | `uuid` → `events.id` **CASCADE** | — |
| `capacity` / `digital_capacity` / `total_capacity` | `integer` | **Tres columnas sincronizadas por triggers.** Ver §1.4 |
| `physical_capacity` | `integer` | Cupo de papel (imprenta) |
| `sold` | `integer` | **Contador pesimista del canal digital.** El corazón del anti-sobreventa GA |
| `physical_issued` | `integer` | Contador de papel |
| `layout_type` | `text` CHECK | `general` \| `table_combo` \| `numbered_seat` |
| `tier_type` / `ticket_type` | `text` CHECK | `seated\|general\|addon\|bundle` / `standard\|combo\|extra` |
| `capacity_per_unit` | `integer` 1..100 | Personas por mesa |
| `admit_count` | `integer` 1..50 | QRs que se emiten por unidad |
| `day_id` | `uuid` → `event_schedules.id` | Jornada (multi-día) |
| `seating_sector_id` | `text` | Clave de sector **en el JSON del mapa**, no un FK |
| `min_purchase_limit` / `max_purchase_limit` | `integer` | Tope **por transacción** (P140) |

**`tickets`**

| Columna | Tipo | Rol |
| --- | --- | --- |
| `id` | `uuid` PK | — |
| `event_id` | `uuid` → `events.id` **CASCADE** | Desnormalizado; debe coincidir con el evento del tier |
| `tier_id` | `uuid` → `ticket_tiers.id` **CASCADE** | — |
| `seating_unit_id` | `uuid` → `event_seating_units.id` **SET NULL** | Lugar ocupado |
| `owner_id` | `uuid` → `profiles.id`, **nullable** | Nullable desde P15 (invitados) |
| `order_id` | `uuid` → `orders.id` | La orden **es** el line item; no hay `order_items` |
| `status` | `ticket_status` | `pending_payment`, `valid`, `used`, `scanned`, `transferred`, `cancelled`, `refunded`, `revoked` |
| `totp_secret` | `text` UNIQUE, nullable | Clave HMAC del Living QR |
| `group_id` / `group_slot` | `uuid` / `integer` | Mesa agrupada: N QRs, un slot cada uno |
| `max_admissions` / `admissions_used` | `integer` | CHECK `admissions_used <= max_admissions` |
| `issuance_channel` | `text` CHECK | `online`, `pos`, `batch_print`, `complimentary`, `accreditation` |
| `is_test` | `boolean` | Sandbox; excluido de dashboards financieros |
| `event_date_id` | `uuid` → `event_schedules.id` | Jornada del ticket |

**`event_seating_units`**

| Columna | Tipo | Rol |
| --- | --- | --- |
| `id` | `uuid` PK | — |
| `event_id` / `tier_id` | `uuid` **CASCADE** ambos | — |
| `layout_item_id` | `text` NOT NULL | **ID estable del elemento en el JSON del mapa** |
| `sector_id` / `sector_name` | `text` | Clave de sector del layout |
| `label`, `row_label`, `row_number` | — | Etiquetas que terminan en la billetera |
| `layout_type` | `text` CHECK | `table_combo` \| `numbered_seat` |
| `capacity_per_unit` | `integer` 1..100 | — |
| `status` | `text` CHECK | `available` \| `reserved` \| `sold` \| `blocked` |
| `reserved_by` | `uuid`, **sin FK** | Comprador del hold; integridad solo por RPC |
| `reserved_until` | `timestamptz` | Vencimiento del hold |
| `reserved_order_id` / `sold_order_id` | `uuid` → `orders.id` **SET NULL** | — |
| `event_date_id` | `uuid` → `event_schedules.id` | Jornada |

### 1.3 Vocabulario de estados: `tickets` vs `event_seating_units`

Es la confusión más común al llegar. **Son dos máquinas de estado distintas:**

| Concepto | En `tickets.status` | En `event_seating_units.status` |
| --- | --- | --- |
| Hold de checkout | `pending_payment` | `reserved` |
| Vendido y válido | `valid` | `sold` |
| Ingresado | `used` / `scanned` | `sold` (no cambia) |
| Bloqueado por el organizador | no existe | `blocked` |

`reserved` **no** es un valor del enum `ticket_status`, y `pending_payment` no es un valor del
estado de la unidad. El trigger `sync_seating_unit_from_ticket` traduce entre ambos.

### 1.4 Columnas desnormalizadas y quién las mantiene

| Columna | Tabla | Mantenida por |
| --- | --- | --- |
| `sold` | `ticket_tiers` | RPCs de reserva, `expire_seating_order`, `recount_event_tier_channel_stock` |
| `physical_issued` | `ticket_tiers` | `issue_print_batch_tx` |
| `capacity` ↔ `total_capacity` | `ticket_tiers` | Trigger `ticket_tiers_sync_total_capacity` (P71) |
| `capacity` ↔ `digital_capacity` | `ticket_tiers` | Trigger `ticket_tiers_sync_digital_capacity` (P201) |
| `status`, `reserved_*`, `sold_order_id` | `event_seating_units` | RPCs de hold/claim + trigger desde tickets |
| `event_seating_occupancy` | tabla réplica | Trigger `sync_event_seating_occupancy` |
| `schedule_days` | `events` | RPCs de publicación; el canónico es `event_schedules` |

**El split digital/físico (P201)** es la razón de tanta columna de capacidad. Dos funciones
clasifican el canal:

```sql
-- 20261131500000_p201_digital_physical_tier_capacity.sql
create or replace function public.ticket_channel_uses_digital_stock(p_channel text)
  ... in ('online', 'pos', 'complimentary');

create or replace function public.ticket_channel_uses_physical_stock(p_channel text)
  ... = 'batch_print';
```

Desde P201, **`sold` cuenta solo el canal digital**. Las entradas de imprenta van a
`physical_issued` contra `physical_capacity`. Vender por web y tirar papel a la vez no puede
consumir el mismo cupo dos veces, pero tampoco comparten stock.

---

## 2. Relaciones exactas

### 2.1 Aristas entre las cuatro centrales

| Hijo | Columna | Padre | ON DELETE |
| --- | --- | --- | --- |
| `ticket_tiers` | `event_id` | `events.id` | **CASCADE** |
| `tickets` | `event_id` | `events.id` | **CASCADE** |
| `tickets` | `tier_id` | `ticket_tiers.id` | **CASCADE** |
| `tickets` | `seating_unit_id` | `event_seating_units.id` | **SET NULL** |
| `event_seating_units` | `event_id` | `events.id` | **CASCADE** |
| `event_seating_units` | `tier_id` | `ticket_tiers.id` | **CASCADE** |

El `SET NULL` de `seating_unit_id` es deliberado y asimétrico frente a los `CASCADE`: si se
rematerializa el mapa y desaparece una unidad, **el ticket sobrevive**. Un ticket es un
comprobante de pago; perder el lugar asignado es recuperable, borrar la venta no.

Por eso `docs/MAP_BUILDER.md` documenta la estabilización de IDs: `layout_item_id` tiene que
sobrevivir a los guardados del editor, o cada save huerfaniza inventario.

### 2.2 Vecinos

| Hijo | Columna | Padre | ON DELETE |
| --- | --- | --- | --- |
| `events` | `organizer_id` | `profiles.id` | NO ACTION |
| `events` | `venue_id` | `venues.id` | SET NULL |
| `events` | `category_id` | `event_categories.id` | — |
| `ticket_tiers` | `day_id` | `event_schedules.id` | NO ACTION (deferrable) |
| `ticket_tiers` | `zone_id` | `event_zones.id` | SET NULL |
| `tickets` | `order_id` | `orders.id` | NO ACTION |
| `tickets` | `transferred_from_id` | `tickets.id` (self) | SET NULL |
| `tickets` | `event_date_id` | `event_schedules.id` | SET NULL |
| `tickets` | `phase_id` | `ticket_tier_phases.id` | SET NULL |
| `tickets` | `print_batch_id` | `ticket_print_batches.id` | SET NULL |
| `tickets` | `validated_by` | `profiles.id` | SET NULL |
| `event_seating_units` | `reserved_order_id` / `sold_order_id` | `orders.id` | SET NULL |
| `event_seating_units` | `event_date_id` | `event_schedules.id` | SET NULL |
| `seat_holds` | `seating_unit_id` | `event_seating_units.id` | **CASCADE** |
| `seat_holds` | `event_id` | `events.id` | **CASCADE** |
| `seating_maps` | `event_id` | `events.id` | **CASCADE** |
| `zone_tier_pricing` | `ticket_tier_id` | `ticket_tiers.id` | **CASCADE** |

**`orders` no tiene FK a `events`.** El vínculo es indirecto vía `tickets.order_id`. Consecuencia
práctica: para saber a qué evento pertenece una orden hay que pasar por sus tickets, y eso
explica por qué las métricas del organizador viven en RPCs `SECURITY DEFINER` en lugar de
policies (§4.5).

### 2.3 Cardinalidades y columnas de enlace

| Relación | Cardinalidad | Columna que usa el código |
| --- | --- | --- |
| `events` → `ticket_tiers` | 1 : N | `ticket_tiers.event_id` |
| `ticket_tiers` → `tickets` | 1 : N | `tickets.tier_id` |
| `ticket_tiers` → `event_seating_units` | 1 : N (solo tarifas con asiento) | `event_seating_units.tier_id` |
| `event_seating_units` → `tickets` | 1 : 0..1 butaca simple; 1 : N mesa | `tickets.seating_unit_id` + `group_slot` |
| `orders` → `tickets` | 1 : N | `tickets.order_id` |
| Mapa → inventario | por elemento y jornada | `layout_item_id` + `sector_id` + `event_date_id` |

**Nombres que no existen** y suelen buscarse por costumbre:

- `order_items` → no existe; los line items **son** los `tickets` vía `order_id`.
- `store_redemptions` → es `item_redemptions`.
- `event_sectors` → no es tabla; los sectores son claves de texto dentro del JSON del mapa.
- `event_seating_maps` → la tabla es `seating_maps`.

### 2.4 El stack de asientos duplicado

Conviven **dos linajes de asientos** en el esquema:

| | Legacy | Actual |
| --- | --- | --- |
| Cadena | `event_zones` → `seats` → `tickets.seat_id` | `seating_maps` → `event_seating_units` → `tickets.seating_unit_id` |
| Unicidad | `tickets_seat_id_key` (parcial) | `unique_valid_seat` / `unique_valid_seat_slot` (P200) |
| Estado en uso | residual | **el que usa el checkout** |

Código nuevo usa `seating_unit_id`. El camino `seat_id` sigue con su FK y su índice único, así
que no rompe nada, pero no recibe features.

---

## 3. Restricciones e invariantes de esquema

### 3.1 Un ticket ocupante por lugar (P200)

Es la red de contención final contra la doble venta, independiente de toda la lógica de los
RPCs:

```sql
-- 20261131400000_p200_unique_valid_seat.sql:69
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
  where status in (/* ídem */)
    and seating_unit_id is not null
    and group_slot is not null;
```

Tres decisiones de diseño en el `WHERE`:

1. **`pending_payment` está incluido.** El asiento se considera ocupado desde que se reserva,
   no desde que se paga. Sin eso, dos personas podrían llegar a la pasarela con el mismo
   asiento y una perdería el pago.
2. **`cancelled`, `refunded` y `transferred` están excluidos.** Un asiento cancelado vuelve a
   venderse sin tocar el ticket viejo, que queda como registro histórico.
3. **Dos índices, no uno.** En Postgres, `NULL` no colisiona con `NULL` en un índice único, así
   que un único índice sobre `(event_id, seating_unit_id, group_slot)` no protegería las
   butacas simples. El índice se parte según `group_slot IS NULL`.

La migración además **escanea duplicados antes de crear los índices** y aborta con `23505` si
encuentra alguno, para no fallar a mitad de un `CREATE INDEX` en producción.

### 3.2 Materialización por jornada

```sql
-- 20261129170000_p174_occupancy_day_and_inventory_invariants.sql:111
create unique index if not exists event_seating_units_tier_day_layout_uidx
  on public.event_seating_units (event_id, tier_id, layout_item_id, event_date_id)
  where event_date_id is not null;

create unique index if not exists event_seating_units_tier_undated_layout_uidx
  on public.event_seating_units (event_id, tier_id, layout_item_id)
  where event_date_id is null;
```

Más dos índices "físicos" equivalentes sobre `(event_id, sector_id, layout_item_id)`. El par
`is not null` / `is null` aparece por el mismo motivo que en §3.1: un evento de un solo día
tiene `event_date_id` nulo y necesita su propio índice.

P173 tuvo que **borrar** el índice único original de P13 (`(event_id, tier_id, layout_item_id)`
sin jornada) porque impedía que la misma Mesa 5 existiera en viernes y sábado.

### 3.3 CHECK relevantes

```sql
-- 00001_core_schema.sql:62
sold integer not null default 0 check (sold >= 0 and sold <= capacity),
```

El invariante más importante del sistema, y es una sola línea de la primera migración: **el
contador nunca puede pasar la capacidad**. Cualquier bug en un RPC que intente sobrevender
choca contra este CHECK y aborta la transacción entera.

```sql
-- 20261106900000_p66_cart_seating_hold.sql:10
add constraint event_seating_units_hold_shape_check
check (
  (status = 'reserved' and reserved_by is not null and reserved_until is not null)
  or status <> 'reserved'
);
```

Una unidad `reserved` **tiene** que decir quién la tiene y hasta cuándo. Imposible dejar un
asiento reservado para nadie y para siempre. P66 relajó la exigencia original de P13 de que
también hubiera `reserved_order_id`, porque los holds de carrito ocurren antes de que exista
la orden.

```sql
-- 20261131500000_p201_digital_physical_tier_capacity.sql:56
check (physical_issued <= physical_capacity)
```

### 3.4 Enums y dominios

**Enums de PostgreSQL:** `event_status`, `ticket_status`, `event_delivery_mode`
(`PRESENCIAL`\|`ONLINE`), `event_age_restriction` (`atp`\|`16`\|`18`), `event_staff_role`.

**Dominios por CHECK de texto** (no enums): `events.qr_type`, `events.visibility`,
`ticket_tiers.layout_type`, `event_seating_units.status`, `tickets.issuance_channel`,
`tickets.ticket_type`, `seat_holds.status`.

La mezcla es deuda: los enums necesitan `ALTER TYPE ... ADD VALUE` (que no corre en una
transacción con otros DDL), y los CHECK de texto se editan con un `ALTER TABLE`. Los valores
que fueron creciendo con el producto quedaron como texto.

---

## 4. Row Level Security

### 4.1 El principio

RLS es la **última línea** de tres. `proxy.ts` filtra rutas, las Server Actions validan
autorización, y RLS decide filas. Las tres siempre, porque las dos primeras son código de
aplicación y la tercera es el motor de base de datos.

Unas ~70 tablas tienen RLS habilitado. Empieza en la primera migración:

```sql
-- 00001_core_schema.sql:242
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.tickets enable row level security;
```

Las policies son **permisivas** (se combinan con `OR`) salvo una excepción restrictiva
(§4.3).

### 4.2 Funciones helper: el modelo de roles en SQL

Ninguna policy consulta tablas directamente para autorizar. Todas delegan a helpers
`SECURITY DEFINER` con `search_path` fijado. La razón es §4.4.

| Helper | Responde |
| --- | --- |
| `is_super_admin()` | `profiles.role = 'super_admin'` |
| `is_approved_organizer(uid)` | super_admin, o `admin` con `organizer_approval_status = 'approved'` |
| `owns_event(event_id)` | `events.organizer_id = auth.uid()` |
| `has_active_event_assignment(event_id, uid)` | Staff activo y no vencido |
| `user_has_event_staff_role(event, uid, role)` | Rol de staff específico, activo |
| `user_is_event_organizer_or_staff(event, uid, roles[])` | Organizador o staff con alguno de esos roles |
| `buyer_can_read_event(event_id, uid)` | Tiene ticket u orden en ese evento |
| `organizer_owns_ticket_holder(profile_id, uid)` | Le vendió a esa persona |

Nota de vocabulario: **en SQL el organizador es `role = 'admin'`**; `types/auth.ts` lo llama
`admin` también, pero el producto le dice "organizador". `super_admin` es la plataforma.

```sql
-- 20261106180000_p6_fix_events_rls_recursion.sql:10
create or replace function public.has_active_event_assignment(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
...
  select exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = p_event_id
      and esa.user_id = p_user_id
      and esa.is_active = true
      and (esa.expires_at is null or esa.expires_at > now())
  );
```

El chequeo de `expires_at` es lo que hace que un turno de puerta caduque solo.

### 4.3 Policies de las tablas centrales

**`events`** — cinco caminos de lectura y uno restrictivo:

| Policy | Cmd | Rol | Condición |
| --- | --- | --- | --- |
| `events_select_published` | SELECT | `anon`, `authenticated` | `status = 'published'` y `visibility in ('public','private')` |
| `events_select_own` | SELECT | `authenticated` | `auth.uid() = organizer_id` |
| `events_select_staff_assigned` | SELECT | `authenticated` | `has_active_event_assignment(...)` |
| `events_select_as_ticket_holder` | SELECT | `authenticated` | `buyer_can_read_event(...)` |
| `events_not_soft_deleted` | SELECT **restrictive** | `anon`, `authenticated` | `is_deleted = false` o dueño o super_admin |
| `events_insert_own` / `events_update_own` | I/U | `authenticated` | dueño **y** `is_approved_organizer()` |
| `events_super_admin_all` | ALL | `authenticated` | `is_super_admin()` |

La policy restrictiva merece atención porque es la única del esquema:

```sql
-- 20261126120000_p166_devsecops_finance_idor.sql:16
create policy events_not_soft_deleted
  on public.events
  as restrictive
  for select
  to anon, authenticated
  using (
    is_deleted = false
    or organizer_id = (select auth.uid())
    or (select public.is_super_admin())
  );
```

Con `as restrictive` se combina con **AND** contra todas las permisivas. Sin eso, agregar el
soft delete habría requerido editar las cinco policies de lectura y cualquier policy futura
tendría que acordarse de filtrar. Así el filtro es transversal por construcción. `DELETE`
sobre events quedó revocado en la misma migración: los eventos no se borran, se marcan.

**`ticket_tiers`** — mismo patrón: público si el tier es `visibility = 'public'` y el evento
está publicado; dueño; staff; comprador vía `buyer_can_read_ticket_tier()`. Escritura solo
organizador aprobado. Además hay **revocación por columna**: `authenticated` no puede
actualizar `price`, `capacity` ni `sold`.

**`tickets`** — el caso más restringido:

| Policy | Cmd | Condición |
| --- | --- | --- |
| `tickets_select_own` | SELECT | `owner_id = auth.uid()` |
| `tickets_select_organized_event` | SELECT | `owns_event(event_id)` |
| `tickets_select_door_staff` | SELECT | `user_has_event_staff_role(..., 'door_staff')` |
| `tickets_update_door_staff` | UPDATE | door_staff, solo `valid` → `used` |
| `tickets_super_admin_all` | ALL | `is_super_admin()` |

Y por encima, permisos por columna:

```sql
-- 20261106200000_p8_fix_ticket_guard_rpc_conflict.sql:66
revoke update on public.tickets from authenticated, anon;
grant update (status, scanned_at, validated_at, validated_by)
  on public.tickets to authenticated;
```

Dos capas ortogonales: la policy decide **qué filas**, el `GRANT` decide **qué columnas**. Un
usuario autenticado no puede cambiar `totp_secret`, `owner_id` ni `max_admissions` de ningún
ticket, ni siquiera del suyo — eso pasa solo por RPCs (`execute_safe_transfer`).

**`event_seating_units`** — P19 revocó toda escritura a `authenticated` y P91 le quitó el acceso
a `anon`:

```sql
-- 20261106310000_p19_critical_seating_integrity.sql:57
revoke insert, update, delete on public.event_seating_units from authenticated;
grant select on public.event_seating_units to authenticated;
grant all on public.event_seating_units to service_role;
```

La lectura autenticada es solo para quien tiene el hold, el organizador, super_admin, o staff
activo. La **ocupación pública del mapa** se sirve desde la tabla réplica
`event_seating_occupancy`, que solo expone estado sin identidad del comprador. Es la razón de
existir de esa réplica: el plano del evento tiene que ser público sin filtrar quién reservó
qué.

**`orders`** — solo el comprador: `buyer_id = auth.uid()` o super_admin, y las escrituras solo
sobre órdenes `pending`. **No hay policy de lectura para el organizador**; las métricas van por
RPC (§4.5).

### 4.4 Caso de estudio: la recursión de RLS (P196 → P197)

Vale la pena entenderlo porque es el error de RLS más fácil de cometer.

**Lo que se quiso hacer.** Que un comprador pueda leer un evento aunque esté en `draft`, para
que sus entradas ya compradas no se rompan si el organizador despublica. P196 agregó una
policy con un `EXISTS` directo sobre `tickets`:

```sql
-- 20261131000000_p196_...sql:5
create policy events_select_as_ticket_holder
on public.events for select to authenticated
using (
  exists (
    select 1 from public.tickets as t
    where t.event_id = events.id and t.owner_id = (select auth.uid())
  )
);
```

**Por qué explotó.** Existía ya, del otro lado, una policy sobre `tickets` que consultaba
`events`. El ciclo:

1. Postgres evalúa la policy de `events` → necesita leer `tickets`.
2. Leer `tickets` activa RLS de `tickets` → `tickets_select_organized_event` consulta `events`.
3. Consultar `events` vuelve a evaluar `events_select_as_ticket_holder`.
4. **`42P17: infinite recursion detected in policy for relation "events"`.**

El mismo ciclo se daba por `venues_select_as_ticket_holder` → `events` → `tickets` → `events`.

**La solución.** Mover la consulta cruzada a una función `SECURITY DEFINER`, que lee las tablas
**sin re-entrar en RLS**:

```sql
-- 20261131100000_p197_fix_events_ticket_holder_rls_recursion.sql:9
create or replace function public.buyer_can_read_event(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user_id is not null
    and (
      exists (select 1 from public.tickets as t
              where t.event_id = p_event_id and t.owner_id = p_user_id)
      or exists (select 1 from public.orders as o
                 join public.tickets as t on t.order_id = o.id
                 where t.event_id = p_event_id and o.buyer_id = p_user_id)
    );
$$;
```

Y del otro lado, cerrar la arista de vuelta usando también un helper
(`using (public.owns_event(event_id))` en lugar del `EXISTS` sobre `events`).

**La regla que queda:** *una policy sobre A nunca debe consultar B directamente si alguna
policy sobre B consulta A.* Ante cualquier chequeo cruzado entre tablas, helper
`SECURITY DEFINER`. P6 ya había hecho lo mismo para el ciclo `events` ↔
`event_staff_assignments`; P197 lo repitió para `events` ↔ `tickets`. Es un patrón, no un
parche.

### 4.5 Qué evita RLS a propósito, y con qué se reemplaza

RLS no sirve para todo. Un contador de stock no se puede validar fila por fila, y las métricas
del organizador cruzan órdenes de miles de compradores. Esos caminos usan `service_role` o
`SECURITY DEFINER`, y **reemplazan RLS por un chequeo explícito de autorización**:

| Camino | Chequeo que sustituye a RLS |
| --- | --- |
| RPCs de reserva (`reserve_*`, `hold_*`) | `auth.role() = 'service_role'` o `auth.uid() = p_owner_id` |
| `scan_ticket_admission` | `user_is_event_organizer_or_staff(..., door_staff)` |
| `redeem_item` | `user_is_event_organizer_or_staff(..., bar_staff)` |
| `get_organizer_finance_summary` | service_role, o `auth.uid() = p_organizer_id`, o super_admin, **y** `is_approved_organizer` |
| `get_event_dashboard_metrics` | organizador, door_staff o super_admin |
| `claim_active_wallet_device` | `auth.uid()` |
| Columnas `is_featured` de `events` | Trigger `enforce_featured_columns_service_role` |

El patrón del chequeo financiero:

```sql
-- 20261118150000_p99_stock_payment_rls_hardening.sql:558
if coalesce(auth.role(), '') <> 'service_role'
   and (auth.uid() is null or auth.uid() <> p_organizer_id)
   and not public.is_super_admin() then
  raise exception 'Forbidden' using errcode = '42501';
end if;
```

Sin esa guarda, `SECURITY DEFINER` sería una puerta abierta a los datos de todos los
organizadores: cualquiera podría pasar el `p_organizer_id` de otro. Es prevención de IDOR
hecha a mano, porque no hay policy que pueda hacerla.

### 4.6 `search_path`: por qué se fija en todas

Toda función `SECURITY DEFINER` lleva `set search_path = ''` o `pg_catalog, extensions`. No es
cosmético:

```sql
-- 20261106190000_p7_fix_pgcrypto_search_path.sql:25
alter function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  set search_path = pg_catalog, extensions;
alter function public.execute_safe_transfer(uuid, text)
  set search_path = pg_catalog, extensions;
```

El ataque sin esto: una función `SECURITY DEFINER` corre con privilegios del dueño. Si su
`search_path` incluye un esquema donde el atacante puede crear objetos, puede definir su propia
`gen_random_bytes()` y **la función privilegiada llamaría a la del atacante**. Fijar el
`search_path` a esquemas confiables cierra la escalada. Por eso P7 también verifica que
`pgcrypto` viva en el esquema `extensions` gestionado por Supabase.

### 4.7 Acceso anónimo

`anon` puede leer eventos publicados con visibilidad `public` o `private`, sus tarifas
públicas, venues, artistas, `event_schedules`, `seating_maps` y la ocupación de asientos. Nada
más:

```sql
-- 20261124200000_p163_rls_production_hardening.sql:88
revoke insert, update, delete on table public.events from anon;
grant select on table public.events to anon;
grant select on table public.ticket_tiers to anon;
```

Los borradores quedan invisibles porque `events_select_published` exige `status = 'published'`.
`visibility = 'private'` **sí** pasa esa policy: son eventos no listados (acceso por link), no
eventos secretos. Realtime (P135) publica `events` y `ticket_tiers`, pero los clientes
suscriptos siguen filtrados por RLS.

---

## 5. Bloqueos transaccionales y anti-sobreventa

### 5.1 El modelo: dos fases

```
CLIC EN EL MAPA / CARRITO        CLIC EN PAGAR              WEBHOOK order.paid
         │                            │                            │
         ▼                            ▼                            ▼
    hold_seat /              purchase_held_seats_tx /       finalize_paid_order
hold_ga_tickets_for_cart    claim_and_reserve_ga_cart_tx
         │                            │                            │
   FOR UPDATE + hold          re-valida + INSERT tickets      tickets → valid
   TTL 15 min                 pending_payment                 units → sold
         │                            │
         └──── cron expire-orders ────┘  (libera todo a los 15 min)
```

Todo corre en **`READ COMMITTED`** con bloqueos de fila `FOR UPDATE`. **No** se usa
`SERIALIZABLE`, ni `LOCK TABLE`, ni `NOWAIT`.

La decisión de no usar `SERIALIZABLE` es correcta acá: con miles de compradores sobre las
mismas filas, los errores de serialización obligarían a reintentar casi todo. El bloqueo
pesimista explícito hace que los compradores **esperen en fila** en lugar de fallar y
reintentar.

### 5.2 Anti-sobreventa (a): entrada general

**Mecanismo: contador pesimista `ticket_tiers.sold` incrementado durante el hold.**

Es la parte contraintuitiva: el `sold` sube **cuando alguien pone algo en el carrito**, no
cuando paga. `hold_ga_tickets_for_cart` toma los bloqueos, valida, y suma:

```sql
-- 20261110300000_p94_hybrid_checkout_inventory.sql:350
perform set_config('lock_timeout', '4s', true);
perform 1 from events where id = p_event_id for update of e;

perform tt.id from ticket_tiers tt
where tt.id = any(v_tier_ids) order by tt.id for update of tt;

-- por cada item:
v_delta := v_qty - coalesce(prev_hold_qty, 0);
if v_delta > 0 then
  perform assert_cascade_stock_available(...);
  perform assert_logical_sector_stock(...);
end if;
if v_delta <> 0 then
  update ticket_tiers set sold = sold + v_delta;
end if;
```

La validación de capacidad, con evento, tarifa, fase y venue bloqueados:

```sql
-- 20261109900000_p90_multi_seating_lock_order.sql:1036
if (v_tier_cap - v_tier.sold + v_expired) < v_additional then
  raise exception 'Capacidad del ticket insuficiente'
    using errcode = 'P0001';
end if;
```

En la compra, `apply_ga_stock_for_reserve` **no vuelve a sumar** lo que ya estaba en el hold:
`consume_ga_cart_hold_for_reserve` devuelve 0 unidades adicionales si el hold cubre la
cantidad. Sin eso, el stock se consumiría dos veces por compra.

**El trade-off, explícito:** mientras hay holds vivos, la disponibilidad mostrada es **menor**
que la real. Un evento puede verse agotado con carritos abandonados. Es la dirección segura del
error: preferimos decir "agotado" de más que vender de más. Se compensa con el cron cada
minuto y con `purge_expired_checkout_holds()`, que corre al inicio de la validación de
capacidad y limpia holds vencidos antes de decidir.

### 5.3 Anti-sobreventa (b): butacas numeradas

**Mecanismo: estado de fila + ledger + índice único.** No hay contador; el inventario **es** el
conjunto de filas de `event_seating_units`.

```sql
-- 20261124120000_p164_seat_holds.sql:426
select * into v_unit from event_seating_units
  where id = p_seating_unit_id and event_id = p_event_id;
-- expira reservas vencidas
select * into v_unit from event_seating_units where id = ... for update;

if public.seat_is_sold(v_unit) then raise 'SEAT_UNAVAILABLE'; end if;
if exists (hold vivo de otra sesión) then raise 'SEAT_UNAVAILABLE'; end if;

update event_seating_units
   set status = 'reserved', reserved_by = p_owner_id,
       reserved_until = checkout_hold_until()
 where id = ... and status = 'available';   -- si no matchea → SEAT_UNAVAILABLE
```

La clave está en el `UPDATE ... WHERE status = 'available'` **ejecutado con la fila ya
bloqueada**. Es un compare-and-swap: aunque dos transacciones lleguen juntas, la segunda espera
el lock, y cuando entra ve `status = 'reserved'` y su `UPDATE` afecta cero filas.

### 5.4 Orden de bloqueo determinista

Un carrito mixto toca varias tarifas y varios asientos. Si dos compradores los tomaran en
orden distinto, se abrazarían en deadlock. P90 lo resuelve **ordenando por UUID**:

```sql
-- 20261109900000_p90_multi_seating_lock_order.sql:185
perform 1 from public.events as e where e.id = p_event_id for update of e;
...
-- :501
perform tt.id from public.ticket_tiers as tt
  where tt.id = any (v_tier_ids)
  order by tt.id
  for update of tt;

perform u.id from public.event_seating_units as u
  where u.id = any (v_seating_ids) and u.event_id = p_event_id
  order by u.id
  for update of u;
```

El orden global siempre es el mismo: **`events` → `ticket_tiers` (ordenadas) →
`event_seating_units` (ordenadas)** → `seat_holds` / fases / venues. El bloqueo del evento
funciona además como mutex por evento, y el `ORDER BY id` garantiza que dos transacciones
concurrentes pidan los mismos recursos en la misma secuencia.

P168 extendió lo mismo a la validación de holds en la compra con `sorted_cart_seat_ids()`, que
devuelve `array_agg(seat_id order by seat_id)` — antes se iteraba en el orden del carrito, que
lo elige el cliente.

**Bloqueo de aviso para sectores GA.** Los SKU de sector general no comparten fila, así que un
lock de fila no los serializa. Se usa un advisory lock transaccional:

```sql
-- 20261118150000_p99_stock_payment_rls_hardening.sql:37
perform pg_advisory_xact_lock(
  hashtext(p_event_id::text),
  hashtext(v_sector)
);
```

### 5.5 `lock_timeout` en lugar de esperar para siempre

Todos los RPCs de reserva empiezan con:

```sql
perform set_config('lock_timeout', '4s', true);
```

Si el lock no se consigue en 4 segundos, Postgres aborta con `55P03`
(`lock_not_available`). La aplicación lo traduce a un mensaje de demanda, no de agotado:

```ts
// lib/checkout/lock-timeout.ts
/** Postgres 55P03 / 40P01: el mutex del evento esta ocupado, no es sold-out. */
export const HIGH_DEMAND_LOCK_TIMEOUT = "HIGH_DEMAND_LOCK_TIMEOUT"

export const HIGH_DEMAND_LOCK_MESSAGE =
  "Hay alta demanda en este sector. Estamos procesando tu lugar, por favor reintenta en unos segundos."
```

`isHighDemandLockError()` reconoce `55p03`, `lock_not_available`, `lock timeout`, `40p01` y
`deadlock`, y sus tests verifican explícitamente que **`out_of_stock` y
`SEATING_UNIT_UNAVAILABLE` NO se confundan** con colisiones de lock. La distinción importa: un
agotado es definitivo y hay que ofrecer otra cosa; un lock ocupado se resuelve reintentando.

### 5.6 El cron nunca pelea con los compradores

Los trabajos de expiración usan `FOR UPDATE SKIP LOCKED` y procesan en lotes:

```sql
-- 20261131700000_p203_strict_hold_expiry.sql:519
for v_order_id in
  select o.id from orders o where o.status = 'pending' and ...
  limit v_batch
  for update skip locked
```

`SKIP LOCKED` significa "si otra transacción tiene esta fila, saltala y seguí". El cron nunca
bloquea un checkout en curso: las filas ocupadas se limpian en la corrida siguiente.

### 5.7 Códigos de error

| Excepción SQL | SQLSTATE | Qué ve el usuario |
| --- | --- | --- |
| `SEAT_UNAVAILABLE` / `SEATING_UNIT_UNAVAILABLE` | `P0001` | "Esa ubicación acaba de ser reservada" + refresco del plano |
| `SEAT_HOLD_EXPIRED` | `P0001` | Se venció la reserva; volver a elegir |
| `GENERAL_STOCK_UNAVAILABLE` | `P0001` | Sin stock en ese sector |
| `Capacidad del ticket insuficiente` | `P0001` | Agotado |
| `TIER_PURCHASE_MIN/MAX_EXCEEDED` | `P0001` | Límite por compra de ese SKU |
| `lock_not_available` | `55P03` | Mensaje de alta demanda |
| deadlock | `40P01` | Mensaje de alta demanda |
| violación de `unique_valid_seat` | `23505` | Conflicto (no debería ocurrir nunca) |
| `Forbidden` | `42501` | Sin permiso |

### 5.8 Idempotencia del checkout

Doble clic en "Pagar" no debe crear dos órdenes. P150 usa un advisory lock más una tabla de
claves:

```sql
-- 20261122190000_p150_checkout_idempotency.sql:64
perform pg_advisory_xact_lock(
  hashtext('tp-checkout:' || p_buyer_id::text),
  hashtext(p_idempotency_key::text)
);
```

Con la misma clave y el mismo fingerprint se reutiliza la orden `pending` o `paid`; si otra
transacción la está creando, se marca `in_progress` por 60 s; si el fingerprint no coincide,
error.

**Matiz importante:** la idempotencia evita órdenes duplicadas, **no** consumo duplicado de
stock. Eso lo garantizan los RPCs de reserva. Son dos problemas distintos con dos soluciones
distintas.

---

## 6. Ciclo de vida del hold

TTL único de **15 minutos** para todo:

```ts
// lib/checkout-hold.ts
export const GA_CHECKOUT_HOLD_MINUTES = 15
export const SEATING_HOLD_MINUTES = 15
```

```sql
-- 20261124120000_p164_seat_holds.sql:4
create or replace function public.checkout_hold_until()
returns timestamptz ... clock_timestamp() + interval '15 minutes'
```

| Etapa | Entrada general | Butaca numerada |
| --- | --- | --- |
| Hold de carrito | fila en `event_ga_cart_holds`; **`sold` ya sube** | `units.status = 'reserved'` + fila en `seat_holds`; **`sold` no sube** |
| Checkout | orden `pending` + tickets `pending_payment` | ídem, con `seating_unit_id` |
| Inicio de pago | `orders.payment_started_at`; P203 extiende +15 min | `freeze_seat_holds_for_payment` |
| Pagado | `finalize_paid_order`: tickets → `valid`, units → `sold` | ídem |
| Abandonado | cron baja `sold`, cancela tickets | cron borra holds, units → `available` |

El cron (`/api/cron/expire-orders`, cada minuto) llama a `expire_abandoned_orders`,
`expire_seating_orders`, `expire_seating_cart_holds`, `expire_ga_cart_holds`,
`expire_seat_holds` y `purge_expired_checkout_holds`.

**P203 cambió una regla:** los holds en `pending_payment` **también** mueren a los 15 minutos.
Comentarios de P167 decían que congelar el pago detenía la expiración; el comportamiento actual
es el de P203. Si algo dice lo contrario, está viejo.

`finalize_paid_order` bloquea la orden `FOR UPDATE` y es idempotente, porque Mercado Pago puede
reenviar el mismo webhook varias veces.

### 6.1 Dónde vive la retención de lugares

No hay una sola tabla de holds: hay **dos linajes**, uno por tipo de inventario. Si venís del
código buscando "la función que retiene el lugar", el punto de entrada depende de cuál mires.

| | Entrada general | Butaca numerada |
| --- | --- | --- |
| **Dónde vive el estado** | Fila en `event_ga_cart_holds` (`owner_id`, `tier_id`, `quantity`, `reserved_until`) **y** `ticket_tiers.sold` ya incrementado | Columnas de `event_seating_units` (`status = 'reserved'`, `reserved_by`, `reserved_until`, `reserved_order_id`) **y** fila en `seat_holds` |
| **Quién lo crea** | `hold_ga_tickets_for_cart` (última definición: P94) | `hold_seat` (P167), `hold_seating_unit_for_cart` (P164), `hold_seating_unit_for_cart_by_layout` (P176) |
| **Quién fija el TTL** | `checkout_hold_until()` → 15 min | `checkout_hold_until()` → 15 min |
| **Quién lo consume al pagar** | `claim_ga_cart_holds_for_checkout` + `consume_ga_cart_hold_for_reserve` | `purchase_held_seats_tx` |
| **Quién lo libera** | `expire_ga_cart_holds` | `expire_seat_holds`, `expire_seating_cart_holds` |
| **Cómo lo lee el cliente** | `select` directo sobre la tabla, acotado por RLS | `select` directo sobre la tabla, acotado por RLS |

La diferencia de fondo entre las dos columnas ya está en 5.2 y 5.3: en GA el contador `sold` sube
durante el hold, en butacas no. Lo que agrega esta tabla es **el mapa de nombres**, porque los
dos linajes usan verbos parecidos para cosas distintas.

La última fila es la que más confunde al leer el esquema. **La lectura del hold no pasa por
ninguna función:** desde P180 (`20261130120000_p180_guest_session_holds.sql`) tanto
`event_ga_cart_holds` como `seat_holds` tienen policies de `select` que acotan las filas al dueño
(`owner_id = auth.uid()`) o a su sesión de invitado (`user_session_id`), con `insert`/`update`/
`delete` revocados a `anon` y `authenticated`. El cliente consulta la tabla y RLS le devuelve
sólo su propio hold. No hace falta un RPC para eso.

### 6.2 Funciones eliminadas: los getters de hold (P209)

`get_seating_unit_cart_hold` y `get_ga_cart_hold` **ya no existen en el esquema.** Las borra:

```sql
-- supabase/migrations/20261132300000_p209_drop_unused_cart_hold_getters.sql
drop function if exists public.get_seating_unit_cart_hold(uuid, uuid, uuid);
drop function if exists public.get_ga_cart_hold(uuid, uuid);
```

Contexto, para que nadie las busque de nuevo:

- **Qué hacían.** Eran getters `security definer` de **sólo lectura**, con un chequeo de
  pertenencia (`auth.uid() = p_owner_id`, o `service_role`).
  `get_seating_unit_cart_hold` devolvía `(seating_unit_id, reserved_until)` de una unidad, y
  `get_ga_cart_hold` devolvía `(reserved_until, quantity)` agregando los holds vivos del
  comprador. Nada más.
- **Por qué borrarlas no cambia nada.** No escribían: no creaban, extendían ni liberaban holds.
  La retención es la de 6.1 y quedó intacta. Eran atajos de lectura que P180 volvió redundantes
  al exponer `select` con RLS sobre las tablas.
- **Quién las llamaba.** Sus últimos consumidores eran las Server Actions
  `getSeatingUnitCartHold` y `getGaCartHold`, eliminadas en la modularización del checkout.
  Ninguna otra función SQL las invocaba, así que no hubo dependencias internas que romper.
- **Por qué la firma va explícita.** `drop function` sin lista de argumentos falla con
  *"function name is not unique"* si en la base desplegada quedó alguna sobrecarga que no está en
  las migraciones.

Dos cosas que **no** hay que hacer por arrastre:

- **No borrar `seating_unit_is_owner_cart_hold`.** Era el helper que usaba
  `get_seating_unit_cart_hold`, pero no quedó huérfano: lo siguen invocando `hold_seat`,
  `hold_seating_unit_for_cart` y los caminos de POS y de jornada (P147, P164, P166, P167, P168,
  P175). Sigue siendo parte del mecanismo vivo.
- **No confiar en `types/database.ts` hasta regenerarlo.** El archivo generado todavía declara
  ambas funciones (`get_seating_unit_cart_hold`, `get_ga_cart_hold`), porque se regenera desde la
  base y la migración es posterior. Ya no hay código TypeScript que las llame, pero el tipo
  miente hasta que se aplique P209 y se corra `npx supabase gen types` (ver `docs/HANDOFF.md`).

---

## 7. Defensas en profundidad

Contra la sobreventa hay cinco capas independientes. Cualquiera de ellas sola prevendría el
problema; juntas hacen que un bug en una no se convierta en dinero perdido.

| Capa | Mecanismo | Qué atrapa |
| --- | --- | --- |
| 1 | `FOR UPDATE` en orden determinista | Concurrencia entre compradores |
| 2 | `UPDATE ... WHERE status = 'available'` (CAS) | Carreras que igual pasen el lock |
| 3 | CHECK `sold <= capacity` | Cualquier bug de contador |
| 4 | `unique_valid_seat` / `unique_valid_seat_slot` | Cualquier bug de asignación de asiento |
| 5 | Triggers `enforce_cascade_phase_sold`, `enforce_logical_sector_capacity` | Caminos que no pasan por el checkout (POS, cortesías) |

La capa 5 existe porque no todas las ventas pasan por el mismo RPC: hay boletería POS,
cortesías, acreditaciones e imprenta. Los triggers sobre `ticket_tiers.sold` se disparan
igual, sin importar quién escribió.

Además: `seat_holds` con único `(event_id, event_date_key, layout_item_id)`,
`purge_expired_checkout_holds()` que se autocura antes de validar, y la verificación previa de
duplicados en P200 antes de crear los índices.

**Cómo se valida en la práctica.** `npm run load:collision` lanza 100 VUs contra la misma
mesa. El éxito **no** es que todas respondan 200:

```js
// load-test.js:61
thresholds: {
  tokepass_reserve_ok: ["count<=1"],
```

Como dice `docs/SCALING_GUIDE.md`: *"en Mesa 12 el 99% debe fallar bien"*. Un conflicto de
negocio (`P0001`) es sano; un `500` o un timeout no.

---

## 8. Deuda y riesgos verificados

Lo siguiente se verificó leyendo el SQL actual, no es especulación.

### 8.1 El load test no ejerce el camino de producción

`load-test.js` llama a `reserve_seating_unit_tx`:

```js
// load-test.js:209
const res = postRpc("reserve_seating_unit_tx", {
  p_event_id: eventId, p_owner_id: ownerId,
  p_tier_id: tierId || null, p_seating_unit_id: unitId,
  p_promoter_id: null,
})
```

Pero la última definición de ese RPC es de **P67** (`20261106910000`): hold de 8 minutos, sin
ledger `seat_holds`, sin las validaciones de P164. La app usa el camino de dos fases
(`hold_seat` → `purchase_held_seats_tx`).

Consecuencia: la prueba de colisión valida el bloqueo de fila sobre `event_seating_units`, que
sigue siendo el mecanismo real, pero **no** ejercita `seat_holds`, ni la expiración de P203, ni
el orden de bloqueo de P168. El número que sale verde no cubre lo que corre en producción.

### 8.2 El tope por identidad no se aplica

P140 neutralizó dos funciones a propósito, para pasar de un tope global por evento a topes por
SKU:

```sql
-- 20261121000000_p140_ticket_tier_purchase_limits.sql:180
create or replace function public.assert_holder_identity_ticket_cap(
  p_event_id uuid, p_holder_dni text, p_holder_email text, p_requested integer
) returns void ... as $$
begin
  if p_event_id is null or coalesce(p_requested, 0) <= 0 then
    return;
  end if;
  return;          -- cuerpo vacío
end;
$$;
```

Y `count_user_event_tickets_for_limit()` devuelve `-100000`, un centinela para que la
comparación vieja siempre pase.

El reemplazo, `assert_cart_tier_purchase_limits()`, valida `min_purchase_limit` y
`max_purchase_limit` **leyendo solo `p_items`** — nunca consulta los tickets ya existentes. Es
decir, es un límite **por transacción**, no acumulado.

Efecto práctico: un revendedor con el mismo DNI puede hacer 10 compras separadas de 4 entradas
cada una y llevarse 40, aunque el SKU diga máximo 4. Los callers siguen invocando
`assert_holder_identity_ticket_cap` (P126), así que **parece** que hay un tope por identidad
cuando no lo hay. Si se quiere recuperar, la implementación de P118 está en el historial y usaba
advisory locks por identidad.

### 8.3 Sin reintento automático ante deadlock

`isHighDemandLockError()` detecta `55P03` y `40P01`, pero el checkout **no reintenta solo**: se
le muestra el mensaje de alta demanda y la persona tiene que volver a apretar. Con 4 s de
`lock_timeout` y un pico real, eso es fricción visible. Un reintento con backoff en el
servidor sería transparente.

### 8.4 Asimetría entre GA y asientos en el cupo de tarifa

GA incrementa `sold` en el hold; los asientos no. Para asientos el inventario son las filas, y
está bien. Pero el cupo de la **tarifa** de una zona mapeada se valida solo en la compra
(`assert_cascade_stock_available`), no al hacer clic en el mapa. Si una tarifa tiene menos
capacidad que asientos dibujados, la gente descubre el límite al pagar, no al elegir.

### 8.5 Otros puntos menores

- **`event_items` visible en borradores.** La policy incluye `status in ('published','draft')`,
  así que `anon` puede leer los SKU de tienda de un evento en borrador si conoce el `event_id`.
  Inconsistente con cómo se ocultan eventos y tarifas.
- **`ticket_tiers_select_staff` no chequea vigencia.** Otras policies de staff validan
  `is_active` y `expires_at`; esta no, así que staff vencido sigue leyendo tarifas.
- **`event_seating_units.reserved_by` no tiene FK** a `profiles`. La integridad depende solo de
  los RPCs.
- **Órdenes de invitado.** `orders_select_own` exige `buyer_id = auth.uid()`; una orden de
  invitado sin usuario no tiene camino de lectura por RLS y depende de RPC con token.
- **Tres columnas de capacidad** sincronizadas por triggers distintos, y `sold` que desde P201
  significa "digital" y no "total". Fácil de malinterpretar en una query nueva.
- **`batch_id` vs `print_batch_id`** en `tickets`: dos conceptos de lote (cortesías legacy vs
  Print Studio), uno sin FK.

---

## 9. Cobertura de tests

| Área | Suites |
| --- | --- |
| Mapeo de errores de lock | `lib/checkout/lock-timeout.test.ts` |
| Conflictos de stock y holds | `lib/checkout/revalidate-seat-holds.test.ts`, `lib/checkout-hold.test.ts` |
| Límites de compra | `lib/checkout-limits.test.ts` |
| Pooler y conexiones | `lib/supabase/pooler.test.ts` |
| Carga y colisión | `npm run load:collision` (100 VUs, se espera ≤1 éxito) |

Lo que **no** está cubierto por unit tests es el SQL mismo: las funciones y policies solo se
verifican corriendo las migraciones contra un proyecto real. Es la mayor brecha de testing del
proyecto.

## Documentos relacionados

- `docs/ARCHITECTURE.md` — stack, patrones y las tres capas de autorización.
- `docs/SCALING_GUIDE.md` — umbrales de Postgres el día del evento y runbook.
- `docs/MAP_BUILDER.md` — cómo el JSON del mapa se materializa en `event_seating_units`.
- `docs/WALLET_SECURITY.md` — `totp_secret`, Living QR y admisiones.
- `docs/ONBOARDING.md` — reglas de migraciones y de no tocar producción.
