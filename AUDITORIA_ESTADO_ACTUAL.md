# Auditoría de estado actual — TokePass

**Fecha:** 21 de agosto de 2026  
**Alcance:** solo lectura (frontend, checkout, Supabase/PostgreSQL, Tailwind).  
**No se modificó código de producto.** Este archivo es el entregable de diagnóstico.

---

## 1. Resumen ejecutivo de salud

| Área | Score | Lectura |
| --- | ---: | --- |
| Backend / stock / concurrencia | 86 | Reserva atómica con `FOR UPDATE` en RPCs vigentes. El check de stock en TypeScript es preflight, no el candado. |
| Pagos / idempotencia | 84 | Webhook MP con firma, cola, ledger `(payment_id, status)` y `claim_and_finalize_paid_order`. Quedan lecturas previas no atómicas. |
| Multi-nicho (ONLINE / PRESENCIAL) | 72 | El modelo existe en migración P144 y el código tiene fallbacks, pero **P144 debe estar aplicada en prod**. Se relajó `NOT NULL` de QR/TOTP sin un `CHECK` de integridad. |
| UI / checkout / overflow | 77 | Tarjetas de ticket compactadas. Featured y storefront aislados. Quedan alturas fijas que recortan, un stepper GA legado muy alto y tokens hex sueltos. |
| **Salud global** | **79 / 100** | Plataforma vendible y endurecida, con deuda operativa (migraciones/RPC de fallback) y residual visual. No está en estado “enterprise cerrado”. |

**Veredicto:** TokePass no está en riesgo inminente de overbooking si las RPCs de reserva de producción están aplicadas. El riesgo real está en **desfase schema ↔ código** (P144 y RPCs viejos), **QR nulleable sin invariante presencial**, y **deuda visual** en hero/featured y en el selector GA del mapa.

---

## 2. Puntos críticos visuales (UI/UX)

### 2.1 Compactación de tickets — estado actual

Las tarjetas públicas de inventario **ya no** usan el layout alto (`p-5` + stepper abajo). El estándar vigente es fila compacta `px-5 py-3.5`:

| Superficie | Archivo | Línea | Estado |
| --- | --- | ---: | --- |
| Tickets por día | `components/public/ticket-tier-list.tsx` | 115 | Compacto (`py-3.5`, `justify-between`) |
| Mapa / unified card | `components/public/event-checkout-selector.tsx` | ~930 | Compacto |
| Extras / QuantityList | `components/public/event-checkout-selector.tsx` | ~1110 | Compacto |
| Combos / abonos | `components/public/bundle-card-selector.tsx` | ~92 | Compacto |
| Store extras | `components/public/event-store-upsell.tsx` | ~160 | Compacto |

**Residual alto (no compactado):**

- `components/b2c/universal-seat-selection/general-quantity.tsx` **36** — contenedor `px-6 py-8` y botones `size-14`. Este stepper sigue el patrón “parche negro / vacío” que se eliminó del storefront.
- `components/checkout/CheckoutTunnel.tsx` **2626** — el cuerpo del túnel usa `space-y-6 p-4`. No estira las cards, pero deja aire vertical de más entre bloques.
- Empty states con `py-8` (`ticket-tier-selector.tsx` **121**, **312**) son aceptables: no son tarjetas de compra.

### 2.2 Invariantes visuales y overlapping

**Bien resuelto**

- Featured: altura fija `h-[440px]`, título `line-clamp-2`, fecha/lugar `truncate`, `min-w-0` — `components/public/featured-banner-card.tsx` **42–96**.
- Poster de catálogo: `h-full` + `line-clamp-2` + `truncate` — `components/discovery/event-card.tsx` **243–325**.
- CTA + precio en featured van en Flexbox de una fila (`justify-between`) — **90–106**.

**Riesgos**

1. **Recorte interno en Featured (375–390px).**  
   `h-[440px]` + imagen `h-44` (176px) deja ~264px para pills + título 2 líneas + lineup + fechas + footer. El bloque de copy tiene `overflow-hidden` (**59**). Un lineup + pills de categoría **no cambia la altura de la card**, pero **puede recortar** el footer o las fechas. Invariante de tamaño: sí. Invariante de contenido visible: no.

