# Flujo de pagos y webhooks

Ciclo de vida completo de una transacción financiera en TokePass: desde el click en "comprar"
hasta el ticket válido en la billetera, incluyendo qué pasa cuando el pago falla, llega
duplicado, se reembolsa o el webhook nunca llega.

El orquestador es `lib/modules/checkout/services/checkout.service.ts`, expuesto como Server
Action desde `app/actions/checkout.ts`. El endpoint de notificaciones es
`app/api/webhooks/mercadopago/route.ts`. La emisión real del ticket **no ocurre en TypeScript**:
ocurre dentro de una función SQL `SECURITY DEFINER` llamada `finalize_paid_order`.

> **Nota sobre Stripe:** el tipo `SupportedPaymentProvider` incluye `"stripe"` y `"modo"`, pero
> `PaymentGatewayFactory` sólo construye tres adapters: Mercado Pago, Payway y NaranjaX. **No hay
> integración con Stripe.** Pedir `provider: "stripe"` lanza `PaymentProviderNotSupportedError`.
> Además, Payway y NaranjaX están bloqueados en producción por `production-guard.ts`, así que
> **en producción el único PSP vivo es Mercado Pago**.

## Índice

1. [Mapa del sistema](#1-mapa-del-sistema)
2. [Las cinco fases de una transacción](#2-las-cinco-fases-de-una-transacción)
3. [Fase 1 — Reserva temporal de stock](#3-fase-1--reserva-temporal-de-stock)
4. [Fase 2 — El usuario en Mercado Pago](#4-fase-2--el-usuario-en-mercado-pago)
5. [Fase 3 — El webhook de pago aprobado](#5-fase-3--el-webhook-de-pago-aprobado)
6. [Fase 4 — Emisión del ticket final](#6-fase-4--emisión-del-ticket-final)
7. [Fase 5 — Post-emisión (QR, expansión, email)](#7-fase-5--post-emisión-qr-expansión-email)
8. [Sandbox vs. compra real](#8-sandbox-vs-compra-real)
9. [Fallos y compensación](#9-fallos-y-compensación)
10. [Los tres crons](#10-los-tres-crons)
11. [Deuda y riesgos verificados](#11-deuda-y-riesgos-verificados)

---

## 1. Mapa del sistema

### 1.1 Archivos por responsabilidad

| Archivo | Responsabilidad |
| --- | --- |
| `app/actions/checkout.ts` | **Fachada** (≈1.460 líneas, 13 acciones). Valida el pedido, lo envuelve en `try/catch` y delega. No ejecuta lógica de negocio. |
| `lib/modules/checkout/services/checkout.service.ts` | **El orquestador real.** Ejecuta el orden precios → reserva atómica → link de pago, y compensa la reserva si el pago falla. |
| `lib/modules/checkout/services/pricing.service.ts` | Cotización server-side (modelo All-In) y ledger de comisiones. |
| `lib/modules/checkout/services/inventory.service.ts` | Stock, fases, ventanas de venta y resolución de asientos mapeados. |
| `lib/modules/checkout/services/payment.service.ts` | Apertura de la sesión de pago contra la pasarela + compensación. |
| `lib/modules/checkout/services/access.service.ts` | Acceso al evento, decisión de sandbox y waiting room. |
| `app/actions/payments.ts` | Camino de **reintento**: crea una preferencia nueva para una orden `pending` que ya existe. |
| `lib/payments/core/factory.ts` | `PaymentGatewayFactory.getAdapter(provider)`. |
| `lib/payments/core/interfaces.ts` | Contrato `IPaymentGatewayAdapter` (dos métodos: crear sesión, verificar webhook). |
| `lib/payments/adapters/mercadopago.adapter.ts` | Preferencia MP + verificación de firma + fetch del pago. |
| `app/api/webhooks/mercadopago/route.ts` | Endpoint de notificación. Valida HMAC, encola, responde 200. |
| `lib/payments/webhook-queue.ts` | Cola durable en `payment_webhook_events` (claim, backoff, dead-letter). |
| `lib/payments/mercadopago/process-enqueued.ts` | Worker: toma un evento de la cola y lo procesa. |
| `lib/payments/mercadopago/dispatch.ts` | Trae el pago de la API de MP y bifurca según estado. |
| `lib/payments/core/confirm-order.ts` | Guardas de dinero (moneda, monto, idempotencia) + llamada al finalize. |
| `finalize_paid_order` (SQL) | **Emite el ticket.** `pending_payment` → `valid`. |
| `lib/payments/reconcile-orphans.ts` | Rescata pagos aprobados cuyo webhook nunca llegó. |
| `app/api/cron/expire-orders/route.ts` | Barrido cada minuto: reconcile + liberación de holds vencidos. |

### 1.2 El principio de diseño

Tres reglas gobiernan todo el módulo:

1. **El dinero se decide en Postgres, no en Node.** El webhook es un mensajero; la transición
   `pending → paid` ocurre bajo un `FOR UPDATE` dentro de una función SQL. Node nunca escribe
   `orders.status = 'paid'` directamente.
2. **El webhook responde rápido y procesa después.** El HTTP handler valida la firma, encola y
   devuelve 200. El trabajo real corre en `after()`. Si el worker falla, la cola reintenta.
3. **Todo fallo de dinero tiene compensación explícita.** Cada rechazo del finalize declara si
   necesita reembolso (`needs_refund`), y ese flag dispara un refund total automático en MP.

---

## 2. Las cinco fases de una transacción

```
FASE 1 — Reserva                          FASE 2 — Pasarela
┌────────────────────────────┐            ┌──────────────────────────┐
│ startCheckoutWithPayment   │            │ usuario en checkout MP   │
│  · valida + cotiza en DB   │            │ holds congelados 15 min  │
│  · RPC de reserva atómica  │───────────►│ preference.expires=true  │
│  · orders(pending)         │ init_point │                          │
│  · tickets(pending_payment)│            └────────────┬─────────────┘
│  · ticket_tiers.sold++     │                         │
│  · units → reserved        │                         │ paga
└────────────────────────────┘                         ▼
                                          FASE 3 — Webhook
                                          ┌──────────────────────────┐
                                          │ HMAC → encolar → 200 OK  │
                                          │ payment_webhook_events   │
                                          └────────────┬─────────────┘
                                                       │ after()
                                                       ▼
FASE 5 — Post-emisión                     FASE 4 — Emisión
┌────────────────────────────┐            ┌──────────────────────────┐
│ · QR dinámico + totp_secret│◄───────────│ claim_and_finalize_...   │
│ · expansión de grupos      │            │  · FOR UPDATE de la orden│
│ · acceso invitado          │            │  · tickets → valid       │
│ · drenaje del outbox (mail)│            │  · orders → paid         │
└────────────────────────────┘            │  · triggers: units→sold, │
                                          │    promo++, outbox       │
                                          └──────────────────────────┘
```

El punto no obvio: **el stock se descuenta en la fase 1, no en la fase 4**. Cuando el pago se
confirma, el aforo ya estaba consumido. El finalize sólo cambia estados; no vuelve a tocar
`ticket_tiers.sold`. Esto invierte el riesgo: en vez de arriesgar sobreventa, TokePass arriesga
**subventa temporal** (stock retenido por carritos abandonados), que el cron libera cada minuto.

---

## 3. Fase 1 — Reserva temporal de stock

### 3.1 Puntos de entrada

Todos los caminos de compra convergen en un solo server action:

| Server action | Uso |
| --- | --- |
| `startCheckoutWithPayment` | **La fachada principal.** Todos los demás delegan acá; ella envuelve en `try/catch` y delega en el orquestador `checkout.service.ts`. |
| `reserveSeatAtomic` | Compra de un asiento numerado puntual. |
| `createComboReservation` | Combos / bundles. |
| `startSandboxCheckout` | Igual, con `sandbox: true`. |
| `createCheckoutPreference` | Firma legacy. |
| `createPaymentPreference` (`app/actions/payments.ts`) | **Reintento** sobre una orden `pending` existente. No reserva stock nuevo. |

El payload se valida con `CheckoutPayloadSchema` (`lib/validations/checkout.ts`): `eventId`,
`items[]`, `buyer`, opcionalmente `seatingIds`, `addons`, `promoCodeId`, `referralCode`,
`paymentProvider` (default `mercadopago`), campos de price-guard, `idempotencyKey` y
`cartSessionId`.

### 3.2 Orden de operaciones

Secuencia dentro de `startCheckoutWithPayment`
(`lib/modules/checkout/services/checkout.service.ts`):

1. **Rate limit y parseo** — `checkoutFailuresBlocked`, `CheckoutPayloadSchema.safeParse`.
2. **Comprador** — `resolveInvisibleCheckoutBuyer` (soporta compra sin cuenta previa).
3. **Acceso al evento** — `resolveCheckoutEventAccess`: decide si es venta real o sandbox.
4. **Waiting room** — `assertCheckoutWaitingRoom` (sala de espera para picos).
5. **Resolución de asientos** — `resolveMappedSeatingUnits` traduce ids del mapa a unidades.
6. **Holds de invitado** — `transferGuestHoldsToBuyer` migra holds anónimos al usuario logueado.
7. **Stock y topes** — `assertCartTierPurchaseLimits`, `assertCartRemainingStock`.
8. **Cotización server-side** — `quoteCheckoutFromDatabase` (modelo All-In) y comparación contra
   el precio que mandó el cliente (**price guard**: el cliente no fija precios).
9. **Teléfono, términos, captcha.**
10. **Idempotencia** — `claimCheckoutIdempotencyKey`, con posible reutilización de una orden
    `pending` reciente.
11. **Ventanas de venta y fases** — `evaluateCartSaleWindows`, `evaluateCartPhaseRollover`.
12. **Denylist** — RPC `assert_buyer_not_denylisted`.
13. **RPC de reserva atómica** (el paso crítico, ver 3.3).
14. **Fees, promo, gate legal** — `persistOrderFeeLedger`, `apply_promo_code_to_order`,
    `persistOrderLegalGate`.
15. **Bifurcación de pago** — sandbox / gratis / pasarela (ver 3.6).
16. **Persistir preferencia** en `orders` y **congelar holds** (`freezeSeatHoldsForPayment`).
17. **Devolver** `{ success, orderId, initPoint, paymentUrl, expiresAt }`.

### 3.3 El RPC de reserva: una llamada, según el carrito

```ts
// lib/modules/checkout/services/checkout.service.ts (simplificado)
if (reusedPendingOrder) {
  // nada: se reutilizan las filas de la orden pending anterior
} else if (cartIsGeneralAdmissionOnly) {
  await db.rpc("claim_and_reserve_ga_cart_tx", { ... })
} else {
  await db.rpc("purchase_held_seats_tx", { ... })   // seating / mixto / bundle
}
```

Con fallbacks encadenados si el RPC no existe en el esquema (`reserve_tickets_tx`,
`reserve_hybrid_cart_tx`, `reserve_unified_cart_tx`). Esa tolerancia existe porque las
migraciones se aplican en orden y un deploy puede adelantarse al SQL.

### 3.4 Qué se escribe en la reserva

| Artefacto | Estado al reservar |
| --- | --- |
| `orders` | `status = 'pending'`, montos congelados |
| `tickets` | `status = 'pending_payment'`, con `order_id` |
| `ticket_tiers.sold` | **incrementado** (`apply_ga_stock_for_reserve`) |
| `event_seating_units` | `status = 'reserved'`, `reserved_order_id`, `reserved_until` |
| `seat_holds` | consumido del carrito y re-anclado al pago |

Los dos caminos difieren en el punto de partida:

**Admisión general (GA).** El aforo vive en un contador: `ticket_tiers.sold`. El carrito puede
tener un hold previo en `event_ga_cart_holds`, y la reserva sólo incrementa `sold` por la
diferencia:

```sql
-- 20261108200000_p80_claim_and_reserve_ga_cart.sql (≈436–470)
v_additional := public.consume_ga_cart_hold_for_reserve(...);
if v_additional > 0 then
  update public.ticket_tiers
  set sold = sold + v_additional
  where id = p_tier_id;
end if;
```

**Asientos numerados.** El aforo es una fila por lugar. El usuario **ya debe tener el hold**
(creado al clickear la butaca en el mapa, vía `hold_seat` / `hold_seating_unit_for_cart`), y la
compra lo verifica y lo consume:

```sql
-- 20261124120000_p164_seat_holds.sql (≈1086–1110)
perform public.assert_seat_holds_for_purchase(...);
return query select * from public.reserve_hybrid_cart_tx(...);
perform public.consume_seat_holds_for_purchase(...);
```

Los detalles de locks (`FOR UPDATE`, `SKIP LOCKED`, orden determinista de UUIDs) están en
[`DB_SCHEMA.md`](./DB_SCHEMA.md), sección 5.

### 3.5 Idempotencia contra el doble click

Cuatro capas, en orden de precisión:

1. **`checkout_idempotency_keys`** — RPC `claim_checkout_idempotency_key` con
   `pg_advisory_xact_lock`. Si la misma clave se reclamó hace menos de 60 s y todavía no tiene
   orden asociada, devuelve `in_progress`.
2. **Fingerprint del carrito** — `checkoutCartFingerprint(items)` debe coincidir con el
   guardado; si no, se rechaza. Evita reusar una clave para un carrito distinto.
3. **Reutilización de orden pendiente** — `findReusablePendingCheckoutOrder` busca una orden
   `pending` del mismo comprador, evento y fingerprint dentro de
   `CHECKOUT_IDEMPOTENCY_WINDOW_MS` (2 minutos).
4. **Unicidad en DB** — `event_ga_cart_holds` único por `(event_id, owner_id, tier_id)`;
   `seat_holds` único por `(event_id, event_date_key, layout_item_id)`.

La clave (1) es la única defensa determinista, y **la manda el cliente**. Sin
`idempotencyKey`, dos clicks muy rápidos pueden generar dos órdenes `pending`; sólo la ventana de
2 minutos de (3) las colapsa.

### 3.6 La bifurcación de pago: tres salidas, no una

Sólo una de las tres abre la pasarela:

```ts
// lib/modules/checkout/services/checkout.service.ts (condensado)
if (useSandbox) {
  await admin.rpc("finalize_sandbox_paid_order", { p_order_id: orderId })
  await fulfillSandboxPaidOrder(orderId)
  initPoint = `/checkout/success?order_id=${orderId}&sandbox=1`
} else if (Number.isFinite(finalTotal) && finalTotal <= 0) {
  // Gratis: emitir con finalize_paid_order. Nunca abrir pasarela.
  await admin.rpc("finalize_paid_order", {
    p_order_id: orderId,
    p_mp_payment_id: `free:${orderId}`,
  })
  initPoint = `/checkout/success?order_id=${orderId}&free=1`
} else {
  // Toda la interacción con la pasarela está encapsulada acá dentro.
  const session = await openCheckoutPaymentSession({
    provider, orderId, db, buyerId, eventId, eventTitle,
    amount: finalTotal, buyer, checkoutExpiresAt,
    cleanupPendingOrder,            // compensación inyectada
  })
  if (!session.ok) return { success: false, error: session.error }
  initPoint = session.checkoutUrl
}
```

Las entradas gratuitas y las de prueba **se emiten sincrónicamente en el mismo request**: nunca
hay webhook, nunca hay dinero. Notá que ambas usan una sobrecarga de dos argumentos
(`p_order_id`, `p_mp_payment_id`) distinta de la de cuatro que usa el webhook, y marcan la
transacción con prefijos legibles: `free:{orderId}` y `sandbox:{orderId}`.

**La integración con la pasarela ya no vive en el Server Action.** Antes, esa rama del `else`
resolvía el adapter, armaba el payload, persistía el `preference_id` y congelaba los holds todo
dentro del archivo de Server Actions. Hoy está aislada en
`lib/modules/checkout/services/payment.service.ts`, detrás de una única función
`openCheckoutPaymentSession`, que encapsula ocho pasos:

| Paso | Qué hace |
| --- | --- |
| 1 | Resuelve el adapter con `PaymentGatewayFactory.getAdapter(provider)` y traduce un provider no soportado a un mensaje de usuario |
| 2 | Construye las URLs de retorno (`buildCheckoutBackUrls`) y la de webhook, que difiere entre Mercado Pago y el resto |
| 3 | Revalida que el stock de la orden siga reservable (`assertPendingOrderStillReservable`) |
| 4 | Mata las preferencias viejas del mismo comprador para el mismo evento |
| 5 | Arma el payload **neutral** de pasarela y llama a `adapter.createCheckoutSession(...)` |
| 6 | Persiste `provider_preference_id` (y `mp_preference_id` si es MP) sobre la orden, y sólo si sigue `pending` |
| 7 | Congela los holds de butaca (`freezeSeatHoldsForPayment`) |
| 8 | Ante **cualquier** fallo de los pasos anteriores, compensa liberando la reserva |

Dos consecuencias de este aislamiento que conviene entender antes de tocar el archivo:

- **La compensación se inyecta, no se importa.** El servicio recibe `cleanupPendingOrder` como
  callback en su input, en lugar de importarlo. Es deliberado: mantiene la dirección de
  dependencia (el servicio de pago no conoce al orquestador) y preserva el orden exacto de los
  efectos secundarios del flujo original, donde la limpieza ocurre antes de loggear y retornar.
- **El armado del payload está en dos niveles, y no conviene confundirlos.** `payment.service.ts`
  arma un payload **agnóstico del proveedor** —`orderId`, `amount`, `currency`, `items`,
  `redirectUrls`, `webhookUrl`, `expiresAt`— definido por el contrato `IPaymentGatewayAdapter`.
  La traducción de ese payload al formato de cable de cada proveedor sigue viviendo en su adapter.
  Si buscás el body exacto que recibe Mercado Pago, está en 3.7 y en
  `lib/payments/adapters/mercadopago.adapter.ts`, **no** en `payment.service.ts`.

### 3.7 La preferencia de Mercado Pago

Antes de crearla, tres guardas: `assertPendingOrderStillReservable` (el stock sigue vivo),
`expireCheckoutPreferenceOnOrder` e `invalidateStaleCheckoutPreferences` (matar preferencias
viejas del mismo comprador para el mismo evento, así no puede pagar dos veces por caminos
distintos).

```ts
// lib/payments/adapters/mercadopago.adapter.ts (77–106)
preference.create({
  body: {
    items: [{
      id: `order-${input.orderId}-all-in`,
      title: input.description.slice(0, 256),
      quantity: 1,
      unit_price: moneyToGatewayMajorUnits(input.amount),
      currency_id: input.currency === "USD" ? "USD" : "ARS",
    }],
    ...(payer ? { payer } : {}),
    external_reference: input.orderId,
    statement_descriptor: "TOKEPASS",
    back_urls: { success, failure, pending },
    ...(!localSite ? { auto_return: "approved" as const } : {}),
    ...(!localSite ? { notification_url: input.webhookUrl } : {}),
    expires: true,
    expiration_date_to: expiresAt,
    metadata: { order_id, frozen_pricing: true, sandbox_mode },
  },
})
```

Decisiones que importan:

- **Un solo ítem "All-In".** No se envía el desglose del carrito a MP; se envía el total final ya
  cotizado por la base. El desglose vive en TokePass. Esto evita que MP redondee líneas y que el
  total del PSP difiera del total de la orden.
- **`external_reference` = UUID de la orden, plano.** Es el único hilo que une el pago con la
  orden. En `app/actions/payments.ts:278` el comentario lo justifica: *"UUID plano: más compatible
  con MP que JSON en external_reference"*.
- **`expires: true` + `expiration_date_to`** alineado al hold. La preferencia caduca cuando
  caduca el stock reservado, así MP no acepta un pago para un carrito ya liberado.
- **`auto_return` y `notification_url` se omiten en localhost.** Consecuencia práctica: **los
  webhooks no llegan en desarrollo local** salvo que se exponga un túnel.
- **No se usa `binary_mode`.** MP puede devolver estados intermedios (`pending`, `in_process`),
  que el sistema trata como "no hacer nada todavía" (ver 9.1).

Si el adapter está en modo sandbox y la URL devuelta no contiene `sandbox`, se lanza
`PaymentProviderUnavailableError` con un mensaje explícito. Es una guarda contra credenciales
mezcladas.

---

## 4. Fase 2 — El usuario en Mercado Pago

### 4.1 El TTL es 15 minutos, para todo

```ts
// lib/checkout-hold.ts
export const GA_CHECKOUT_HOLD_MINUTES = 15
export const SEATING_HOLD_MINUTES = 15
export const EXPIRE_HOLD_BATCH_SIZE = 2000
```

Su equivalente en SQL:

```sql
-- 20261124120000_p164_seat_holds.sql (4–11)
create or replace function public.checkout_hold_until()
...
  select clock_timestamp() + interval '15 minutes';
```

### 4.2 Congelar los holds al iniciar el pago

Cuando la preferencia se crea con éxito, `freezeSeatHoldsForPayment(orderId)` llama a
`freeze_seat_holds_for_payment`:

```sql
-- 20261131700000_p203_strict_hold_expiry.sql (≈111–166)
v_until timestamptz := clock_timestamp() + interval '15 minutes';
update public.orders
  set payment_started_at = coalesce(payment_started_at, clock_timestamp()) ...
update public.event_seating_units set reserved_until = v_until
  where reserved_order_id = p_order_id ...
update public.seat_holds set status = 'pending_payment', expires_at = v_until ...
```

Dos efectos: **re-ancla** el reloj a `now + 15 min` (el tiempo que el usuario pasó armando el
carrito no le come tiempo de pago) y sella `payment_started_at`, que es el campo que el cron usa
para decidir el vencimiento:

```sql
-- 20261131700000_p203_strict_hold_expiry.sql (≈498–547)
-- Carrito sin pagar: 15m desde created_at.
-- Click de pago: 15m desde payment_started_at (el reconcile corre antes).
and (
  (o.payment_started_at is null and o.created_at < v_cutoff)
  or (o.payment_started_at is not null and o.payment_started_at < v_cutoff)
)
```

El comentario "el reconcile corre antes" no es decorativo: es la garantía de que un pago aprobado
justo al filo no se pierde. El cron consulta a MP **antes** de liberar (ver 9.4).

### 4.3 Si el usuario abandona

| Escenario | Quién libera | Efecto sobre `sold` |
| --- | --- | --- |
| Hold de carrito sin comprar | `expire_ga_cart_holds`, `expire_seat_holds` | Se decrementa (se había incrementado al holdear) |
| Orden creada y nunca pagada | `expire_abandoned_orders` | Se decrementa vía `count_pending_order_sold_units` |
| Falla del checkout server-side | `cleanupPendingOrder` → `expire_abandoned_order` | Se decrementa en el mismo request |

```sql
-- 20261131700000_p203_strict_hold_expiry.sql (≈445–490)
for v_tier_id, v_count in select ... from count_pending_order_sold_units(p_order_id)
loop
  update public.ticket_tiers set sold = greatest(0, sold - v_count) ...
update public.tickets set status = 'cancelled' where status = 'pending_payment'
update public.orders set status = 'expired'
update public.event_seating_units set status = 'available' ...
perform public.release_payment_frozen_holds(p_order_id);
```

El `greatest(0, ...)` es defensa contra doble decremento: en el peor caso el contador se queda en
cero, nunca en negativo.

---

## 5. Fase 3 — El webhook de pago aprobado

### 5.1 El handler: validar, encolar, salir

```ts
// app/api/webhooks/mercadopago/route.ts
export async function POST(request: NextRequest) {
  const secret = getMercadoPagoWebhookSecret()
  if (!secret) {
    // fail closed: 500, MP reintenta
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const rawBody = await request.text()
  const notification = parseMercadoPagoNotification(request.url, rawBody)
  if (!notification) return webhookOk({ ignored: true, reason: "missing_payment_id" })

  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: notification.id,
      secret,
      toleranceSeconds: 300,
    })
  } catch (error) {
    return webhookOk({ ignored: true, reason: "invalid_signature" })
  }

  const queued = await enqueueMercadoPagoWebhook({ paymentId, eventType, payload })
  if (!queued) return NextResponse.json({ received: false }, { status: 500 })

  if (queued.status !== "processed") {
    after(() => processEnqueuedWebhookEvent(queued.id))
  }
  return webhookOk()
}
```

Cuatro decisiones deliberadas:

- **HMAC-SHA256 con ventana de 300 s.** La firma cubre `x-signature`, `x-request-id` y el
  `data.id`; el `toleranceSeconds` corta replays viejos.
- **Sin secreto configurado → 500, no 200.** Fail closed: MP reintenta en vez de considerar
  entregada una notificación que no se pudo verificar.
- **Firma inválida → 200 con `ignored`.** Contraintuitivo pero correcto: una firma inválida no se
  arregla reintentando. Devolver 200 evita que MP entre en un bucle de reintentos por basura o
  ruido de terceros. El evento queda logueado con `invalid_signature`.
- **El trabajo va a `after()`.** MP recibe el 200 en milisegundos; el procesamiento (que incluye
  un fetch a la API de MP) corre después de la respuesta. `maxDuration = 60`.

`GET` delega en `POST`: MP a veces notifica por query string.

### 5.2 La cola durable

`enqueue_payment_webhook_event` inserta en `payment_webhook_events` con
`on conflict (provider, external_event_id)`. **Ese índice único es la idempotencia de primer
nivel**: si MP notifica cinco veces el mismo pago, hay una sola fila.

| Parámetro | Valor | Archivo |
| --- | --- | --- |
| Máximo de intentos | 12 | `lib/payments/webhook-queue-status.ts` |
| Backoff | `min(2^min(attempts,6), 300)` s | `lib/payments/webhook-queue.ts:107` |
| Estado terminal | `dead` al llegar a 12 | `webhookFailureStatus` |
| Claim | `claim_payment_webhook_events` con `SKIP LOCKED` | migración P122 |

El claim rechaza filas ya `processing`, `processed`, `dead` o con intentos agotados, y hace el
`UPDATE` condicionado a `.in("status", ["pending", "failed"])`. Dos workers concurrentes no
pueden tomar el mismo evento.

### 5.3 El worker y la bifurcación por estado

`processEnqueuedWebhookEvent` reclama y procesa. Para Mercado Pago, `processMercadoPagoPaymentById`
**trae el pago de la API de MP** en vez de confiar en el body del webhook (el body sólo trae el
id). Luego bifurca:

| Estado MP | Acción |
| --- | --- |
| `approved` | `processPaidOrderNotification` → emisión. Si devuelve `needsRefund`, se reembolsa. |
| `refunded`, `charged_back`, `in_mediation` | `revokeDisputedPaidOrder`: revoca tickets. |
| `rejected`, `cancelled` | Si la orden está `pending`, `expire_abandoned_order`; si estaba `expired`, se marca `failed`. |
| cualquier otro (`pending`, `in_process`…) | `jobDone(status)`: se marca procesado, **no se reintenta**. |

El mapeo canónico de estados vive aparte:

```ts
// lib/payments/core/map-gateway-status.ts
approved     ← approved | paid | accredited
in_mediation ← in_mediation
charged_back ← charged_back | chargeback
refunded     ← refunded
rejected     ← rejected | cancelled | canceled | failed
pending      ← todo lo demás
```

Para notificaciones de contracargo, el adapter fuerza `charged_back` aun si el pago todavía
figura `approved`, porque el topic del webhook es más nuevo que el estado del recurso.

### 5.4 Las tres guardas de dinero antes del SQL

`processPaidOrderNotification` (`lib/payments/core/confirm-order.ts`) es el último filtro en
TypeScript. Nada llega al finalize sin pasar por acá:

**Moneda.** Sólo ARS. Cualquier otra cosa se reembolsa:

```ts
// lib/payments/core/confirm-order.ts (174–184)
if (!isAllowedPaymentCurrency(input.currency)) {
  logger.error({ context: "payments/confirm-order", message: "currency_mismatch", ... })
  return { ok: false, code: "currency_mismatch", needsRefund: true }
}
```

**Idempotencia de segundo nivel.** Si el evento ya está `processed` y la orden apunta a la misma
transacción, no se re-finaliza: sólo se repite el follow-through (que es idempotente) y se
devuelve `already_processed`.

**Monto.** Comparación en centavos enteros, sin tolerancia de punto flotante:

```ts
// lib/payments/core/confirm-order.ts (228–241)
const expected = Number(order.total_amount)
const paid = Number(input.amount)
if (!moneyAmountsEqual(paid, expected)) {
  return { ok: false, code: "amount_mismatch", needsRefund: true }
}
```

`moneyAmountsEqual` convierte ambos lados con `moneyToCents` y compara enteros. Si el comprador
pagó un centavo de menos que el total congelado, el pago se reembolsa entero en vez de emitir el
ticket. Es intencionalmente estricto.

---

## 6. Fase 4 — Emisión del ticket final

### 6.1 El wrapper: ledger sólo si funcionó

`claim_and_finalize_paid_order` (P122) envuelve al finalize y decide qué hacer con el resultado:

```sql
-- 20261119910000_p122_webhook_queue_and_expire_batch.sql (≈171–262)
v_result := public.finalize_paid_order(
  p_order_id, p_provider, v_tx, coalesce(p_payload, '{}'::jsonb)
);

if v_ok then
  insert into public.payment_webhook_events (..., status, processed_at, ...)
  values (..., 'processed', now(), ...)
  on conflict (provider, external_event_id) do update
  set status = 'processed', processed_at = now(), ...;
  return v_result;
end if;

if v_code = 'already_paid_other_payment' then
  return v_result || jsonb_build_object('needs_refund', true);
end if;

if v_needs_refund then
  return v_result;               -- soft-fail: commitea, TS reembolsa
end if;

raise exception 'claim_finalize_rejected:%', coalesce(v_code, 'finalize_failed');
```

La distinción es el corazón del control de errores:

- **Éxito** → se marca el evento como `processed` en la misma transacción. El ledger no puede
  quedar marcado si la emisión falló.
- **Fallo con `needs_refund`** → se **commitea** y se devuelve el código. El estado de la orden
  (por ejemplo `expired`) queda persistido y TypeScript emite el reembolso. Reintentar no
  ayudaría.
- **Fallo sin `needs_refund`** → `raise`, rollback total, la cola reintenta. Es un problema
  transitorio.

### 6.2 `finalize_paid_order`, paso a paso

Definición vigente: `supabase/migrations/20261110200000_p93_claim_finalize_ledger_safety.sql`
(líneas 5–241).

**Autorización y lock.** Sólo `service_role`, y toma el lock de la orden inmediatamente:

```sql
if coalesce(auth.role(), '') <> 'service_role' then
  raise exception 'Forbidden' using errcode = '42501';
end if;
...
select * into v_order
from public.orders as o
where o.id = p_order_id
for update of o;
```

Ese `FOR UPDATE` serializa todo lo que pueda tocar la orden: dos webhooks del mismo pago, un
webhook y el cron de expiración, un webhook y el reconcile. El segundo espera y encuentra el
mundo ya cambiado.

**Camino idempotente.** Si la orden ya está `paid` con la **misma** transacción, no falla:
verifica que no hayan quedado tickets `pending_payment` (y que su hold de asiento siga válido),
los activa, y devuelve `already_paid` con `idempotent: true`. Es la red que hace seguro que MP
notifique cinco veces.

**Pago duplicado.** Si la orden ya está `paid` con **otra** transacción, el segundo cobro se
rechaza y se marca para reembolso:

```sql
if v_order.status = 'paid'
   and v_order.provider_transaction_id is distinct from v_tx
   and v_order.mp_payment_id is distinct from v_tx then
  return jsonb_build_object(
    'ok', false,
    'code', 'already_paid_other_payment',
    'needs_refund', true,
    ...
  );
end if;
```

**Hold vencido con pago aprobado.** El caso más delicado: el usuario pagó pero el asiento ya se
liberó. La función revierte la reserva y pide reembolso:

```sql
if exists (
  select 1
  from public.tickets as t
  join public.event_seating_units as u on u.id = t.seating_unit_id
  where t.order_id = p_order_id
    and (
      u.status <> 'reserved'
      or u.reserved_order_id is distinct from p_order_id
      or u.reserved_until <= now()
    )
) then
  for v_tier_id, v_count in
    select s.tier_id, s.unit_count
    from public.count_pending_order_sold_units(p_order_id) as s
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
  end loop;
  ... -- tickets → cancelled, orden → expired
  return jsonb_build_object('ok', false, 'code', 'seating_hold_expired', 'needs_refund', true);
end if;
```

**Camino feliz.** Activa los tickets verificando el conteo, y cambia la orden a `paid`
verificando que nadie la haya movido:

```sql
update public.tickets
set status = 'valid'::public.ticket_status, updated_at = now()
where order_id = p_order_id
  and status = 'pending_payment'::public.ticket_status;

get diagnostics v_activated = row_count;
if v_activated is distinct from v_pending_tickets then
  raise exception 'TICKET_ACTIVATION_MISMATCH' using errcode = 'P0001';
end if;
...
update public.orders
set status = 'paid', payment_provider = v_provider,
    provider_transaction_id = v_tx, mp_payment_id = v_tx,
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
where id = p_order_id and status = 'pending';

get diagnostics v_updated = row_count;
if v_updated <> 1 then
  raise exception 'ORDER_STATUS_RACE' using errcode = 'P0001';
end if;
```

Las dos excepciones son **detectores de carrera con rollback**: si el conteo de tickets activados
no coincide con el esperado, o si el `UPDATE` de la orden no afectó exactamente una fila, se
aborta todo. Preferir un reintento a un estado inconsistente.

### 6.3 Lo que el finalize NO hace (y quién lo hace)

Esta tabla es la clave para leer el sistema sin sorpresas:

| Efecto | Dónde ocurre realmente |
| --- | --- |
| `ticket_tiers.sold++` | **En la reserva** (fase 1), no acá |
| `event_seating_units` `reserved → sold` | Trigger `sync_seating_unit_from_ticket` al pasar el ticket a `valid` |
| Liberar holds de carrito sobrantes | Post-finalize: `release_leftover_cart_holds_for_order` |
| `promo_codes.current_uses++` | Trigger `orders_consume_promo_on_paid` (BEFORE UPDATE en `orders`) |
| Encolar el mail de confirmación | Trigger `notification_outbox_on_order_paid` (AFTER UPDATE) |
| Activar redenciones de extras | `activate_order_item_redemptions` dentro del finalize |
| Filas de comisión / ledger | **No existen.** Las finanzas son un modelo de lectura sobre `orders` |

El trigger de asientos:

```sql
-- 20261106660000_p53_seating_group_qrs_zone_pricing.sql (286–298)
if old.status = 'pending_payment'::public.ticket_status
   and new.status = 'valid'::public.ticket_status then
  update public.event_seating_units
  set status = 'sold', sold_order_id = new.order_id,
      reserved_by = null, reserved_order_id = null, reserved_until = null,
      updated_at = now()
  where id = new.seating_unit_id
    and status = 'reserved'
    and reserved_order_id = new.order_id;
```

El trigger de promo puede **abortar el finalize completo** si el código se agotó entre la reserva
y el pago:

```sql
-- 20261130150000_p183_order_status_is_text.sql (≈14–42)
if v_promo.max_uses is not null and v_promo.current_uses >= v_promo.max_uses then
  raise exception 'PROMO_MAX_USES' ...
end if;
update public.promo_codes set current_uses = current_uses + 1 ...
new.promo_usage_applied := true;
```

TypeScript reconoce ese error por texto y lo convierte en reembolso:

```ts
// lib/payments/core/confirm-order.ts (254–269)
const promoExhausted = /PROMO_MAX_USES/i.test(finalizeError.message)
...
return {
  ok: false,
  code: promoExhausted ? "promo_max_uses" : "finalize_failed",
  needsRefund: promoExhausted,
}
```

### 6.4 Códigos de retorno completos

**Éxito (`ok: true`)**

| `code` | Significado |
| --- | --- |
| `paid` | Confirmación inicial. Incluye `tickets_activated`, `idempotent: false`. |
| `already_paid` | Reentrega del mismo pago. `idempotent: true`. Puede activar tickets rezagados. |

**Rechazo (`ok: false`)**

| `code` | `needs_refund` | Cuándo |
| --- | --- | --- |
| `invalid_args` | — | Falta `order_id` o `transaction_id` |
| `invalid_provider` | — | Provider fuera del enum `payment_provider_type` |
| `order_not_found` | — | UUID inexistente |
| `order_expired` | **sí** | La orden ya estaba `expired`, o el hold venció en el camino idempotente |
| `already_paid_other_payment` | **sí** | Segundo cobro sobre una orden ya pagada |
| `invalid_status` | — | Estado inesperado (no `pending`, no `paid` manejado) |
| `organizer_suspended` | **sí** | El organizador no está aprobado |
| `seating_hold_expired` | **sí** | El asiento ya no está reservado para esta orden |
| `no_tickets` | **sí** | Cero tickets `pending_payment` y cero `valid` |

**Excepciones (rollback + reintento de la cola)**

| Excepción | Cuándo |
| --- | --- |
| `Forbidden` (42501) | Llamada sin `service_role` |
| `TICKET_ACTIVATION_MISMATCH` | Tickets activados ≠ esperados |
| `ORDER_STATUS_RACE` | La orden cambió entre el lock y el `UPDATE` |
| `PROMO_MAX_USES` | Promo agotada al momento de pagar |
| `claim_finalize_rejected:{code}` | Cualquier `ok: false` sin `needs_refund` |

Sumado a los códigos que produce TypeScript antes del SQL: `currency_mismatch`,
`amount_mismatch`, `already_processed`, `promo_max_uses`, `finalize_failed`, `invalid_args`,
`order_not_found`.

---

## 7. Fase 5 — Post-emisión (QR, expansión, email)

El commit ya ocurrió: la orden está `paid` y los tickets `valid`. Lo que sigue es fuera de la
transacción, en `fulfillPaidOrderAfterFinalize` (`confirm-order.ts:51–133`):

1. **`release_leftover_cart_holds_for_order`** — best effort; los errores se loguean y siguen.
2. **`issueGuestReceiptAccess(orderId)`** — persiste `guest_token` y arma la URL mágica para
   compradores sin cuenta.
3. **`expandIndividualAccessTickets(admin, orderId)`** — explota grupos: un ticket con
   `max_admissions > 1` (mesa, combo) se convierte en el padre con `group_slot = 1` más N−1 filas
   nuevas, cada una con su propio `qr_code` y `totp_secret` y `max_admissions = 1`. Es lo que hace
   posible la interfaz Padre/Hijo descrita en [`WALLET_SECURITY.md`](./WALLET_SECURITY.md).
4. **`ensurePaidOrderDynamicQrs(orderId)`** — **fire-and-forget** (`void ... .catch()`). Para cada
   ticket `valid` sin secreto, `buildDynamicQrPatch` completa `qr_code`, `totp_secret` (24 bytes
   hex) e `is_dynamic_qr: true`.
5. **`scheduleNotificationOutboxDrain()`** — drena el outbox en `after()`.

El mail de confirmación **no se manda desde acá**. Se encoló en el trigger, en la misma
transacción que el pago:

- **Encolado transaccional** — trigger P124 sobre `orders.status → 'paid'` inserta en
  `notification_outbox`. Si el pago se revierte, el mail nunca existió.
- **Entrega asíncrona** — `drainNotificationOutbox` reclama filas vía
  `claim_notification_outbox` y llama a `sendPaidOrderReceiptEmail`. Hasta 12 intentos con
  backoff exponencial hasta 300 s.
- **Red de seguridad** — el cron `/api/cron/process-notifications`, cada minuto.

Ese patrón (outbox transaccional + drenaje idempotente) es lo que evita el clásico "cobré pero no
mandé el mail" y su inverso "mandé el mail de una compra que se revirtió".

---

## 8. Sandbox vs. compra real

Hay **dos conceptos distintos** que conviene no mezclar:

| Capa | Qué significa | Señales |
| --- | --- | --- |
| **Test de comercio** (sandbox TokePass) | Compra simulada sobre un evento no publicado. No hay dinero ni MP. | `orders.is_test`, `orders.environment = 'test'`, `payment_method = 'test_sandbox'`, `payment_provider = 'sandbox'`, `tickets.is_test` |
| **Modo sandbox de la API de MP** | Credenciales de prueba para el flujo **real** en dev/staging. | Token `TEST-`, `MP_FORCE_SANDBOX=1`, `NODE_ENV`/`VERCEL_ENV` no productivos |

Una compra de test **nunca toca Mercado Pago**. Una compra en modo sandbox de MP **sí** recorre
todo el flujo real, con dinero de juguete.

### 8.1 Quién decide que es una compra de prueba

`resolveCheckoutEventAccess` (`lib/modules/checkout/services/access.service.ts`) resuelve el
acceso y devuelve `useSandbox`:

| Situación del evento | Resultado |
| --- | --- |
| `published` | `useSandbox: false` — venta real, siempre |
| `paused` | Sólo staff, y **también venta real** (`useSandbox: false`) |
| `draft`, `pending_approval`, `needs_revision`, `rejected` + `preview_key` válida | `useSandbox: true` |
| Mismos estados + organizador dueño o `super_admin` | `useSandbox: true` |

```ts
// lib/modules/checkout/services/checkout.service.ts
if (payload.sandbox && !access.useSandbox) {
  return {
    success: false,
    error: "Las compras de prueba solo están disponibles antes de que el evento esté en venta.",
  }
}
const useSandbox = access.useSandbox || Boolean(payload.sandbox)
```

El cliente **no puede forzar** modo prueba: si pide `sandbox: true` sobre un evento publicado, el
checkout falla en vez de degradar a simulado. La `preview_key` sólo es válida para eventos
`draft` (RPC `event_preview_key_matches`).

Los estados de sandbox están centralizados:

```ts
// lib/events/review-status.ts (16–22)
export function isSandboxEventStatus(status: string | null | undefined) {
  return (
    status === "draft" ||
    status === "pending_approval" ||
    status === "needs_revision" ||
    status === "rejected"
  )
}
```

### 8.2 Cómo se propaga el flag

Tres triggers mantienen `orders` y `tickets` coherentes en ambas direcciones:

| Trigger | Dirección |
| --- | --- |
| `tickets_force_is_test_on_draft` | Ticket insertado en evento sandbox → `is_test = true` |
| `tickets_propagate_is_test_to_order` | Ticket test → orden `is_test = true`, `environment = 'test'` |
| `orders_propagate_is_test_to_tickets` | Orden test → todos sus tickets `is_test = true` |
| `orders_sync_environment` | Mantiene `is_test` y `environment` alineados siempre |

En la aplicación, `orderTestFlags()` produce el par consistente:

```ts
// lib/finance/order-test-flags.ts
export function orderTestFlags(isTest: boolean) {
  return isTest
    ? { is_test: true, environment: "test" }
    : { is_test: false, environment: "production" }
}
```

Marcar sólo uno de los dos campos es imposible en la práctica: el trigger corrige.

### 8.3 El stock de prueba no consume aforo real

Mecanismo de P133: para eventos en estado sandbox, `event_uses_live_stock()` devuelve false, y un
trigger **congela** el contador:

```sql
-- 20261120300000_p133_sandbox_stock_isolation.sql (29–54)
if tg_op = 'UPDATE'
   and coalesce(new.sold, 0) is distinct from coalesce(old.sold, 0)
   and not public.event_uses_live_stock(new.event_id) then
  -- Congela sold en sandbox: ni POS/checkout ni expires de holds tocan aforo real.
  new.sold := old.sold;
```

Y la validación de capacidad se saltea la comprobación de agotamiento:

```sql
-- 20261120300000_p133_sandbox_stock_isolation.sql (≈633–722)
v_sandbox := public.is_sandbox_event_status(v_event.status);
...
if v_sandbox then
  v_tier.sold := 0;
  v_event.venue_id := null;
end if;
...
if not v_sandbox
   and (v_tier_cap - v_tier.sold + v_expired) < v_additional then
  raise exception 'Capacidad del ticket insuficiente'
```

Hay además una válvula de seguridad: `release_test_order_live_stock(p_order_id)` revierte un
incremento de stock real que se hubiera colado antes de marcar la orden como test.

### 8.4 La emisión de prueba salta el webhook

```sql
-- 20261130800000_p194_sandbox_finalize_activate_tickets.sql (≈22–97)
update public.orders set is_test = true, environment = 'test', ...
update public.tickets set is_test = true ...
perform public.release_test_order_live_stock(p_order_id);
v_result := public.finalize_paid_order(p_order_id, 'sandbox', 'sandbox:' || p_order_id::text, ...);
if coalesce(v_result ->> 'code', '') = 'invalid_provider' then
  v_result := public.finalize_paid_order(..., 'mercadopago', 'sandbox:' || ...);
end if;
update public.tickets set status = 'valid', is_test = true
  where order_id = p_order_id and status = 'pending_payment';
```

Después, `fulfillSandboxPaidOrder` reutiliza exactamente el mismo follow-through que el webhook
(`fulfillPaidOrderAfterFinalize`) y manda el mail. La compra de prueba ejercita todo el circuito
salvo el dinero.

### 8.5 Guardas contra mezclar entornos

```ts
// lib/mercadopago.ts (41–66)
export function assertMercadoPagoProductionSafe(accessToken?: string): void {
  if (process.env.VERCEL_ENV !== "production") return
  if (process.env.MP_FORCE_SANDBOX === "1") {
    throw new Error("MP_FORCE_SANDBOX=1 no esta permitido en produccion.")
  }
  const token = (accessToken ?? getMercadoPagoAccessToken()).trim()
  if (token.startsWith("TEST-")) {
    throw new Error("El token de Mercado Pago de produccion no puede comenzar con TEST-.")
  }
}
```

| Guarda | Qué previene | Efecto al dispararse |
| --- | --- | --- |
| `scripts/check-production-env.mjs` | Deploy con token `TEST-` o `MP_FORCE_SANDBOX=1` | El build sale con código 1: no hay deploy |
| `assertMercadoPagoProductionSafe()` | Llamadas a MP en producción con credenciales de prueba | `Error` no atrapado |
| `assertSecondaryPspDisabledInProduction()` | Payway / NaranjaX en producción | `PaymentProviderNotSupportedError` |
| Chequeo de URL del adapter | Modo sandbox con URL de producción (o viceversa) | `PaymentProviderUnavailableError` con mensaje accionable |
| `payload.sandbox && !access.useSandbox` | Forzar modo prueba sobre evento publicado | Checkout rechazado |

Ojo con el nombre: `lib/payments/production-guard.ts` **no** protege contra el sandbox de MP; sólo
bloquea PSPs secundarios en producción. Las guardas de MP viven en `lib/mercadopago.ts` y en el
script de build.

### 8.6 Aislamiento del dato de prueba

| Dominio | Cómo se aísla |
| --- | --- |
| Puerta | El scan devuelve `test_ticket`: `"TICKET DE PRUEBA - ACCESO DENEGADO"` |
| KPIs del organizador | Los RPC filtran por `is_test`, `environment`, `payment_method` y estado del evento (P193) |
| Ledger financiero | Igual, con opción explícita `p_include_test` (P132) |
| Transferencia | `raise exception 'TICKET_IS_TEST'` |
| Reventa | Rechazado en el RPC y oculto en la UI (`!ticket.isTest`) |
| Billetera | **Sí aparece**, con marca de agua `"TICKET DE PRUEBA - SIN VALIDEZ COMERCIAL"` |
| Al publicar | `reset_event_test_inventory_internal` borra tickets test, cancela órdenes test y reconstruye `sold` desde tickets reales |

El purgado al publicar es automático (trigger `events_reset_test_inventory_on_go_live` sobre el
cambio de estado) y además hay un botón manual en el editor de mapas: `"🧪 Purgar Compras de
Prueba"` (ver [`MAP_BUILDER.md`](./MAP_BUILDER.md), sección de protección contra bloqueos de
prueba).

---

## 9. Fallos y compensación

### 9.1 Pagos que quedan en espera

Si MP responde `pending` o `in_process`, el worker marca el evento como procesado y **no hace
nada**: no hay ticket. La emisión depende de que MP mande después la notificación de `approved`.
Si esa notificación se pierde, el rescate es el reconcile de huérfanos (9.4).

### 9.2 Reembolso automático

`refundExpiredPayment` (`lib/payments/mercadopago/refund-expired-payment.ts`) ejecuta
`PaymentRefund.total({ payment_id })`, y es idempotente frente a errores de "ya reembolsado"
(`refund-expired-payment-errors.ts`).

Se dispara con cada `needsRefund: true`:

| Causa | Código | Capa |
| --- | --- | --- |
| Moneda ≠ ARS | `currency_mismatch` | TS, antes del SQL |
| Monto ≠ total de la orden | `amount_mismatch` | TS, antes del SQL |
| Orden vencida | `order_expired` | SQL |
| Cobro duplicado | `already_paid_other_payment` | SQL |
| Organizador suspendido | `organizer_suspended` | SQL |
| Hold de asiento vencido | `seating_hold_expired` | SQL |
| Sin tickets | `no_tickets` | SQL |
| Promo agotada | `promo_max_uses` | Trigger |

La política es consistente: **si TokePass no puede entregar exactamente lo que se cobró, devuelve
el 100% en vez de entregar algo distinto.**

### 9.3 Contracargos y disputas

`revokeDisputedPaidOrder` (`lib/payments/core/revoke-disputed-order.ts`) para `in_mediation`,
`charged_back` y `refunded`:

1. `apply_order_refund_state(orderId, "refund_processing" | "refunded")` — decrementa `sold`,
   libera unidades, pasa tickets a `refunded`/`cancelled`, **rota el `totp_secret` a `dead-cb-*`**
   y restituye stock de extras.
2. `cancel_paid_order_tickets(orderId)` — limpieza idempotente de remanentes.
3. Si es `charged_back`: `record_buyer_denylist_from_order` — el comprador queda en la denylist,
   que el checkout consulta en el paso 12 de la fase 1.
4. Log de auditoría de seguridad.

La rotación del `totp_secret` es lo que mata el QR vivo del ticket revocado: aunque el usuario
tenga la pantalla abierta, el código deja de validar contra el servidor. El detalle criptográfico
está en [`WALLET_SECURITY.md`](./WALLET_SECURITY.md).

### 9.4 Pagos huérfanos

Un **huérfano** es una orden `pending` (o recién `expired`) con `payment_started_at` seteado: el
usuario llegó a pagar y MP puede haber aprobado sin que el webhook llegara o se procesara.

`reconcileOrphanPaymentHolds()` corre **al principio** del cron `expire-orders`, antes de liberar
nada. Para cada candidata busca en MP por `external_reference` y decide (`decideOrphanPaymentAction`):

| Resultado en MP | Acción |
| --- | --- |
| `approved` | Finalizar. Si vuelve `needs_refund`, reembolsar. |
| `pending`, `in_mediation` | Mantener el hold (el TTL de 15 min lo corta después). |
| Vacío o `rejected` | Liberar vía `expire_abandoned_order`. |
| Provider ≠ MP | Mantener (no hay búsqueda cross-PSP implementada). |

Prioriza los holds críticos (los últimos 2 minutos de la ventana de 15). Es la razón por la que el
orden dentro del cron importa: reconcile primero, expiración después.

### 9.5 Preferencias obsoletas

`lib/payments/stale-preferences.ts` no es un cron; corre en el checkout.
`invalidateStaleCheckoutPreferences` expira en MP las preferencias de otras órdenes
`pending`/`expired` del mismo comprador para el mismo evento, para que no pueda pagar dos veces
por dos pestañas distintas.

### 9.6 Cola muerta

Al llegar a 12 intentos, el evento queda `dead`. La reposición existe sólo como RPC:
`replay_dead_webhook_event(p_event_id)`, restringido a `super_admin` o `service_role`. **No hay
pantalla de administración para la cola de webhooks**: hay que ejecutar SQL.

---

## 10. Los tres crons

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/expire-orders",       "schedule": "* * * * *" },
    { "path": "/api/cron/process-webhooks",    "schedule": "* * * * *" },
    { "path": "/api/cron/process-notifications","schedule": "* * * * *" }
  ]
}
```

Los tres corren cada minuto y los tres exigen `CRON_SECRET` por `Authorization: Bearer` o
`x-cron-secret`; sin secreto configurado devuelven 401 (fail closed).

| Cron | Qué hace |
| --- | --- |
| `expire-orders` | Reconcile de huérfanos y después liberación de holds vencidos |
| `process-webhooks` | Drena `payment_webhook_events` en estado `pending`/`failed` (lotes de 15) |
| `process-notifications` | Drena `notification_outbox` (mails, WhatsApp) |

El orden interno de `expire-orders` es deliberado y está documentado en el propio archivo:

```ts
/**
 * Libera stock de checkouts abandonados (barrido cada minuto).
 * Reconcile MP primero (aprueba cobros huérfanos o reembolsa si needs_refund),
 * después TTL 15m. Búsqueda MP en paralelo; holds en los últimos 2 min primero.
 * Lotes de 2000 + SKIP LOCKED, un RPC a la vez, para no pelear
 * locks con reserve_unified_cart_tx.
 */
```

Ejecuta ocho RPCs en secuencia: `expire_abandoned_orders`, `expire_seating_orders`,
`expire_seating_cart_holds`, `expire_ga_cart_holds`, `expire_seat_holds`,
`purge_expired_checkout_holds`, `expire_resale_listing_reservations`,
`expire_pending_ticket_transfers`. **Uno a la vez**, nunca en paralelo, para no competir por locks
con las reservas en vivo. Dos de ellos toleran "función inexistente" por regex, para sobrevivir a
un deploy adelantado a su migración.

---

## 11. Deuda y riesgos verificados

Hallazgos concretos de la lectura del código, no hipótesis.

### 11.1 El QR se genera después del commit, y el mail puede adelantarse

`ensurePaidOrderDynamicQrs` es fire-and-forget (`void ... .catch()`), y el encolado del mail
ocurre en un trigger **dentro** de la transacción del pago. El drenaje del outbox puede ganarle a
la escritura de los `totp_secret`. Mitigación existente: el índice único del outbox impide mandar
dos veces el `order_paid`, y el cron de notificaciones reintenta; pero el primer intento puede
salir con tickets sin QR dinámico.

### 11.2 La expansión de grupos también es post-commit

`expandIndividualAccessTickets` crea las filas hijas después del commit. El mail de una mesa de 10
puede armarse antes de que existan los 10 tickets individuales. Mismo patrón de riesgo que 11.1.

### 11.3 Tickets que se pueden quedar en `pending_payment`

Si el finalize falla 12 veces con códigos reintentables, el evento muere en la cola con el pago
**ya capturado** y los tickets sin activar. El reconcile de huérfanos sólo ayuda mientras la orden
siga `pending`. Sin UI de replay, la recuperación es manual por SQL.

### 11.4 `in_mediation` sin fallback

Si `revokeDisputedPaidOrder` falla, el dispatch fuerza el estado de la orden sólo para `refunded`
y `charged_back`. Para `in_mediation` no hay fallback: la orden puede quedar `paid` con tickets
válidos aunque haya una disputa abierta.

### 11.5 Firma inválida devuelve 200

Es la decisión correcta contra bucles de reintento, pero significa que **un ataque de firmas
inválidas no genera ninguna señal de alerta más allá del log**. No hay contador ni umbral que
dispare una alarma sobre `invalid_signature`.

### 11.6 Sin `binary_mode` en la preferencia

MP puede aprobar métodos que quedan en `pending`/`in_process`. El sistema los ignora
correctamente, pero el comprador ve "pago realizado" en MP sin ticket hasta que llegue el
`approved`. Activar `binary_mode` eliminaría la clase entera de casos.

### 11.7 Dos caminos de creación de preferencia

`MercadoPagoAdapter.createCheckoutSession` (compra) y `createPaymentPreference`
(`app/actions/payments.ts`, reintento) construyen la preferencia por separado. Hoy coinciden en lo
esencial y difieren en `metadata`; es un punto de deriva para cambios futuros.

### 11.8 La idempotencia del checkout es opcional

Sin `idempotencyKey` del cliente, el doble click está contenido sólo por rate limits y por la
ventana de reutilización de 2 minutos. La ventana `in_progress` de la clave es de 60 s: pasado ese
tiempo, la misma clave puede iniciar una reserva nueva aunque la primera siga en curso.

### 11.9 Confusión posible entre las dos capas de "prueba"

En local o staging contra un evento **publicado**, `isMercadoPagoSandboxMode()` es true (por
`NODE_ENV`), así que el pago es de juguete — pero `useSandbox` es false, así que la orden queda
`is_test = false`, `environment = 'production'`. Resultado: dinero falso produciendo órdenes
marcadas como producción en la base de desarrollo. En producción real lo previenen las guardas de
token; en preview/staging, nada.

### 11.10 No hay ledger inmutable de comisiones

Las finanzas se calculan como modelo de lectura agregando `orders.total_amount` y `service_charge`
sobre `status = 'paid'`. No hay una fila de comisión congelada al momento del pago, así que la
exactitud contable depende por completo de que `orders.status` refleje siempre la realidad de
reembolsos y contracargos.

### 11.11 Dos tablas de eventos de webhook

Conviven `payment_webhook_events` (la cola nueva, con idempotencia por
`(provider, external_event_id)`) y la legacy `mp_webhook_events`, que dispatch todavía usa para
idempotencia de boosts, reventa y disputas. Las órdenes estándar pasan por ambas con propósitos
distintos.

### 11.12 Incoherencia menor de moneda

El adapter puede construir una preferencia en USD (`currency_id: input.currency === "USD" ? ...`),
pero `isAllowedPaymentCurrency` exige ARS exacto en la confirmación. Un pago en USD se
reembolsaría en lugar de emitir. Hoy el checkout siempre manda ARS, así que es teórico, pero las
dos capas no dicen lo mismo.

### 11.13 Comentario desactualizado (corregido)

El tipo `CheckoutResult` (`lib/modules/checkout/types/checkout.types.ts`) decía "8m" en el
comentario de `expiresAt`; ya está corregido a 15 minutos, que es el TTL real.

---

## Documentos relacionados

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, patrones y flujo de autenticación
- [`DB_SCHEMA.md`](./DB_SCHEMA.md) — locks transaccionales y anti-sobreventa en detalle
- [`WALLET_SECURITY.md`](./WALLET_SECURITY.md) — QR vivo, interfaz Padre/Hijo, canje en barras
- [`MAP_BUILDER.md`](./MAP_BUILDER.md) — inventario de asientos y purga de compras de prueba
- [`ONBOARDING.md`](./ONBOARDING.md) — variables de entorno y reglas de entorno local
