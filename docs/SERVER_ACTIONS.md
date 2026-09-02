# Rutas y acciones del servidor

Inventario de la superficie de mutación de TokePass: **64 archivos** en `app/actions/*.ts` y
**25 route handlers** en `app/api/**/route.ts`. El documento arranca por las tres acciones más
críticas del negocio —validación de QR en puerta, transferencia de entradas y guardado del mapa— y
después mapea el resto por dominio.

La regla general del proyecto: **las mutaciones son Server Actions; los route handlers existen sólo
cuando hace falta control del HTTP** (webhooks externos, crons, cookies, binarios, PWA offline).
Ver [sección 6](#6-route-handlers-vs-server-actions).

## Índice

1. [Cómo leer una Server Action de TokePass](#1-cómo-leer-una-server-action-de-tokepass)
2. [Validación de QR en puerta](#2-validación-de-qr-en-puerta)
3. [Transferencia de entradas](#3-transferencia-de-entradas)
4. [Guardado del mapa](#4-guardado-del-mapa)
5. [Otras mutaciones críticas](#5-otras-mutaciones-críticas)
6. [Route handlers vs Server Actions](#6-route-handlers-vs-server-actions)
7. [Inventario por dominio](#7-inventario-por-dominio)
8. [Deuda y riesgos verificados](#8-deuda-y-riesgos-verificados)

---

## 1. Cómo leer una Server Action de TokePass

### 1.1 La forma canónica

Casi toda acción sigue esta secuencia:

```ts
"use server"

export async function hacerAlgo(input: Input): Promise<Result> {
  // 1. Normalizar y validar el input (Zod o guardas manuales)
  // 2. createClient() + supabase.auth.getUser()
  // 3. Autorización de dominio (helper de rol / propiedad del evento)
  // 4. Mutación: RPC transaccional o UPDATE con RLS
  // 5. Mapear el error de Postgres a un mensaje en castellano
  // 6. revalidatePath(...) de las rutas afectadas
  // 7. Devolver { success: true, ... } | { success: false, error }
}
```

El paso 4 es donde está la sustancia: **las mutaciones con invariantes de negocio no se hacen con
`UPDATE` desde TypeScript, se hacen con un RPC**. El escaneo, la transferencia y la venta en el POS
son todos RPCs `SECURITY DEFINER`; TypeScript los llama y traduce el resultado.

### 1.2 El contrato de retorno

Existe un tipo unificado:

```ts
// lib/action-result.ts
/**
 * Contrato unificado para Server Actions / API mutations.
 */
export type ActionResult<T = undefined> =
  | (T extends undefined
      ? { success: true; data?: undefined }
      : { success: true; data: T })
  | { success: false; error: string }

export function ok(): { success: true }
export function ok<T>(data: T): { success: true; data: T }
export function fail(error: string): { success: false; error: string }
```

**Pero ningún archivo de `app/actions/` lo importa.** Unos 30 archivos redeclaran un tipo
equivalente localmente, y los helpers `ok()` / `fail()` no se usan en ninguna parte. En la práctica
convive con al menos cuatro formas más: `AuthActionState { error, success }` en `auth.ts`,
`EventAuditActionResult` en `event-audit.ts`, uniones ad-hoc con campo `code` (como las de
transferencia), y en `superadmin.ts` excepciones tipadas (`SuperAdminForbiddenError`).

La forma discriminada `{ success: true } | { success: false; error }` sí es universal; lo que varía
es de dónde sale el tipo.

### 1.3 Autorización: helpers reales

No hay un módulo global de `requireAdmin`. Hay dos helpers compartidos que valen la pena y un montón
de duplicación.

**El helper bueno**, para todo lo que dependa de un evento:

```ts
// lib/event-ops-access.ts (12–61)
export async function assertEventOpsAccess(
  eventId: string,
  allowedRoles: EventStaffRole[],
): Promise<
  | { ok: true; userId: string; isOrganizer: boolean }
  | { ok: false; reason: "auth_required" | "forbidden" }
> {
  // 1. getUser()
  // 2. super_admin → pasa
  // 3. event.organizer_id === user.id → pasa como organizador
  // 4. RPC user_is_event_organizer_or_staff(eventId, userId, roles) → pasa como staff
}
```

Los cuatro niveles en orden, y devuelve `isOrganizer` para que quien llama distinga al dueño del
acomodador. La lectura de `events` usa `organizerTableClient()` para no chocar con la recursión de
RLS entre `events` y `tickets` (el problema P196→P197 documentado en
[`DB_SCHEMA.md`](./DB_SCHEMA.md)).

| Helper | Archivo | Qué resuelve |
| --- | --- | --- |
| `assertEventOpsAccess(eventId, roles)` | `lib/event-ops-access.ts` | Organizador, super admin o staff con rol permitido |
| `listOperableEvents({ roles })` | `lib/event-ops-access.ts` | Eventos que un staff puede operar (POS, escáner) |
| `resolveScannerActor(eventId)` | `lib/scanner/resolve-scanner-access.ts` | Staff con cuenta **o** sesión de invitado por PIN |
| `isPlatformOwnerRole(role)` | `lib/auth/platform-owner.ts` | `role === "super_admin"` |
| `assertCurrentSessionAal2(supabase)` | `lib/auth/aal2.ts` | Segundo factor para reembolsos masivos |
| `organizerTableClient()` | `lib/supabase/organizer-table-client.ts` | Cliente que evita la recursión RLS en `events`/`tickets` |

Y la duplicación: `requireSuperAdmin` está reescrito en **ocho archivos o más** (`superadmin.ts`,
`event-audit.ts`, `event-payouts.ts`, `payouts.ts`, `superadmin-refunds.ts`, `superadmin-orders.ts`,
`platform-settings.ts`, `control-tower.ts`, `platform-sponsors.ts`), con deriva de comportamiento
entre copias. `requireOrganizer` y `assertEventOrganizer` están duplicados de forma parecida. Ver
[8.2](#82-requiresuperadmin-duplicado-ocho-veces-con-deriva).

### 1.4 Qué cliente de Supabase, y cuándo

| Cliente | Cuándo se usa |
| --- | --- |
| `createClient()` | Por defecto. JWT del usuario, RLS activa. |
| `createAdminClient()` | `service_role`, saltea RLS. Para operaciones cross-tenant de superadmin, flujos públicos sin sesión, y escrituras que RLS no permitiría (rotar `totp_secret`, por ejemplo). |
| `createPublicClient()` | Lecturas anónimas de catálogo. |
| `organizerTableClient()` | Lecturas del panel donde RLS puede recursar. **Obliga a filtrar por IDs ya autorizados.** |
| `tryCreateAdminClient() ?? createClient()` | Escáner: usa admin si está disponible, degrada a RLS si no. |

**45 de los 64 archivos importan el cliente admin.** Eso es mucho, y es la razón por la que la
autorización explícita al principio de cada acción no es opcional: en esos caminos RLS no va a
salvar a nadie.

### 1.5 El resto de las convenciones

- **Validación con Zod**, en `lib/validations/*` (19 archivos). Trece acciones importan de ahí; el
  ejemplo canónico es `PosSaleInputSchema.safeParse` en `createPosSale`. El resto valida a mano o
  delega al RPC.
- **Rate limiting con nombre**, definido en `lib/security/rate-limit-policy.ts`: `authIp`,
  `checkoutIp`, `checkoutUser`, `paymentPreferenceUser`, `publicStockIp`, `promoValidateIp`,
  `promoValidateUser`. Algunos archivos usan limitadores ad-hoc (`door-access.ts`, `withdrawal.ts`).
- **`revalidatePath`** en unos 45 archivos, agrupado en helpers cuando hay varias rutas
  (`revalidateWalletPaths`, `revalidateAuditPaths`, `revalidateGuestPaths`).
- **Auditoría** con `writeSecurityAuditLog()` (`lib/security/audit-log.ts` → RPC
  `write_security_audit_log` → tabla `security_audit_log`). La llaman `complimentary.ts`,
  `issued-tickets.ts`, `superadmin-refunds.ts`, `superadmin-orders.ts`, `withdrawal.ts`,
  `ticket-bundles.ts` y `print-studio-core.ts`.

---

## 2. Validación de QR en puerta

**`scanAndValidateTicket`** — `app/actions/scanner.ts:424`

Es la acción más caliente del sistema: corre con una persona esperando en la puerta, a veces sin
señal, y un falso positivo significa que alguien entra gratis mientras un falso negativo deja a un
cliente afuera.

### 2.1 Qué recibe

```ts
export async function scanAndValidateTicket(
  base64Payload: string,   // el contenido crudo del QR
  eventId: string,         // el evento que el operador tiene abierto
  gateId?: string | null,  // la gatera/sector que está controlando
): Promise<ScanTicketResult>
```

El `gateId` **es obligatorio en la práctica**: si viene vacío, la acción rechaza con
`"Seleccioná la gatera / sector que estás controlando"`. Sin saber qué puerta es, no se puede
validar el sector.

### 2.2 Quién puede escanear

```ts
const access = await resolveScannerActor(eventId)
```

Dos modos, resueltos en ese orden:

```ts
// lib/scanner/resolve-scanner-access.ts (31–59)
export async function resolveScannerActor(eventId: string): Promise<ScannerActor> {
  const account = await assertEventOpsAccess(eventId, ["door_staff"])
  if (account.ok) {
    return {
      ok: true, mode: "account", userId: account.userId,
      isOrganizer: account.isOrganizer,
      db: tryCreateAdminClient() ?? (await createClient()),
      validatedBy: account.userId,
    }
  }

  const guest = await readValidDoorGuestSession()
  if (!guest || guest.eventId !== eventId) {
    return { ok: false, reason: account.reason }
  }

  return {
    ok: true, mode: "guest", organizerId: guest.organizerId,
    eventId: guest.eventId, db: createAdminClient(),
    validatedBy: guest.organizerId,
  }
}
```

El **modo invitado** es la solución a un problema real de producción: los acomodadores de una noche
no tienen cuenta. Canjean un PIN de 6 dígitos (`redeemDoorAccessPin`), obtienen una cookie de sesión
de puerta acotada a **un** evento, y escanean con el cliente admin. El `validatedBy` queda apuntando
al organizador, no a una persona: la auditoría dice "alguien de la productora", que es lo máximo que
se puede afirmar.

### 2.3 La cascada de rechazos

Antes de tocar nada, catorce compuertas en orden. El orden importa: lo criptográfico antes que lo
contextual, y lo contextual antes que lo de estado.

| # | Compuerta | `status` devuelto |
| --- | --- | --- |
| 1 | Payload vacío o sin `eventId` | `invalid_payload` |
| 2 | Sin permiso de escaneo | `auth_required` / `forbidden` |
| 3 | Evento inexistente | `not_found` |
| 4 | Payload no decodificable para el `qr_type` del evento | `invalid_payload` |
| 5 | Ticket sin `totp_secret` | `invalid_payload` (`"Missing TOTP Secret"`) |
| 6 | **HMAC inválido** (`assertLivingMac` / `assertStaticMac`) | `invalid_payload` (`"QR inválido o manipulado"`) |
| 7 | QR estático en evento dinámico online | `invalid_payload` |
| 8 | **Ventana temporal vencida** | `expired_qr` (`"QR Expirado (Captura de pantalla)"`) |
| 9 | Ticket de otro evento | `wrong_event` |
| 10 | Sector/gatera equivocada | `wrong_sector` + `redirectSector` |
| 11 | Jornada equivocada (multi-día) | `wrong_day` |
| 12 | Lista de invitados vencida | `expired_qr` |
| 13 | Estado del ticket: `transferred`, `used`/`scanned`, cancelado, `pending_payment` | `transferred`, `already_used`, `cancelled`, `unpaid` |
| 14 | **Ticket de prueba** | `test_ticket` (`"TICKET DE PRUEBA - ACCESO DENEGADO"`) |
| 15 | RPC `is_ticket_admission_eligible` en falso | `unpaid` |

Detalles que valen:

**El reloj es del servidor, no del dispositivo.** `readScannerServerTimeMs(supabase)` alimenta el
`nowMs` que usa `resolveScanSecret`. Un teléfono con la hora corrida no puede aceptar ni rechazar QR
por error.

**El mensaje de QR expirado nombra el ataque.** `"QR Expirado (Captura de pantalla)"` — el operador
entiende de inmediato que le están mostrando una foto, no un QR vivo. El detalle criptográfico está
en [`WALLET_SECURITY.md`](./WALLET_SECURITY.md).

**El sector equivocado devuelve adónde ir**, no sólo un rechazo:

```ts
return {
  success: false,
  status: "wrong_sector",
  message: `ACCESO DENEGADO - ENTRADA PARA OTRO SECTOR (Dirigirse a: ${gateMatch.correctSector})`,
  redirectSector: gateMatch.correctSector,
}
```

**El reescaneo dice quién validó antes.** Cuando el ticket ya está `used`, la acción hace un
`SELECT` extra a `profiles` para devolver el nombre del operador junto con `scannedAt` y la puerta.
Es lo que permite resolver una discusión en la fila sin llamar a nadie. También devuelve un
`httpStatus` distinto (`SCAN_REPLAY_HTTP_STATUS`) para que el cliente offline distinga un duplicado
de un error.

**La excepción de boletería física:**

```ts
// Refuerzo: tickets de boletería física nunca rotan por ventana temporal.
if (row.is_dynamic_qr !== false && resolved.enforceFreshness && resolved.expired) {
```

Un ticket impreso en papel no puede rotar su QR cada 15 segundos. La condición
`is_dynamic_qr !== false` exime explícitamente a esos tickets del control de frescura.

### 2.4 Qué muta

Una sola escritura de negocio, y es un RPC:

```ts
const { data: admissionResult, error: updateError } = await supabase.rpc(
  "scan_ticket_admission",
  {
    p_ticket_id: row.id,
    p_validated_by: access.validatedBy,
  },
)
```

| Tabla | Efecto |
| --- | --- |
| `tickets` | `status` → `used`/`scanned`, `scanned_at`, `validated_by`, `admissions_used++` |
| `guest_list_entries` | `mark_guest_entry_checked_in` marca la entrada como presente |

**Toda la lógica de admisión vive en el RPC, no acá.** Las quince compuertas de TypeScript son
prefiltro para dar mensajes buenos; la decisión atómica —¿queda cupo en este ticket de N
admisiones?, ¿es la jornada correcta del abono?— la toma Postgres bajo lock. Por eso el RPC devuelve
su propio juego de códigos que TypeScript vuelve a traducir:

| `admission.code` | Significado |
| --- | --- |
| `test_ticket` / `test_ticket_live` | Ticket de prueba |
| `unpaid` | Sin orden pagada |
| `cancelled`, `transferred` | Estado inválido |
| `transfer_pending` | Transferencia en curso: QR bloqueado |
| `listed_for_resale` | En reventa: QR bloqueado |
| `already_used_today` | Abono ya usado en esta jornada |
| `outside_window` | Abono fuera de las jornadas habilitadas |

Que los mismos casos se chequeen dos veces (antes en TypeScript, de nuevo en SQL) no es redundancia
inútil: entre el prefiltro y el RPC pueden pasar segundos, y en esos segundos el ticket puede
transferirse o listarse en reventa. La verdad es la del RPC.

En éxito devuelve el cupo restante en el mensaje —`ACCESO PERMITIDO · QUEDAN 3 INGRESOS`— más los
datos de asiento y el bonus de consumición si el tier lo tiene y está dentro de su ventana horaria.

### 2.5 Escaneo offline

`syncOfflineScansBatch` (`scanner.ts:1320`) sube los escaneos que el dispositivo hizo sin señal, y
`fetchEventTicketManifest` (`scanner.ts:919`) baja el manifiesto que hace posible validar offline.
El manifiesto tiene una restricción notable:

```ts
/** Manifiesto de la gatera: solo tickets del deviceSlot. Sin slot no baja nada. */
export async function fetchEventTicketManifest(
  eventId: string,
  deviceSlot: { index: number; count: number },
)
```

Cada dispositivo recibe **su porción** del padrón, no el padrón entero. Un teléfono perdido o robado
expone una fracción de los `totp_secret`, no todos. Y sin `deviceSlot` no baja nada.

---

## 3. Transferencia de entradas

`app/actions/transfer.ts` (541 líneas). Seis acciones exportadas que cubren el ciclo completo:
iniciar, compartir por enlace, cancelar, previsualizar, reclamar y reconciliar pendientes.

### 3.1 El modelo: dos fases con QR bloqueado

Una transferencia no mueve la entrada al instante. Crea una fila `pending` y **bloquea el QR del
emisor** hasta que el receptor la reclame. El mensaje de éxito lo dice tal cual:

> `"Transferencia pendiente: el QR quedó bloqueado hasta que tu amigo la reclame."`

Eso cierra la ventana obvia de fraude: regalar la entrada y entrar igual con la captura del QR.
Coherente con el código `transfer_pending` que el escáner rechaza (sección 2.4).

### 3.2 Iniciar: `transferTicketAction`

| Aspecto | Detalle |
| --- | --- |
| **Recibe** | `{ ticketId, receiverEmail, termsAccepted }` |
| **Autoriza** | `getUser()`; la propiedad la valida el RPC |
| **Muta** | RPC `initiate_ticket_transfer` → `ticket_transfers` (fila `pending` + `claim_token`), `tickets` (bloqueo del QR), `notification_outbox` |
| **Devuelve** | `{ transferId, eventTitle, receiverEmail }` o `{ error, code }` |

Antes del RPC hay una política evaluada en TypeScript:

```ts
// app/actions/transfer.ts (65–91)
async function assertTicketTransferPolicy(supabase, ticketId) {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("transfer_count, max_transfers_allowed, seating_unit_id, tier_id, event_id")
    .eq("id", ticketId)
    .maybeSingle()

  if (!ticket) return null

  const startsAt = await resolveTicketEventStartsAt(supabase, ticket)
  const decision = evaluateTransferPolicy({
    transferCount: ticket.transfer_count,
    maxTransfersAllowed: ticket.max_transfers_allowed,
    eventStartsAt: startsAt,
  })
  if (!decision.ok) return { success: false, error: decision.error, code: decision.code }
  return null
}
```

Dos límites antirreventa: un tope de transferencias por entrada, y una ventana que se cierra antes
de que empiece el evento. Es prefiltro para dar mensajes claros; el RPC vuelve a validar.

El consentimiento legal se versiona: se pasa `TICKET_TRANSFER_RESALE_TERMS_VERSION` al RPC, que lo
persiste. Sin `termsAccepted` la acción corta antes de tocar la base.

La notificación es *fire-and-forget* con log de error, y el enlace de reclamo se adjunta al outbox
para que el mail lo lleve:

```ts
void attachTransferClaimUrl(row.transfer_id, claimUrl).catch((notifyError) => {
  logger.error({ context: "transfer", message: "outbox_claim_url_failed", error: notifyError })
})
scheduleNotificationOutboxDrain()
```

### 3.3 Reclamar: `claimTicketTransferAction`

Es la acción que el usuario pidió documentar por nombre (`claimTicket`). Su nombre real es
`claimTicketTransferAction`.

| Aspecto | Detalle |
| --- | --- |
| **Recibe** | `token: string` — el `claim_token` de la URL `/claim/[token]` |
| **Autoriza** | `getUser()`; sin sesión devuelve `loginUrl` con `next` al mismo claim |
| **Muta** | RPC `claim_ticket_transfer_by_token` → `tickets.user_id` (nuevo dueño), `tickets.transfer_count++`, `totp_secret` rotado, `ticket_transfers.status` → `claimed` |
| **Devuelve** | `{ ticketId, eventTitle }` o `{ error, loginUrl? }` |

Todo el trabajo transaccional está en el RPC. El aporte de TypeScript es traducir siete errores a
mensajes que el usuario entienda:

| Error SQL | Mensaje |
| --- | --- |
| `AUTH_REQUIRED` | `Iniciá sesión para reclamar esta entrada.` (+ `loginUrl`) |
| `EMAIL_MISMATCH` | `Esta entrada fue enviada a otro email. Ingresá con la cuenta destinataria.` |
| `TRANSFER_EXPIRED` | `Este enlace venció. Pedile que te reenvíe la entrada.` |
| `TRANSFER_CANCELLED` | `El envío fue cancelado por quien te la transfirió.` |
| `TRANSFER_NOT_FOUND` / `INVALID_CLAIM_TOKEN` | `Este enlace es inválido o ya no está disponible.` |
| `MAX_TICKETS_PER_USER` | `Alcanzaste el máximo de entradas para este evento.` |
| `TICKET_ALREADY_ADMITTED` | `Esta entrada ya fue usada y no se puede transferir.` |

`MAX_TICKETS_PER_USER` lleva un comentario que documenta una decisión de producto:

```ts
// P208: SQL only raises this for real tickets on published events.
```

El tope antiacaparamiento **no aplica a tickets de prueba**, así que un organizador probando su
propio evento no se choca contra su propio límite. Es el mismo criterio de aislamiento que describe
[`PAYMENTS.md`](./PAYMENTS.md) en la sección de sandbox.

Vale notar que `peekTicketTransferClaimAction` existe para previsualizar antes de reclamar: devuelve
el evento, el flyer, `emailMatches` y `alreadyOwner`. Así la página `/claim/[token]` puede decirle al
usuario "esto es para otra cuenta" **antes** de que apriete el botón.

### 3.4 El resto de la familia

| Acción | Recibe | Muta |
| --- | --- | --- |
| `startTicketShareTransferAction` | `ticketId`, `{ termsAccepted }` | RPC `initiate_ticket_share_transfer` → `ticket_transfers` sin email destinatario; devuelve `claimUrl` para compartir por WhatsApp |
| `cancelTicketTransferAction` | `transferId` | RPC `cancel_ticket_transfer` → `ticket_transfers.status`, desbloquea el QR |
| `peekTicketTransferClaimAction` | `token` | Nada (lectura) |
| `claimPendingTransfersAction` | — | RPC `claim_pending_ticket_transfers` → asigna transferencias pendientes al email del usuario actual (modelo legado / reventa) |

Las seis acciones comparten `mapTransferError` (doce casos) y `revalidateWalletPaths()`, que refresca
`/cuenta/entradas`, `/profile/tickets`, `/cuenta`, `/claim` y —lo importante— **`/admin/scanner`**:
la puerta tiene que ver el cambio de dueño de inmediato.

---

## 4. Guardado del mapa

**`saveVenueMapOnly`** — `app/actions/events.ts:1437`

Guardar un mapa no es guardar un JSON. Es reconciliar geometría con inventario vendible, y hacerlo
sin romper entradas ya vendidas.

### 4.1 Qué recibe

```ts
export async function saveVenueMapOnly(
  eventId: string,
  venueMapData: unknown,             // el mapa crudo del editor
  expectedUpdatedAt?: string | null, // token de concurrencia optimista
): Promise<{ success: true; updatedAt: string } | { success: false; error: string }>
```

El tercer parámetro es lo que hace segura la edición concurrente: el editor manda el `updated_at`
que leyó al abrir, y el guardado falla si alguien más escribió en el medio.

### 4.2 Autorización, con dos clientes distintos

```ts
const isSuperAdmin = isPlatformOwnerRole(profile?.role)
const reader = isSuperAdmin ? createAdminClient() : supabase
...
if (!isSuperAdmin) {
  const isApprovedOrganizer =
    profile?.role === "admin" && profile.organizer_approval_status === "approved"
  if (!isApprovedOrganizer) {
    return { success: false, error: "Tu cuenta de organizador no está habilitada para editar eventos." }
  }
  if (event.organizer_id !== userId) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }
}
```

No alcanza con ser `admin`: hay que ser organizador **aprobado** y dueño del evento. Y elige el
cliente según quién sea, tanto para leer (`reader`) como para escribir:

```ts
const mutationClient = event.organizer_id !== userId ? createAdminClient() : supabase
```

Un super admin editando el mapa de otra productora escribe con `service_role`, porque RLS —
correctamente — no lo dejaría.

### 4.3 Concurrencia optimista

```ts
const currentUpdatedAt = typeof event.updated_at === "string" ? event.updated_at : null
if (
  expectedUpdatedAt?.trim() &&
  currentUpdatedAt &&
  !eventTimestampsMatch(expectedUpdatedAt, currentUpdatedAt)
) {
  return { success: false, error: VENUE_MAP_STALE_WRITE_ERROR }
}
const casUpdatedAt = expectedUpdatedAt?.trim() || currentUpdatedAt
```

Y el `UPDATE` lleva el compare-and-swap en el `WHERE`:

```ts
await mutationClient
  .from("events")
  .update(mapPatch as never)
  .eq("id", id)
  .eq("updated_at", casUpdatedAt)   // ← CAS
  .select("id, updated_at")
  .maybeSingle()
```

Doble red: se compara antes (para dar el mensaje bueno) y se vuelve a comparar en el `WHERE` (para
que sea atómico). Si el `UPDATE` no devuelve fila, `!written.data?.id` produce el mismo error de
escritura obsoleta. Dos pestañas abiertas no pueden pisarse.

### 4.4 La guarda de inmutabilidad

Antes de escribir nada:

```ts
const locked = await assertDraftMapLayoutImmutable({
  eventId: id,
  draft: draftLayoutSourceFromSavedVenueMap({ map: parsedMap, scheduleDayIds }),
})
if (!locked.ok) {
  return { success: false, error: locked.error }
}
```

Si hay unidades vendidas o reservadas, holds vivos o tickets activos, **el layout no se puede
mover**. Es el guardián server-side del bloqueo que el editor ya muestra en la UI: el cliente
deshabilita los controles, pero la verdad se impone acá. El mecanismo completo está en
[`MAP_BUILDER.md`](./MAP_BUILDER.md).

### 4.5 Qué muta: siete escrituras en cadena

Esta acción es la más ancha del repositorio en cantidad de tablas tocadas.

| Orden | Operación | Tabla / efecto |
| --- | --- | --- |
| 1 | `UPDATE events` con CAS | `events.venue_map`, `has_seating_plan`, `updated_at` |
| 2 | `UPDATE venues` (si hay `venue_id` y una sola jornada) | `venues.venue_map`, `venues.seating_layout` |
| 3 | `hardReplacePublishedSeatingMaps` | `seating_maps` — reemplazo total |
| 4 | `syncMapBackedTiersAfterMapSave` | `ticket_tiers` — repara tiers respaldados por el mapa |
| 5 | `materializeEventSeatingUnits` | `event_seating_units` — materializa lugares |
| 6 | `reconcileMapSeatingUnitsAfterSave` (**con `createAdminClient()`**) | `event_seating_units` — upsert, resolución de tier, huérfanos |
| 7 | `syncTicketCapacityFromSeatingUnits` | `ticket_tiers.capacity` — aforo derivado de los lugares reales |

Cada paso corta la cadena si falla (`if (error) return { success: false, error }`). El paso 6 fuerza
`createAdminClient()` porque la reconciliación toca filas de inventario que RLS no expone al
organizador.

**Lo que no hay: transacción.** Los siete pasos son llamadas separadas al cliente de Supabase. Si el
paso 5 falla, los pasos 1 a 4 ya están commiteados. Ver [8.1](#81-el-guardado-del-mapa-no-es-atómico).

### 4.6 Tolerancia de esquema

```ts
if (written.error && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(written.error.message)) {
  // reintenta el UPDATE sin has_seating_plan
}
```

Si la columna `has_seating_plan` no existe todavía (deploy adelantado a su migración), reintenta con
el patch mínimo. Es el mismo patrón defensivo que usa el cron de expiración descrito en
[`PAYMENTS.md`](./PAYMENTS.md).

---

## 5. Otras mutaciones críticas

Más allá de las tres anteriores, estas son las acciones donde un bug cuesta dinero, deja entrar a
alguien gratis o abre un agujero de seguridad.

| Acción | Archivo | Recibe | Muta | Por qué es crítica |
| --- | --- | --- | --- | --- |
| `createPosSale` | `pos.ts` | `PosSaleRequest` (Zod) | RPC `process_pos_checkout_tx` → `orders`, `tickets`, stock de tier | Venta en efectivo en la puerta: emite admisión y descuenta aforo en un paso |
| `voidPosOrder` | `pos.ts` | `orderId` + auth de supervisor | RPC `void_pos_order` | Revierte una venta; un bug desincroniza caja e inventario |
| `issueComplimentaryNamed` / `issueComplimentaryBatch` | `complimentary.ts` | `eventId`, `tierId`, invitados o cantidad | RPC `issue_complimentary_batch_tx` → `orders`, `tickets` | Acuña entradas a costo cero sin pasar por checkout |
| `approveEventForPublication` | `event-audit.ts` | `eventId` | `events.status` → `published`, materialización de asientos, `reset_event_test_inventory` | La compuerta entre borrador y venta real; también purga el inventario de prueba |
| `executeMassEventRefund` | `superadmin-refunds.ts` | `eventId`, motivo (**+ AAL2**) | API de MP, `apply_order_refund_state`, `events`, `platform_ops_audit` | Movimiento masivo de dinero e invalidación masiva de entradas |
| `voidPlatformOrder` | `superadmin-orders.ts` | `orderId` | `apply_order_refund_state` | Interruptor de emergencia sobre una orden, sin llamar a la pasarela |
| `registerPublicGuest` / `claimFreePass` | `guest-lists.ts` | Datos del invitado / `entryId` | RPCs `register_guest_list_entry`, `claim_guest_list_entry` | Camino **público** a una admisión gratuita |
| `startResaleCheckoutAction` | `resale.ts` | `listingId` | `reserve_resale_listing`, preferencia MP, cadena de custodia | Mercado secundario: dinero y titularidad de la entrada |
| `redeemItemRPC` | `addons.ts` | Token del QR | RPC `redeem_item` | Canje en barra; un doble canje es producto perdido |
| `redeemDoorAccessPin` | `door-access.ts` | PIN de 6 dígitos | Fila del PIN + cookie de sesión de puerta | Otorga acceso al escáner **sin cuenta** |
| `cancelTicketAdmin` | `issued-tickets.ts` | `ticketId`, motivo | `tickets.status`, `totp_secret` a valor muerto | Invalidación manual de QR |
| `submitWithdrawalRequest` | `withdrawal.ts` | `orderId` + email | Reembolso MP, estado de la orden | Derecho de arrepentimiento: camino **sin login** |
| `createPrintBatch` | `print-studio-core.ts` | Config del lote | RPC de lote, `tickets`, `ticket_print_batches` | Emisión de entradas físicas |
| `approveEventPayout` | `event-payouts.ts` | `payoutId` | `event_payouts` | Libera plata al organizador |

### 5.1 Las cinco mutaciones sin autenticación

Son deliberadas, y conviene tenerlas identificadas porque su superficie de ataque es distinta:

| Acción | Qué la protege en lugar del login |
| --- | --- |
| `recordEventStorefrontView` | Nada: contador público vía RPC admin |
| `registerPublicGuest` | `assertGuestListRateLimit` + validación del RPC |
| `trackReferralVisit` | Deduplicación por clave de visitante hasheada |
| `submitWithdrawalRequest` | `orderId` + email como prueba de posesión, más rate limit |
| `redeemDoorAccessPin` | PIN de un uso + rate limit por IP |

---

## 6. Route handlers vs Server Actions

Las mutaciones son Server Actions salvo cuando hace falta algo que un action no puede dar. Los
cuatro motivos legítimos que aparecen en el código:

1. **Llamador externo** — webhooks de pasarelas y crons de Vercel: no hay sesión ni token de action.
2. **Control del HTTP** — códigos de estado propios, `Set-Cookie`, redirecciones, respuestas binarias.
3. **Cliente offline / PWA** — el service worker hace `fetch`, no invoca Server Actions.
4. **Secreto compartido** — autenticación server-to-server por header.

| Ruta | Método | ¿Muta? | Por qué es ruta y no action |
| --- | --- | --- | --- |
| `api/scanner/scan` | POST | **Sí** | El escáner PWA necesita `fetch` y códigos HTTP propios |
| `api/scanner/setup` | GET | No | Bootstrap del escáner para el service worker |
| `api/scanner/gates` | GET | No | Lista de gateras por query param |
| `api/scanner/blacklist` | GET | No | Sincroniza IDs cancelados para la denylist offline |
| `api/guest-access` | GET | **Sí** | Aterrizaje de enlace mágico: canjea el token y responde `Set-Cookie` + redirect |
| `api/send-tickets` | POST | Efecto | Server-to-server con `CHECKOUT_FULFILLMENT_SECRET` |
| `api/boost/checkout` | POST | **Sí** | Crea suscripción + preferencia MP y devuelve `initPoint` |
| `api/webhooks/mercadopago` | POST, GET | **Sí** | Callback externo con validación de firma |
| `api/webhooks/mercadopago-booster` | POST | **Sí** | Webhook de boosts |
| `api/webhooks/payway`, `api/webhooks/naranjax` | POST | **Sí** | PSPs secundarios |
| `api/cron/expire-orders` | GET, POST | **Sí** | Cron con `CRON_SECRET` |
| `api/cron/process-webhooks` | GET, POST | **Sí** | Drena la cola de webhooks |
| `api/cron/process-notifications` | GET, POST | **Sí** | Drena el outbox de notificaciones |
| `api/queue/status`, `api/queue-status` | GET | Cookies | Edge runtime; la admisión a la sala de espera escribe cookies |
| `api/tickets/[id]/pdf` | GET | No | Stream binario |
| `api/tickets/[id]/apple-pass` | GET | No | Descarga `.pkpass` |
| `api/tickets/[id]/google-wallet` | GET | No | Redirección con JWT de Wallet |
| `api/health` | GET | No | Liveness |
| `api/spotify/search`, `api/proxy-image`, `api/story-image`, `api/map-tiles/**` | GET | No | Proxies y render de imágenes |

### 6.1 El caso ejemplar: `api/scanner/scan`

Es la ruta que mejor muestra el criterio, porque **no reimplementa nada**:

```ts
// app/api/scanner/scan/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BodySchema = z.object({
  payload: z.string().trim().min(1),
  eventId: z.string().uuid(),
  gateId: z.string().trim().min(1).max(200).optional().nullable(),
})

export async function POST(request: Request) {
  // ... parse + safeParse, 400 si falla
  const result = await scanAndValidateTicket(
    parsed.data.payload,
    parsed.data.eventId,
    parsed.data.gateId,
  )
  return NextResponse.json(result, {
    status: scanReplayHttpStatus(result),
    headers: NO_STORE_HEADERS,
  })
}
```

Valida el body con Zod, **delega en la Server Action**, y traduce el resultado a un código HTTP con
`scanReplayHttpStatus`. La lógica de negocio no está duplicada: la ruta es transporte. Las cuatro
directivas de arriba garantizan cero caché, que en un escáner es un requisito de corrección, no una
optimización.

---

## 7. Inventario por dominio

Los 64 archivos, agrupados. Los marcados como *lectura* exportan principalmente getters.

### A. Catálogo, eventos y venues (18 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `events-v2.ts` | `saveEventDraftV2`, `publishEventV2`, `updateEventAbsorbFees` | `events`, tablas de borrador, storage |
| `events.ts` | `publishEvent`, `saveVenueMapOnly`, `materializeEventSeatingUnits`, `purgeVenueMapEditorTestPurchases` | `events`, `ticket_tiers`, `event_seating_units` |
| `event-audit.ts` | `approveEventForPublication`, `requestEventRevision`, `rejectEventForPublication` | `events`, `reset_event_test_inventory` |
| `venues.ts` | `upsertVenue`, `createVenue`, `setVenueArchived`, `deleteVenue` | `venues`, `seating_maps` |
| `artists.ts` | `createArtist`, `addArtistToLineup`, `persistEventLineupSnapshot` | `artists`, tablas de lineup |
| `agenda.ts` | CRUD de bloques y participantes | `agenda_blocks`, `agenda_participants` |
| `ticket-bundles.ts` | `upsertTicketBundle`, `deleteTicketBundle` | `ticket_bundles`, tiers |
| `categories.ts` | CRUD de categorías | `event_categories` |
| `event-multimedia.ts` | Galería e imágenes sociales | `events`, storage |
| `event-marketing.ts` | `updateEventMarketingSettings` | Columnas de marketing |
| `event-purchase-limits.ts` | `updateEventPurchaseLimits` | `events` |
| `event-sponsors.ts` | CRUD de sponsors | `event_sponsors` |
| `event-storefront-views.ts` | `recordEventStorefrontView` | RPC `increment_event_storefront_views` |
| `event-draft-v2.ts` | `createEventDraftV2` | `events` (borrador) |
| `venue-templates.ts` | Plantillas del organizador | Tablas de plantilla |
| `waiting-room.ts` | `releaseWaitingRoomPass` | Sólo cookies |
| `public-events.ts`, `public-story.ts` | *lectura* | — |

### B. Ventas, checkout, POS y promociones (11 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `checkout.ts` | **Fachada** (≈1.460 líneas, 13 acciones). No ejecuta lógica de negocio: valida el pedido y delega en el orquestador `lib/modules/checkout/services/checkout.service.ts` | Ver [`PAYMENTS.md`](./PAYMENTS.md) |
| `payments.ts` | `createPaymentPreference` | Ver [`PAYMENTS.md`](./PAYMENTS.md) |
| `pos.ts` | `createPosSale`, `voidPosOrder`, turnos, PINs | `process_pos_checkout_tx`, `cashier_shifts` |
| `resale.ts` | `createResaleListingAction`, `startResaleCheckoutAction` | `ticket_resale_listings`, `reserve_resale_listing` |
| `addons.ts` | `createEventItem`, `startStoreCheckout`, `redeemItemRPC` | `event_items`, `create_store_order_tx`, `redeem_item` |
| `coupons.ts` | `createPromoCode`, `updatePromoCode`, `validatePromoCode` | `promo_codes` |
| `guest-checkout-session.ts` | Bootstrap de sesión de invitado | Cookies de checkout |
| `checkout-fulfillment.ts`, `buyer-orders.ts`, `public-search.ts` | *lectura* | — |

### C. Billetera, entradas y acceso de invitados (8 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `transfer.ts` | Las seis acciones de transferencia | `ticket_transfers`, `tickets` |
| `issued-tickets.ts` | `cancelTicketAdmin`, `reassignTicketAdmin`, `updateTicketHolderAdmin` | `tickets` + auditoría |
| `complimentary.ts` | `issueComplimentaryNamed`, `issueComplimentaryBatch` | `issue_complimentary_batch_tx` |
| `guest-lists.ts` | `createGuestList`, `addGuestsToList`, `registerPublicGuest`, `claimFreePass` | `guest_lists`, `guest_list_entries` |
| `guest-ticket-access.ts` | `issueGuestReceiptAccess`, `claimGuestMagicLink`, OTP | Tokens de invitado, `orders` |
| `favorites.ts` | `toggleFavoriteEvent` | `event_favorites` |
| `tickets.ts`, `buyer-notifications.ts` | *lectura* | — |

### D. Staff, puerta y operación en vivo (7 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `scanner.ts` | `scanAndValidateTicket`, `syncOfflineScansBatch` | `tickets`, `guest_list_entries` |
| `event-staff.ts` | `assignEventStaff`, `revokeEventStaff`, `setCashierPosSecurityPin` | `event_staff_assignments` |
| `door-access.ts` | `generateEventDoorAccessPin`, `redeemDoorAccessPin` | `event_door_access_pins`, cookie |
| `print-studio-core.ts` | `createPrintBatch`, plantillas | `ticket_print_batches`, `tickets` |
| `live-ops.ts`, `control-tower.ts`, `dashboard.ts` | *lectura* | — |

### E. Finanzas, pagos a organizadores y promotores (6 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `finances.ts` | `requestPayout`, `requestSettlement` | `request_organizer_payout` |
| `payouts.ts` | `completePayoutRequest`, `rejectPayoutRequest` | `payout_requests` |
| `event-payouts.ts` | `approveEventPayout`, `holdEventPayout` | `event_payouts` |
| `withdrawal.ts` | `submitWithdrawalRequest` | `orders`, reembolso MP |
| `organizer-bank.ts` | Datos bancarios y KYB | `organizer_profiles` |
| `promoters.ts` | `createPromoter`, `settlePromoterCommissions`, `trackReferralVisit` | `promoters`, comisiones |

### F. Plataforma y superadmin (8 archivos)

| Archivo | Mutaciones clave | Tablas / RPCs |
| --- | --- | --- |
| `superadmin.ts` | `completeSettlement`, `updateOrganizerFeeRate`, `updateOrganizerApprovalStatus`, `updateUserRole` | `profiles`, settlements |
| `superadmin-refunds.ts` | `executeMassEventRefund` | API MP, `apply_order_refund_state`, `platform_ops_audit` |
| `superadmin-orders.ts` | `voidPlatformOrder`, `resendPlatformOrderTickets` | `apply_order_refund_state` |
| `organizer-kyb.ts` | `approveOrganizerApplication`, `rejectOrganizerApplication` | Tablas KYB, `profiles` |
| `platform.ts` | `updateUserRole` | `profiles` |
| `platform-settings.ts` | `updatePlatformResaleFeePercentage` | Ajustes de plataforma |
| `platform-sponsors.ts` | CRUD de sponsors | `platform_sponsors`, storage |
| `organizer-leads.ts` | `submitOrganizerLead` | `organizer_leads` |

### G. Identidad y cuenta (2 archivos)

| Archivo | Mutaciones clave | Tablas |
| --- | --- | --- |
| `auth.ts` | Login, OTP, OAuth, `signOut`, vinculación de dispositivo | Supabase Auth, `profiles` |
| `account.ts` | `updateMyAccountProfile`, `uploadMyAvatar`, `deleteAccount` | `profiles`, storage |

Ver [`AUTH.md`](./AUTH.md).

### H. Soporte, contenido y marketing (5 archivos)

| Archivo | Mutaciones clave | Tablas |
| --- | --- | --- |
| `support.ts` | `sendSupportMessage`, `startHumanSupportChat`, cancelaciones | Hilos y mensajes de soporte |
| `support-faqs.ts` | CRUD y reordenamiento de FAQs | `support_faqs` |
| `organizer-profile.ts` | Perfil público | `profiles` |
| `producer-follows.ts` | `toggleFollowProducer` | Tabla de follows |
| `event-dashboard-metrics.ts` | *lectura* | — |

---

## 8. Deuda y riesgos verificados

### 8.1 El guardado del mapa no es atómico

`saveVenueMapOnly` ejecuta siete escrituras en secuencia sin transacción. Si
`materializeEventSeatingUnits` (paso 5) falla, `events.venue_map`, `venues`, `seating_maps` y
`ticket_tiers` ya están commiteados. La acción devuelve error y el usuario ve "no se guardó", pero
parte sí se guardó. El editor recarga desde la base, así que el estado visible es consistente con lo
persistido; lo que puede quedar inconsistente es el inventario respecto del mapa hasta el siguiente
guardado exitoso.

### 8.2 `requireSuperAdmin` duplicado ocho veces, con deriva

Cada copia difiere: `superadmin.ts` lanza `SuperAdminForbiddenError` y devuelve
`{ admin, actorId }`; `event-audit.ts` lanza un `Error` pelado; `platform-sponsors.ts` devuelve el
cliente con RLS en lugar del admin. Un endurecimiento del chequeo hay que aplicarlo ocho veces y es
fácil olvidarse de una.

### 8.3 `ActionResult` existe y nadie lo usa

`lib/action-result.ts` define el contrato y los helpers `ok()`/`fail()`, y **cero archivos de
`app/actions/` lo importan**. Unos 30 redeclaran el tipo localmente. Cualquiera que lea el archivo
del contrato va a asumir que es el que rige; en realidad es aspiracional.

### 8.4 AAL2 sólo en una acción destructiva

`executeMassEventRefund` exige segundo factor. `voidPlatformOrder`, `approveEventPayout`,
`completeSettlement` y `updateUserRole` no. Son todas operaciones de superadmin con impacto
comparable (dinero o privilegios).

### 8.5 Huecos de revalidación verificados

| Acción | Qué no revalida |
| --- | --- |
| `submitWithdrawalRequest` | Nada, después de un reembolso real |
| `claimFreePass` | Sólo `/cuenta/entradas`, no las vistas de lista del organizador |
| `trackReferralVisit` | Nada (aceptable: es analítica) |

### 8.6 `registerPublicGuest` escribe `promoter_id` sin verificar propiedad

Después del RPC, si `guest_lists.promoter_id` está en `null`, lo setea. No valida que quien llama sea
dueño de ese promotor. El riesgo es bajo porque sólo escribe cuando el campo está vacío, pero es una
escritura sin autorización en un camino público.

### 8.7 Cliente admin después de autorización manual

`cancelTicketAdmin` (`issued-tickets.ts`) usa `createAdminClient()` después de
`assertEventOpsAccess`. Está justificado —hay que invalidar el `totp_secret`, que RLS no permite—
pero la escritura queda fuera de RLS y la única defensa es el chequeo de TypeScript. El patrón se
repite en varios de los 45 archivos que importan el cliente admin: **cada uno de esos call sites es
un lugar donde un `return` olvidado se convierte en un agujero**.

### 8.8 Formas de retorno distintas en el borde HTTP

La ruta del escáner devuelve `{ success, status, message }`; las acciones devuelven
`{ success, error }` o `{ success, data }`; `auth.ts` devuelve `{ error, success }` donde `success`
es un string de mensaje, no un booleano. Un cliente que consuma las tres necesita tres
interpretaciones.

### 8.9 `organizerTableClient` depende de disciplina del llamador

El helper usa el cliente admin para leer y su propio comentario advierte que las consultas **deben**
filtrar por IDs ya autorizados. No hay nada que lo imponga: un nuevo call site que se olvide del
filtro lee datos de todas las productoras.

---

## Documentos relacionados

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — patrones y defensa en profundidad
- [`PAYMENTS.md`](./PAYMENTS.md) — checkout, webhooks y emisión de entradas
- [`WALLET_SECURITY.md`](./WALLET_SECURITY.md) — criptografía del QR vivo que valida el escáner
- [`MAP_BUILDER.md`](./MAP_BUILDER.md) — el editor detrás de `saveVenueMapOnly`
- [`DB_SCHEMA.md`](./DB_SCHEMA.md) — RLS y RPCs transaccionales
- [`AUTH.md`](./AUTH.md) — identidad, sesiones y control de acceso por rol