2. **Poster card no tiene altura fija de contenido.**  
   `event-card.tsx` **304–326**: si hay lineup (`EventLineupTeaser`) la zona media crece. En un grid `items-stretch` las cards igualan altura por `h-full`, pero el bloque de texto no es isométrico. No es overflow; sí es “card que respira distinto según categoría/artistas”.

3. **CTA featured `whitespace-nowrap` + `shrink-0`** — `featured-banner-card.tsx` **102**. En 375px “Conseguí tus entradas” + icono es holgado pero rígido. Si el precio es largo, el precio trunca (`min-w-0`); el CTA no. Riesgo bajo de wrap/overflow.

4. **Punto Spotify hardcodeado** — `event-lineup-teaser.tsx` **89** (`bg-[#1DB954]`). Cosmético, no de layout.

### 2.3 Overflow horizontal (375–390px)

**Mitigado a nivel raíz**

- `app/layout.tsx` **91–96**: `html`/`body` con `max-w-[100vw] overflow-x-hidden`.
- `app/globals.css` **132–136**: mismo corte en `html, body`.

Eso **oculta** el scroll lateral; no siempre **elimina** el hijo que se pasa. Contenedores que *sí* scrollean en X de forma intencional (aislados):

| Archivo | Línea | Nota |
| --- | ---: | --- |
| `components/discovery/discovery-hub.tsx` | 356, 460 | Rail de chips `overflow-x-auto` + `flex-nowrap` + `shrink-0` |
| `components/discovery/filter-pills.tsx` | 32–44 | Igual |
| `components/public/event-checkout-selector.tsx` | 609–623 | Chips de día `min-w-[120px]` dentro de `overflow-x-auto` |

Estos rails **no** deberían romper el viewport si el padre tiene `overflow-x-hidden` (`discovery-hub.tsx` **419**). El riesgo residual es padding horizontal acumulado (`px-4` del rail + `px-4` del page) en 375px, no un `w-[390px]` fijo.

**No se encontró** `w-[390px]` en UI pública. El `min-w-[150px]` aparece en tablas superadmin (aceptable en desktop).

### 2.4 Aislación mobile vs desktop (ficha de evento)

| Pieza | Archivo | Línea | Aislación |
| --- | --- | ---: | --- |
| Aside de compra (desktop) | `event-storefront.tsx` | **595–596**, **743** | `hidden … lg:block` |
| Dock inferior (mobile) | `floating-checkout-dock.tsx` | **33** | `flex lg:hidden` |
| Notices sold-out/finished mobile | `event-storefront.tsx` | **732–738** | `lg:hidden` |
| Barra checkout | `checkout-floating-bar.tsx` | **103** | `lg:hidden` |
| Sidebar selección | `checkout-selection-sidebar.tsx` | **188** | `hidden lg:block` |

`EventStorefrontBuyBox` se monta **solo** dentro del aside desktop (`event-storefront.tsx` **310**, **743**). No hay buy-box a mitad de página en mobile. Esta invariante está bien.

### 2.5 Tokens Tailwind / hex sueltos

No es un incidente de layout, sí deuda de design system. Ejemplos de fondo/marca hardcodeados en superficies de producto:

| Archivo | Línea | Token |
| --- | ---: | --- |
| `components/admin/event-studio-shell.tsx` | 35, 69 | `bg-[#0c0d0e]` |
| `components/shared/admin-main.tsx` | 24 | `bg-[#0c0d0e]` |
| `app/(public)/page.tsx` | 68 | `bg-[#f4f2f8]` / `dark:bg-[#030712]` |
| `components/public/event-storefront.tsx` | 700 | `dark:bg-[#09090b]/70` |
| `components/public/event-storefront-purchase-dock.tsx` | 39 | `dark:bg-[#09090b]/80` |
| `components/ui/background-gradient.tsx` | 41–51 | `#10b981`, `#a855f7`, `#0ea5e9` |
| `components/public/pending-order-pay-panel.tsx` | 48 | `bg-[#009EE3]` (marca MP; justificado) |

El editor B2B restaurado usa tokens de borde `border-white/10` y fondos hex en paralelo a `bg-card`. Convivencia inconsistente, no un bug funcional.

---

## 3. Puntos críticos lógicos (Backend / stock / pagos)

### 3.1 Overbooking y concurrencia

**Candado real: PostgreSQL, no Zustand ni el preflight TS.**

Las migraciones vigentes serializan cupo con `FOR UPDATE` (y a veces `pg_advisory_xact_lock`) en:

- Reserva clásica / híbrida: p. ej. `supabase/migrations/20261110300000_p94_hybrid_checkout_inventory.sql` **180–198**, **357**.
- Claim + reserva GA: `20261108200000_p80_claim_and_reserve_ga_cart.sql` (locks de event/tier).
- Hold de asiento: `20261106900000_p66_cart_seating_hold.sql` **86** (`FOR UPDATE SKIP LOCKED`).
- Hardening stock/pago: `20261118150000_p99_stock_payment_rls_hardening.sql` **46–60**, **201–295**.
- Capacidad híbrida: `20261121100000_p141_hybrid_stock_capacity.sql` **492**.

**Checkout application layer** (`app/actions/checkout.ts`):

| Paso | Líneas | Rol |
| --- | ---: | --- |
| `assertCartRemainingStock` | **1846–1862** | Preflight de lectura (`capacity - sold`). **No toma lock.** |
| Implementación | `lib/checkout-limits.ts` **197–232** | Comparación aritmética en memoria |
| Reserva atómica | **1975–2058** | `claim_and_reserve_ga_cart_tx` → fallback `reserve_tickets_atomic` / `reserve_tickets_tx`; carrito mixto `reserve_hybrid_cart_tx` → `reserve_unified_cart_tx` |

**Hallazgo (medio, no crítico si RPCs están al día):**  
`assertCartRemainingStock` es TOCTOU por diseño. Dos checkouts simultáneos pueden pasar el preflight. El overbooking solo se evita si **todas** las ramas ejecutan un RPC con `FOR UPDATE`. El código contempla `schema cache / does not exist` y **cae a RPCs más viejos** (**1985–2057**). Si prod no tiene la función nueva, se usa una vieja; si *tampoco* está, la reserva falla en vez de vender de más — siempre que no exista un camino que inserte `orders`/`tickets` sin RPC.

**Holds:** GA y asientos se bloquean con `hold_ga_tickets_for_cart` / `hold_seating_unit_for_cart` (**1109**, **772**) y se liberan al expirar (`expire` batch en P122). Eso es el modelo correcto (reserva temporal + finalize).

### 3.2 Idempotencia de pagos (Mercado Pago)

**Fortalezas**

1. Firma validada en `app/api/webhooks/mercadopago/route.ts` **46–64**. Sin secret → fail closed (**24–34**).
2. Encolado `enqueueMercadoPagoWebhook` + proceso `after()` (**90–107**). Cola con `FOR UPDATE SKIP LOCKED` en `20261119910000_p122_webhook_queue_and_expire_batch.sql`.
3. Ledger MP: PK evolucionó de `payment_id` a `(payment_id, status)` — `20261106120100_p0_payment_gates_featured_rls.sql` **415–421**. Permite `approved` → `refunded` sin perder idempotencia por estado.
4. Upsert de ledger en `lib/payments/mercadopago/dispatch.ts` **71–88** (`onConflict: "payment_id,status"`).
5. Finalize transaccional: `claim_and_finalize_paid_order` desde `lib/payments/core/confirm-order.ts` **119–128**. El RPC inserta `payment_webhook_events` y finaliza en la misma transacción (P91/P93).
6. Replay: `confirm-order.ts` **75–84** y **179** — si ya `processed`, no reemite mails/QR extra.

**Hallazgos**

1. **Doble ledger.** Conviven `mp_webhook_events` (dispatch MP) y `payment_webhook_events` (gateway universal + cola). No es inseguro por sí solo, pero complica auditoría y hay dos “fuentes de verdad”.
2. **Check-then-act residual.** `alreadyProcessed()` en `dispatch.ts` **56–68** es un `SELECT` previo. El candado real es el unique + el RPC de finalize. Dos workers podrían pasar el SELECT; el unique/`claim_and_finalize` debería serializar. Riesgo residual bajo **si** el RPC está aplicado.
3. **GET = POST** en el webhook (`route.ts` **122–124**). Mercado Pago a veces pega GET para validar URL; hoy reejecuta el mismo handler. Depende de que la firma GET sea válida. No es un bypass de firma, sí superficie extra.
4. **No hay Idempotency-Key HTTP de MP en create preference** auditada en este pase. La idempotencia está del lado *inbound* (webhook), no necesariamente en *create payment*. Duplicar “iniciar checkout” puede crear **dos órdenes pending** (holds), no dos cobros, si el usuario reintenta. Eso es presión de stock, no doble cobro, mientras expire_holds funcione.

### 3.3 Multi-nicho: `delivery_mode`, `access_link`, QR / TOTP

**Modelo (migración P144)** — `supabase/migrations/20261121140000_p144_event_delivery_mode.sql`:

| Cambio | Líneas | Efecto |
| --- | ---: | --- |
| Enum `PRESENCIAL` / `ONLINE` | 13–19 | Default `PRESENCIAL` |
| `access_link` | 21–27 | Texto; comentario: no exponer en catálogo |
| `events.location` nullable | 29–30 | ONLINE sin recinto |
| `tickets.qr_code` / `totp_secret` drop NOT NULL | 32–36 | Permite tickets virtuales sin QR de puerta |
| Backfill por venue “Streaming / Online” | 38–52 | |
| Índice | 58–59 | |

**Código alineado**

- Tipos: `types/database.ts` **310–312**, **544–545** (`qr_code` / `totp_secret` `| null`).
- Wallet: `app/actions/tickets.ts` **143–165** selecciona `delivery_mode, access_link` y **cae a SELECT legacy** si PostgREST no tiene las columnas (PGRST204).
- Catálogo: `app/actions/public-events.ts` **339**, **955** incluye `delivery_mode` en ficha; el listado usa `EVENT_LIST_SELECT_WITH_DELIVERY` **sin** `access_link` (correcto).
- Validación wizard: `lib/validations/event-form.ts` exige `accessLink` si `ONLINE` y no exige mapa.

**Hallazgos**

1. **P144 no aplicada = deuda operativa crítica.** El código ya asume columnas opcionales y tiene fallbacks. Hasta aplicar la migración en prod: wizard ONLINE puede guardar mal, wallet no muestra link, y `location` NOT NULL puede romper inserts.
2. **Se perdió el invariante “presencial ⇒ QR”.** `00001_core_schema.sql` **72** era `qr_code text not null unique`. P144 lo vuelve nullable. Las RPCs actuales **siguen insertando** `gen_random_uuid()` + TOTP (`p80_claim_and_reserve_ga_cart.sql` **685–704**). ONLINE **todavía recibe QR de puerta**. No rompe presencial. El riesgo es el inverso: un bug futuro puede persistir un ticket PRESENCIAL con `qr_code IS NULL` y la DB no lo impide.
3. **`UNIQUE (qr_code)` con NULL.** En PostgreSQL varios NULL no chocan. Bien para ONLINE. Mal si dos tickets presenciales se insertan sin código.
4. No hay `CHECK` del estilo  
   `(delivery_mode = 'ONLINE') OR (qr_code IS NOT NULL AND totp_secret IS NOT NULL)`  
   ni trigger que omita TOTP en ONLINE.

### 3.4 Dinero en checkout (no pedido como módulo, sí relacionado)

`CheckoutTunnel.tsx` **1290–1367** usa `moneyToCents` / `centsToMoney` para el unitario del carrito. `confirm-order.ts` **104–116** rechaza cobro si `transaction_amount` ≠ `orders.total_amount` (`moneyAmountsEqual`). Esto está sano. El preflight de stock no toca dinero.

---

## 4. Plan de acción priorizado

### Fase UI/UX (sin tocar persistencia)

**P0 — densidad residual**

1. Compactar `UniversalGeneralQuantity` (`general-quantity.tsx` **36–44**) al mismo `h-9` / `py-3.5` del storefront. Es el único selector de cantidad que sigue “inflado”.
2. Bajar `space-y-6` del body de `CheckoutTunnel.tsx` **2626** a `space-y-3` / `gap-3` para alinear con las cards.

**P1 — invariantes de card**

3. Featured mobile: en `<lg` no recortar el footer. Opciones: `h-auto` + imagen `h-44` fija, o `min-h` en vez de `h-[440px]` (`featured-banner-card.tsx` **42**).
4. Poster catalog: reservar slot de lineup (`min-h` de una línea) para que la grilla no “salte” cuando un evento no tiene artistas (`event-card.tsx` **317**).
5. Featured CTA: permitir wrap a 2 líneas o acortar copy en `<sm` (`featured-banner-card.tsx` **102**).

**P2 — tokens**

6. Reemplazar `bg-[#0c0d0e]` del studio por `bg-background` / `bg-card` (`event-studio-shell.tsx`, `admin-main.tsx`).
7. Home `bg-[#f4f2f8]` / `#030712` → token semántico o CSS variable de marca.
8. Dejar `#009EE3` solo en CTAs oficiales de Mercado Pago.

**P3 — overflow**

9. No depender solo de `overflow-x: hidden` en `html/body`. Auditar en 375px los rails de pills (deben seguir siendo el *único* scroll X). Si un hijo no-rail se recorta, arreglar el hijo.

### Fase Backend (blindajes)

**P0 — operación**

1. **Aplicar P144** (`20261121140000_p144_event_delivery_mode.sql`) en el proyecto Supabase de producción y refrescar schema cache de PostgREST. Hasta entonces los fallbacks de `tickets.ts` / `public-events.ts` son un parche, no el modelo.
2. Verificar en prod que existan `claim_and_reserve_ga_cart_tx`, `reserve_hybrid_cart_tx`, `claim_and_finalize_paid_order`. El checkout **degrada** a RPCs legacy si “no existen”.

**P1 — integridad de stock y QR**

3. Agregar `CHECK` (o trigger)  
   - ONLINE: `access_link` no vacío al publicar.  
   - PRESENCIAL: `qr_code` y `totp_secret` NOT NULL en tickets emitidos.  
   Hoy P144 permite el agujero.
4. Decidir producto: ¿ONLINE debe seguir emitiendo QR/TOTP (como hacen las RPCs actuales) o omitirlo? Documentar y alinear el `INSERT` de tickets.
5. No vender nunca por el preflight TS. Tratar `assertCartRemainingStock` como UX; el 409 debe venir siempre del RPC.

**P2 — pagos**

6. Unificar o documentar el dual ledger (`mp_webhook_events` vs `payment_webhook_events`). Una tabla de “processed (provider, external_id, status)” basta.
7. Insertar/claim del ledger **antes** de side-effects, no `alreadyProcessed` SELECT suelto (`dispatch.ts` **56–68**). El patrón P93 ya lo hace en SQL; el TS no debería ser la fuente.
8. Revisar `GET` del webhook (`route.ts` **122–124**): responder 200 sin encolar si no hay body/firma, para no mezclar health-check con cobro.
9. Idempotency-Key en creación de preferencia MP (salida) para reintentos de “Pagar” sin segunda orden pending.

**P3 — higiene**

10. Inventariar RPCs `reserve_*` / `finalize_*` vivos vs. muertos. El grafo de fallbacks en `checkout.ts` **1975–2058** es deuda que oculta un schema viejo.
11. Test de carrera: dos `reserve_tickets_tx` al último cupo (ya hay `FOR UPDATE`; vale un test de integración contra staging).
12. Test de webhook duplicado `approved` + `approved` y `approved` → `refunded` sobre el PK compuesto.

---

## 5. Lo que esta auditoría no cubrió

- RLS línea por línea de todas las tablas (hay hardening P5/P99; no se re-certificó el 100%).
- Payway / Naranja X con la misma profundidad que MP.
- Scanner de puerta / TOTP offline (PWA).
- Performance de queries ni índices más allá de `events_delivery_mode_idx`.
- Aplicación real de P144 en el proyecto remoto (hace falta `supabase db` / dashboard; el repo solo tiene el archivo).

---

*Informe generado en modo solo lectura. Siguiente paso sugerido: Fase UI P0 + aplicar P144, sin mezclar ambos en el mismo deploy si se quiere rollback limpio.*
