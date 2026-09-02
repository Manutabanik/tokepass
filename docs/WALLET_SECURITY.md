# Billetera Digital — Arquitectura y seguridad

Documento técnico de la billetera de TokePass: cómo se organizan los pases en pantalla, cómo
se gestionan los extras consumibles y cómo funciona criptográficamente el **Living QR** de
15 segundos, tanto para acceso en puerta como para canje en barra.

## Archivos del sistema

| Archivo | Rol |
| --- | --- |
| `components/public/ticket-wallet.tsx` | Shell de la billetera: pestañas, acordeón por evento, agrupación por compra |
| `lib/ticket-wallet.ts` | Motor de agrupación Padre/Hijo y generación de etiquetas |
| `components/account/wallet-access-block.tsx` | Tarjeta Padre (mesa / combo) con panel de Hijos |
| `components/account/wallet-pass-card.tsx` | Tarjeta Hijo (pase individual) con acciones |
| `components/account/wallet-extras-group.tsx` | Normalización y bundling de extras |
| `lib/tickets/wallet-extras.ts` | Clasificación y agrupación de consumibles |
| `lib/totp-offline.ts` | **Criptografía del Living QR**: HMAC, ventanas, verificación |
| `lib/scan-payload.ts` | Decodificación y resolución de payloads en el escáner |
| `components/public/living-ticket-qr.tsx` | Renderer del Living QR de acceso |
| `components/public/living-store-qr.tsx` | Renderer del Living QR de canje |
| `components/public/static-signed-qr.tsx` | Renderer del QR estático firmado (papel / wallet) |
| `components/public/qr-scan-lightbox.tsx` | Lightbox a pantalla completa que despacha los tres renderers |
| `lib/store/living-store-payload.ts` | Codec del payload de canje |
| `lib/tickets/static-tps-policy.ts` | Política de cuándo se acepta un QR estático |
| `lib/scanner/admission-lease.ts` | Anti-duplicado offline en puerta |
| `app/actions/scanner.ts` | Verificación de admisión en servidor |
| `app/actions/addons.ts` | `redeemItemRPC`: verificación y canje de extras |
| `components/admin/bar-scanner.tsx` | Escáner de barra (`/admin/store-scanner`) |

---

## 1. Jerarquía de la interfaz

La billetera tiene **cinco niveles** de anidamiento, y cada uno responde a una pregunta
distinta del usuario:

```
Pestaña            ¿Entradas, Extras o Pasados?
└─ Evento          ¿A qué fiesta voy?              (acordeón, abierto por defecto)
   └─ Compra       ¿Cuál de mis compras es esta?   (orden, con código TP-XXXXXXXX)
      └─ Bloque    ¿Qué mesa / combo es?           ← PADRE
         └─ Pase   ¿Qué silla es la mía?           ← HIJO (QR individual)
```

`groupWalletTicketsByEventOrders()` construye los tres primeros niveles y
`groupWalletAccessBlocks()` los dos últimos. La separación importa: un usuario que compró
dos mesas para el mismo evento en dos momentos distintos ve dos compras, cada una con su
mesa, en lugar de una lista plana de doce sillas.

### 1.1 Orden de las agrupaciones

- **Eventos**: por `eventDate` ascendente — lo que pasa antes va primero.
- **Compras**: por `purchasedAt` **descendente** — la compra más reciente arriba.
- **Pases dentro de una compra**: por `createdAt`, con desempate por `id`.
- **Bloques**: alfabético por título (`localeCompare` con locale `es`).

El `purchasedAt` de una compra se calcula con `earliestTimestamp()`, que prefiere
`orderCreatedAt` y solo cae a `createdAt` del ticket si ningún ticket del grupo tiene fecha
de orden. Así los tickets emitidos más tarde (por ejemplo, una transferencia recibida) no
mueven la compra de lugar.

---

## 2. Estructura Padre/Hijo para mesas agrupadas

El problema: una mesa de 10 personas son **10 tickets** en la base de datos, pero **una sola
cosa** en la cabeza del comprador. Mostrar diez tarjetas iguales es ruido; mostrar una sola
impide que cada invitado tenga su QR.

La solución es un bloque **Padre** colapsable que contiene los **Hijos**.

### 2.1 Cómo se decide qué tickets forman un bloque

`walletAccessBlockKey()` genera la clave de agrupación con una cascada de precedencia, de lo
más explícito a lo más inferido:

```ts
// lib/ticket-wallet.ts
export function walletAccessBlockKey(ticket: WalletBlockableTicket): string {
  const groupId = ticket.groupId?.trim()
  if (groupId) return `gid:${groupId}`
  // ...
}
```

| Prioridad | Condición | Clave | Caso real |
| --- | --- | --- | --- |
| 1 | `groupId` presente | `gid:<groupId>` | Grupo asignado por el backend al emitir |
| 2 | `seatingLayoutType === "table_combo"` | `table:<order>:<MESA>` | Mesa vendida como unidad cerrada |
| 3 | `numbered_seat` con fila | `row:<order>:<TIER>:<FILA>` | Butacas numeradas de la misma fila |
| 4 | `ticketType === "combo"`, `tierType === "bundle"` o `maxAdmissions > 1` | `combo:<order>:<TIER>` | Combo de varias admisiones |
| 5 | Fallback | `single:<ticketId>` | Entrada individual |

Dos detalles que evitan agrupaciones incorrectas:

- **La clave incluye el `orderId`** (niveles 2–4). Dos compradores distintos que reservaron
  la misma "Mesa 5" en compras separadas no se mezclan, aunque compartan etiqueta de mesa.
- **`isChairLikeLabel()` desambigua qué es la mesa y qué es la silla.** En `table_combo`,
  `seatingLabel` puede traer la silla y `seatingRowLabel` la mesa, o lo inverso, según cómo
  se dibujó el mapa:

  ```ts
  const tableId = isChairLikeLabel(place) ? row || place : place || row
  ```

  Si la etiqueta del lugar parece una silla (`Silla 3`, `Butaca 7`, o solo `12`), se usa la
  fila como identificador de la mesa. Sin esta inversión, cada silla generaría su propio
  bloque.

Las claves se normalizan con `toLocaleUpperCase("es-AR")` para que `Mesa vip` y `MESA VIP`
caigan en el mismo bloque.

### 2.2 Padre o Hijo suelto

`groupWalletAccessBlocks()` marca `kind: "group"` solo si el bucket quedó con más de un
ticket. Un bloque de un solo ticket se renderiza como `WalletPassCard` directamente, sin
envoltorio colapsable — no tiene sentido pedir "Ver el 1 lugar de esta mesa".

Los Hijos se ordenan por **`groupSlot`** antes que por fecha, porque el slot es la posición
real en la mesa: Silla 1, Silla 2, Silla 3 — no el orden en que se emitieron los tickets.

### 2.3 Conteo de accesos

```ts
export function walletAccessCount(tickets: WalletBlockableTicket[]): number {
  const fromTickets = tickets.length
  const fromAdmit = tickets.reduce(
    (max, ticket) => Math.max(max, Math.floor(ticket.maxAdmissions) || 1),
    1,
  )
  return Math.max(fromTickets, fromAdmit)
}
```

Se toma el **máximo** entre la cantidad de tickets y el mayor `maxAdmissions`. La razón es
que existen dos formas de vender N accesos: N tickets de 1 admisión (mesa numerada) o 1
ticket de N admisiones (combo). El máximo cubre ambas sin sumarlas por error.

### 2.4 Títulos: dos funciones, dos audiencias

**El Padre** usa `walletAccessBlockTitle()`, que compone `<tier> <ubicación> (<N> Accesos)`
resolviendo varios casos:

- Solo usa `seatingLabel` o `seatingRowLabel` si **todos** los tickets del bloque comparten
  el mismo valor (`sharedTicketText`). Si difieren, se omite: no se puede titular una mesa
  con la silla de uno de sus ocupantes.
- Si la etiqueta compartida parece una silla y hay más de un ticket, se descarta del título
  del Padre (`placeForParent`). El Padre es la mesa, no una silla.
- Detecta el prefijo `Mesa` y lo recompone para no duplicarlo
  (`"VIP Fila A - Mesa 5"`, no `"VIP Mesa Mesa 5"`).
- Evita repetir el tier dentro de la ubicación con `includesLoose()`.

**El Hijo** usa `walletChildPlaceLabel()`, que prioriza `groupSlot` (`Silla 4`), luego el
asiento exacto en butacas numeradas, luego la etiqueta si ya dice "silla/butaca/asiento", y
finalmente cae a `Silla <index + 1>`.

Al abrir el QR, `walletQrModalTitle()` produce el título más específico posible:
`"Mesa 03 - Lugar 5"` cuando hay mesa y slot.

### 2.5 Herencia de acciones

Las acciones **no** se duplican entre niveles:

| Acción | Padre | Hijo |
| --- | --- | --- |
| Mostrar QR | no | sí (uno por pase) |
| Vender bloque completo | sí (`canSell` propio) | no (`canSell={false}`) |
| Transferir a un amigo | no | sí |
| Recuperar transferencia | no | sí |

`WalletAccessBlockCard` pasa explícitamente `canSell={false}` a cada Hijo. Vender una silla
suelta de una mesa cerrada rompería la unidad comercial, así que la reventa vive solo en el
Padre, que publica todos los tickets elegibles en secuencia y aborta al primer error.

La elegibilidad para reventa exige seis condiciones (`sellableTickets`): estado `valid`,
precio mayor a cero, no ser de prueba, cero admisiones usadas, transferencias disponibles,
sin transferencia pendiente, estado visual `active` y estar online. El botón dice **"Vender
Mesa Completa"** o **"Vender combo"** según `seatingLayoutType`.

### 2.6 Animación del panel

El colapso usa `grid-template-rows: 0fr → 1fr` en lugar de `max-height`, lo que permite
animar hacia la altura real del contenido sin conocerla de antemano. El panel se anuncia con
`aria-expanded` y `aria-controls` sobre un `useId()`.

---

## 3. Gestión de extras

Los extras son consumibles: tragos, comida, merch, estacionamiento, upgrades. Se canjean en
barra o tienda, no en puerta.

### 3.1 Dos orígenes, un tipo unificado

Un extra puede llegar por dos caminos completamente distintos:

| Origen | Tipo | Identificador | QR | Escáner que lo consume |
| --- | --- | --- | --- | --- |
| Comprado en el checkout de la entrada | `MyTicket` con `ticketType`/`tierType` = extra | `ticket.id` | Living QR de **puerta** (`TP2.`) | `/admin/scanner` (admisión) |
| Comprado en la tienda del evento | `MyStoreRedemption` | `qrCodeToken` | Living QR de **tienda** (Base64) | `/admin/store-scanner` (`redeem_item`) |

`isWalletCheckoutExtra()` los separa del flujo de admisión usando
`resolveTicketCommerceType()`; `walletAdmissionTickets()` y `walletCheckoutExtras()` son los
dos filtros complementarios que impiden que un trago aparezca como entrada o al revés.

Ambos se normalizan a `WalletExtraDisplayUnit`, cuyo campo `qr` es una **unión
discriminada**:

```ts
qr:
  | { kind: "store"; token: string }
  | { kind: "door"; ticketId: string; totpSecret: string; isStatic: boolean }
```

Esa discriminante es lo que decide qué renderer se monta, y garantiza en tiempo de
compilación que un extra de tienda nunca reciba un `totpSecret` ni intente firmar un MAC.

> **Limitación conocida.** Los dos QR de extras se muestran con el mismo copy —
> *"Acercá este código al escáner de canje"* — pero **no** los lee el mismo escáner. El
> `bar_staff` solo tiene acceso a `/admin/store-scanner`
> (`BAR_STAFF_ROUTES` / `staffHomeForRoles`), que invoca `redeemItemRPC` →
> `decodeLivingStorePayload()`, y esa función **rechaza explícitamente los payloads `TP2.`**.
> Un extra comprado en el checkout presentado en barra devuelve `invalid_payload`; hay que
> consumirlo en el escáner de puerta, que lo procesa como admisión. Si se quiere unificar el
> canje en barra, la vía correcta es que `redeemItemRPC` detecte payloads de puerta y los
> derive a la ruta de admisión — no relajar el codec de tienda, que es lo que mantiene
> separados los dominios (§7.10).

### 3.2 Categorización heurística

Los extras comprados en el checkout no traen categoría, así que
`inferCheckoutExtraCategory()` la deduce del nombre con expresiones regulares acotadas por
límites de palabra:

```ts
if (/\b(cerveza|birra|trago|drink|copa|fernet|gin|vino|barra)\b/.test(value)) return "drinks"
```

Cubre `drinks`, `food`, `merch`, `parking`, `access_pass`, y cae a `upgrades`. Es
presentacional: solo elige el icono y la etiqueta de categoría, nunca afecta el canje.

### 3.3 Bundling por producto

`walletExtraBundleKey()` agrupa unidades **idénticas de la misma orden**:

```
`ord:${orderId}:${productKey}`     // productKey = "item:<id>" | "name:<nombre>" | "tier:<nombre>"
`unit:${id}`                        // sin orden → cada unidad es su propio bundle
```

Comprar tres cervezas produce un bundle `Cerveza (x3)` con tres unidades adentro. El
`productKey` cae a `name:` cuando falta el `itemId`, para agrupar productos migrados que
perdieron su id.

### 3.4 Un QR por unidad, nunca por bundle

Esta es la decisión de seguridad central de los extras. La UI del bundle es un **carrusel
con scroll-snap** donde cada unidad tiene su propio botón "Mostrar QR de canje", numerado
`Canje 1`, `Canje 2`, `Canje 3`.

El motivo: cada unidad se consume de forma independiente. Un QR compartido por las tres
cervezas obligaría al barman a llevar la cuenta de cuántas ya sirvió, y el estado de canje no
podría ser atómico. Con un token por unidad, el RPC `redeem_item` marca esa unidad y solo
esa.

Con `bundle.count === 1` se salta el carrusel y se renderiza `ExtraConsumableCard` directo.
El badge del header muestra `N listos` o `Entregados`, contando `ready` (estado `valid`), y
las unidades ya canjeadas muestran la fecha en lugar del botón.

### 3.5 Upsell contextual

La pestaña de extras calcula `eventsMissingExtras`: eventos con entrada activa pero sin
extras comprados. Para cada uno ofrece un `ExtrasUpsellCard` que ancla a la tienda del evento
si existe (`#extras-<eventId>`) o a la ficha del evento si no. El upsell se desactiva
completo cuando la billetera está `offline`, porque no se puede comprar sin conexión.

---

## 4. Living QR: funcionamiento criptográfico

### 4.1 Modelo de amenaza

El ataque que este sistema existe para bloquear: **el comprador saca una captura de pantalla
del QR y la manda por WhatsApp**. Con un QR estático, la captura entra igual que el
original. El primero que llegue pasa, y el legítimo se queda afuera discutiendo en la puerta.

Un segundo ataque, menos obvio pero más grave: si el QR contuviera el secreto del ticket,
cualquiera que viera la captura podría **generar QRs válidos indefinidamente**.

### 4.2 Formatos de payload

```
Living (anti-captura):   TP2.<ticketId>.<window>.<mac>
Estático firmado:        TPS.<ticketId>.<mac>
Legacy v1 (rechazado):   base64(<secret>-<window>)
Papel / POS crudo:       <secret hex ≥16 chars, sin puntos>
```

`lib/totp-offline.ts` documenta la invariante en su encabezado:

```ts
// lib/totp-offline.ts
/**
 * Firmas de puerta. El QR NUNCA embute totp_secret.
 *
 * Living (anti-captura): `TP2.<ticketId>.<window>.<mac>`
 *   MAC = HMAC-SHA256(totp_secret, ticketId:window), 32 hex (acepta 16 legacy).
 * Estatico (papel / wallet / POS): `TPS.<ticketId>.<mac32>`
 *   MAC = HMAC-SHA256(totp_secret, TPS:ticketId)
 *
 * No se usa un secreto global de servidor: iria en el manifiesto offline y
 * un telefono de puerta comprometido podria firmar cualquier ticket.
 */
```

El formato legacy v1 **sí** embutía el secreto en base64, y por eso hoy
`resolveScanSecret()` lo rechaza de plano (`if (living?.version === 1) return null`) en lugar
de intentar validarlo.

### 4.3 Por qué no hay un secreto global de servidor

Es la decisión menos obvia del diseño y está anotada en el código. Un HMAC con clave única
del servidor sería más simple, pero **la puerta funciona offline**: el manifiesto de tickets
se descarga al dispositivo del escáner. Si la firma dependiera de una clave global, esa clave
tendría que viajar en el manifiesto, y un teléfono de puerta robado o rooteado podría firmar
QRs válidos para **cualquier** ticket del evento.

Con una clave por ticket (`tickets.totp_secret`), comprometer un dispositivo expone
únicamente los tickets que ese dispositivo ya tenía descargados, y no permite fabricar
tickets nuevos.

### 4.4 Derivación de la ventana temporal

```ts
export const LIVING_QR_PERIOD_MS = 15_000
export const LIVING_QR_GRACE_BLOCKS = 1
export const LIVING_QR_MAX_LIFETIME_MS = LIVING_QR_PERIOD_MS * (1 + LIVING_QR_GRACE_BLOCKS)

export function getTotpWindow(nowMs = Date.now()): number {
  return Math.floor(nowMs / LIVING_QR_PERIOD_MS)
}
```

La ventana es simplemente el número de bloques de 15 s transcurridos desde la época Unix. No
hay estado compartido ni contador sincronizado: **cliente y escáner derivan el mismo número
del reloj**, que es lo que permite validar sin conexión.

La vida útil máxima de un QR en pantalla es de **30 segundos**: su propio bloque de 15 s más
un bloque de gracia. La gracia existe porque el usuario puede tardar en acercar el teléfono
al lector, o el lector puede estar unos segundos desalineado.

### 4.5 Cálculo y truncado del MAC

```ts
export async function livingQrMac(
  totpSecret: string,
  ticketId: string,
  windowIndex: number,
): Promise<string> {
  const secret = requireTotpSecret(totpSecret)
  const full = await hmacSha256Hex(secret, `${ticketId.trim()}:${windowIndex}`)
  return full.slice(0, LIVING_QR_MAC_HEX_LEN)   // 32 hex = 128 bits
}
```

- **El mensaje incluye el `ticketId`**, no solo la ventana. Un MAC no puede reutilizarse en
  otro ticket, aunque compartieran secreto.
- **Se trunca a 32 hex (128 bits)** de los 64 disponibles. Suficiente contra fuerza bruta y
  la mitad de datos en el QR, lo que mantiene los módulos grandes y legibles en pantallas
  chicas o sucias.
- `hmacSha256Hex()` usa **WebCrypto** (`crypto.subtle`) cuando está disponible y cae a
  `node:crypto` en runtimes sin `subtle`. Existe además una variante síncrona
  (`generateStaticQrPayloadSync`) porque el POS y la generación de passes de wallet corren en
  Node donde no se puede esperar una promesa.
- `requireTotpSecret()` lanza `MISSING_TOTP_SECRET_ERROR` en lugar de generar un QR inválido
  en silencio; la UI muestra ese texto literal en un `role="alert"`.

### 4.6 Verificación en el escáner

`verifyLivingQrMac()` aplica tres controles:

```ts
export async function verifyLivingQrMac(totpSecret, ticketId, windowIndex, mac) {
  const presented = mac.trim().toLowerCase()
  if (presented.length !== 32 && presented.length !== 16) return false
  const secret = (totpSecret ?? "").trim()
  if (!secret) return false
  const full = await hmacSha256Hex(secret, `${ticketId.trim()}:${windowIndex}`)
  return timingSafeEqualHex(full.slice(0, presented.length), presented)
}
```

1. **Longitud exacta**: 32 hex, o 16 para tickets legacy. Cualquier otra longitud se rechaza
   sin calcular nada.
2. **Recalcula el MAC** desde el secreto del ticket y la ventana **que el QR declara** — no
   la actual. La frescura se valida por separado (§4.7), lo que mantiene las dos
   responsabilidades independientes.
3. **Comparación en tiempo constante** con `timingSafeEqualHex()`, que acumula diferencias
   con XOR sobre todos los caracteres en lugar de cortar en el primer byte distinto. Evita
   que un atacante deduzca el MAC correcto midiendo tiempos de respuesta.

Nótese que se compara `full.slice(0, presented.length)`: el prefijo del MAC completo contra
lo presentado, lo que permite aceptar los 16 hex legacy sin ramas adicionales.

### 4.7 Validación de frescura y ventanas futuras

```ts
export function isLivingWindowAccepted(timestampBlock, currentBlock = getTotpWindow()) {
  return (
    Number.isInteger(timestampBlock) &&
    Math.abs(timestampBlock - currentBlock) <= LIVING_QR_GRACE_BLOCKS
  )
}
```

El **valor absoluto** es deliberado, y el comentario del código lo dice: *"Rechaza tanto
capturas vencidas como ventanas futuras manipuladas"*. Sin el `Math.abs`, alguien que
adelantara el reloj de su teléfono podría generar un QR con ventana futura y presentarlo más
tarde, cuando esa ventana sea la actual — un QR con vida útil arbitraria.

`resolveScanSecret()` marca el resultado con dos banderas separadas:

- `expired`: la ventana está fuera del rango aceptado.
- `enforceFreshness`: si corresponde exigir frescura. Es `true` **solo** para payloads `TP2`
  en eventos dinámicos. Un QR de papel de boletería no rota, así que exigirle frescura lo
  rechazaría siempre.

El escáner combina ambas con un refuerzo adicional:

```ts
// app/actions/scanner.ts
if (row.is_dynamic_qr !== false && resolved.enforceFreshness && resolved.expired) {
  return { success: false, status: "expired_qr", message: "QR Expirado (Captura de pantalla)" }
}
```

El mensaje nombra la causa probable, para que el staff en puerta sepa qué decirle a la
persona sin tener que interpretar un error técnico.

### 4.8 Alineación de reloj

Un QR que se valida contra el reloj del dispositivo hereda todos sus desajustes. El sistema
usa **tiempo del servidor** en los dos lados:

- **Servidor**: `readScannerServerTimeMs()` llama al RPC `scanner_server_time` y, si falla,
  cae al reloj del proceso (Vercel/Node, sincronizado por NTP) — explícitamente *"mejor que
  el reloj del celular"*.
- **Escáner offline**: al sincronizar guarda el desvío con
  `scannerClockOffsetFromSample()` → `deviceClockOffsetMs(server, device)`, y después
  calcula cada ventana con `serverAlignedNowMs(offset)`, que resta el desvío al reloj local.

Ambas funciones son puras y devuelven `0` / el valor local ante entradas no finitas, para que
un dato corrupto degrade a "usar reloj local" en lugar de romper el escaneo.

### 4.9 Renovación en el cliente

```tsx
// components/public/living-ticket-qr.tsx
const intervalId = window.setInterval(() => {
  const currentWindow = getTotpWindow()
  setProgress(getTotpWindowProgress())
  setRemainingSeconds(getTotpRemainingSeconds())

  if (currentWindow !== lastWindow) {
    lastWindow = currentWindow
    void refreshToken()
  }
}, 250)
```

El intervalo corre a **250 ms** pero el HMAC se recalcula **solo cuando cambia la ventana**.
Los ticks intermedios únicamente actualizan la barra de progreso y el contador. Sin esa
guarda se ejecutarían 60 operaciones criptográficas por ventana en lugar de una.

`getTotpRemainingSeconds()` aplica `Math.max(1, ...)`: el contador nunca muestra "0s", porque
mostrar cero mientras el QR todavía es válido confunde al usuario.

Refuerzos de la UI que acompañan a la criptografía:

- `onContextMenu` bloqueado y `select-none` para dificultar guardar la imagen.
- Barra de progreso con degradado y anillo pulsante: el usuario **ve** que el código está
  vivo.
- Aviso explícito: *"El código se actualiza automáticamente. Capturas de pantalla no
  válidas"*.
- Badge "Living QR" vs "QR estático" en el encabezado del lightbox, para que nadie confunda
  los dos modos.
- **Código de respaldo** (`ticketBackupCode`: 12 caracteres del UUID en mayúsculas) impreso
  bajo el QR, para búsqueda manual si la cámara falla.
- Nombre y DNI del titular debajo, y un banner rojo **"Modo prueba · sin validez"** cuando
  `isTest`.

### 4.10 Política del QR estático

El QR estático (`TPS.`) es necesario para papel, PDF, Apple Wallet y Google Wallet, donde no
hay JavaScript para rotar nada. Pero aceptarlo sin restricciones anularía el Living QR: el
usuario exportaría un pase estático y volvería a poder compartir capturas.

`lib/tickets/static-tps-policy.ts` resuelve la tensión con una regla única aplicada en los
dos extremos:

```ts
export function canExportStaticAdmissionArtifact(input: {
  qrType: QrType | null | undefined
  issuanceChannel: string | null | undefined
}): boolean {
  if (!isLivingQrEvent(input.qrType)) return true
  return isPaperStaticTpsChannel(input.issuanceChannel)
}
```

- Evento con `qr_type = "static"` → estático permitido siempre.
- Evento Living QR → estático permitido **solo** si el canal de emisión es papel: `pos`,
  `batch_print`, `complimentary` o `accreditation`.
- Compra `online` en evento Living QR → **prohibido**, tanto para exportar
  (`DigitalTicketStaticExportError`, HTTP 403) como para escanear en puerta.

`normalizeIssuanceChannel()` es **fail-closed**: cualquier canal desconocido se trata como
`online`, el caso más restrictivo. Y `ticketAllowsStaticAdmissionExport()` prefiere
`eventQrType` sobre `qrType`, con la advertencia explícita de *"no confiar en
`is_dynamic_qr`"* — la verdad está en la configuración del evento, no en un flag del ticket.

El renderer estático usa nivel de corrección de errores **H** (~30 % de recuperación) contra
**M** (~15 %) del Living QR: el papel se arruga, se moja y se dobla; una pantalla está limpia.

### 4.11 Defensas más allá de la criptografía

Un MAC válido y fresco prueba autenticidad, no unicidad. Las capas siguientes evitan el doble
ingreso:

- **Lease de admisión offline** (`lib/scanner/admission-lease.ts`): al admitir, el
  dispositivo persiste en IndexedDB un lease con hash
  `SHA-256(device_id|ticket_id|timestamp|admission_counter)`. Una relectura inmediata en el
  mismo dispositivo devuelve `duplicate` con razón `lease_exists`, sin esperar al servidor.
- **Partición por dispositivo**: `ticketDeviceSlot()` aplica un hash **FNV-1a** al `ticketId`
  y lo mapea a un slot (`hash % count`). Cada pistola atiende su rango, así que dos lectores
  desconectados no pueden admitir el mismo ticket. Un ticket fuera de rango devuelve
  `main_gate_review` en lugar de admitir o rechazar.
- **Tickets de grupo sin pares**: si el ticket es grupal, el dispositivo está offline, no hay
  peers por `BroadcastChannel` y hay más de una pistola configurada, la decisión es
  `main_gate_review`. Un ticket de N admisiones no puede repartirse entre lectores que no se
  ven entre sí.
- **Sin slot válido no se admite nada.** `readScannerDeviceSlot()` devuelve `null` si no hay
  setup persistido y **no inventa `count: 1`**; el borrador
  `SCANNER_DEVICE_SLOT_SETUP_DRAFT` está marcado como *"nunca usar como fallback de
  admisión"*.
- **Secretos de transferencia retirados**: `execute_safe_transfer` deja el secreto viejo con
  prefijo `xfer_dead_`. `isRetiredTransferSecret()` lo detecta y `resolveScanSecret()` corta
  antes de decodificar. El QR del dueño anterior deja de funcionar en el acto.
- **Vinculación de dispositivo**: la billetera ata la sesión a un `deviceId` vía la RPC
  `claim_active_wallet_device`; abrir las entradas en otro teléfono dispara
  `WalletDeviceMismatchLogout`.
- **Puerta de visibilidad del QR**: `canShowTicketQr()` exige entrega no-online, estado
  `valid`, estado visual `active` y `totpSecret` presente. Un ticket en reventa o
  transferencia pendiente no muestra código.

---

## 5. Living QR de canje en barras

El QR de barra rota también cada 15 segundos, pero su criptografía es **deliberadamente
distinta**.

### 5.1 El payload

```ts
// lib/store/living-store-payload.ts
export const STORE_QR_ROTATION_MS = 15_000
export const STORE_QR_GRACE_BLOCKS = 1

/** Living QR de tienda: Base64(`token-timestampBlock`). */
export function encodeLivingStorePayload(token: string, nowMs = Date.now()): string {
  const clean = token.trim()
  if (!clean) return ""
  return toBase64Utf8(`${clean}-${storeTimestampBlock(nowMs)}`)
}
```

**No hay HMAC.** El payload es el token de canje concatenado con el bloque temporal, en
Base64. La rotación sirve como señal anti-captura, no como prueba criptográfica.

### 5.2 Por qué no lleva firma

La diferencia de diseño responde a que el modelo de amenaza es otro:

| | Puerta (acceso) | Barra (canje) |
| --- | --- | --- |
| Qué protege | Una admisión reutilizable, con reventa y transferencia | Un consumible de un solo uso |
| Identificador | `ticketId` público + secreto aparte | `qrCodeToken` **opaco y secreto** |
| Prueba de autenticidad | HMAC-SHA256 por ventana | Conocer el token |
| Unicidad | Lease + partición por dispositivo + estado | RPC `redeem_item` atómico |
| Validación offline | Sí (manifiesto descargado) | No |

En puerta, el `ticketId` viaja en claro dentro del QR: cualquiera que lo lea lo conoce, así
que hace falta un MAC para probar que quien lo presenta tiene el secreto. En barra, **el
token es el secreto**: no aparece en ninguna URL ni identificador público, y no hay
validación offline que obligue a distribuirlo. Firmarlo agregaría complejidad sin cerrar un
vector nuevo.

La unicidad la garantiza la base de datos: `redeem_item` es un RPC atómico que marca la
unidad como canjeada. Dos lecturas simultáneas del mismo token producen un canje y un
`alreadyRedeemed`.

### 5.3 Gracia asimétrica

Ésta es la diferencia de comportamiento más importante entre los dos sistemas:

```ts
// app/actions/addons.ts
const currentBlock = Math.floor(Date.now() / STORE_QR_ROTATION_MS)
if (decoded.timestampBlock < currentBlock - STORE_QR_GRACE_BLOCKS) {
  return { status: "expired_qr", message: "QR expirado. Pedile al cliente que muestre el código vivo." }
}
```

La puerta usa `Math.abs()` y rechaza ventanas futuras; la barra usa una comparación **de un
solo lado** y solo rechaza el pasado. Un bloque futuro (reloj del cliente adelantado) se
acepta.

Es una decisión de producto consciente: en barra, el costo de un falso rechazo es una cola de
gente sedienta discutiendo con el barman, mientras que el techo del abuso es un solo
consumible que el RPC va a marcar como canjeado de todos modos. En puerta, el costo de un
falso ingreso es una entrada gratis, así que ahí la validación es estricta en ambas
direcciones.

### 5.4 Escape hatch para tokens crudos

```ts
if (cleaned.startsWith("bar_") && !cleaned.includes(" ")) {
  return { token: cleaned, timestampBlock: storeTimestampBlock() }
}
```

Un token con prefijo `bar_` se acepta crudo, sin Base64 ni ventana, y el decoder le asigna el
bloque actual para que nunca aparezca vencido. En el servidor, `isRawToken` saltea la
validación temporal por completo. Es la vía para vouchers impresos y para el staff que carga
un token a mano cuando la cámara no lee.

El decoder rechaza explícitamente payloads que empiecen con `TP2.` o `TPS.` — y vuelve a
verificarlo **después** de decodificar el Base64, porque alguien podría envolver un payload
de puerta en Base64 para intentar canjearlo como extra. Ese cruce de dominios queda cerrado
en ambos sentidos: `resolveScanSecret()` no acepta payloads de tienda, y
`decodeLivingStorePayload()` no acepta payloads de puerta.

### 5.5 Autorización del canje

Antes de tocar el token, la acción de canje verifica sesión y que el staff no esté canjeando
en nombre de otro:

```ts
if (staffId !== user.id) {
  return { status: "forbidden", message: "No podés canjear en nombre de otro staff." }
}
```

Cada canje queda así atribuido al usuario autenticado que lo ejecutó, lo que hace auditable
la barra.

---

## 6. Comparativa de los tres modos

| | Living QR puerta | Estático firmado | Living QR barra |
| --- | --- | --- | --- |
| Formato | `TP2.<id>.<win>.<mac>` | `TPS.<id>.<mac>` | `Base64(<token>-<block>)` |
| Firma | HMAC-SHA256, 128 bits | HMAC-SHA256, 128 bits | ninguna |
| Rota | cada 15 s | no | cada 15 s |
| Vida útil | 30 s (15 + gracia) | indefinida | 30 s hacia atrás, sin techo hacia adelante |
| Ventanas futuras | rechazadas | n/a | aceptadas |
| Corrección de error QR | M (~15 %) | H (~30 %) | M (~15 %) |
| Valida offline | sí | sí | no |
| Dónde se usa | app en evento Living QR | papel, PDF, Apple/Google Wallet, POS | canje de extras |

---

## 7. Invariantes

Reglas que cualquier cambio en la billetera debe respetar:

1. **El QR nunca contiene `totp_secret`.** Ni en claro, ni en Base64, ni derivado de forma
   reversible.
2. **No existe un secreto global de firma.** La clave es por ticket, porque el manifiesto de
   puerta se distribuye a dispositivos.
3. **Toda comparación de MAC usa `timingSafeEqualHex()`**, nunca `===`.
4. **La frescura se valida aparte de la firma.** `expired` y `enforceFreshness` son campos
   independientes del resultado.
5. **Las ventanas futuras se rechazan en puerta.** El `Math.abs()` de
   `isLivingWindowAccepted()` no es decorativo.
6. **La política de QR estático es fail-closed.** Canal desconocido se trata como `online`.
7. **Un extra = un token = un canje.** Nunca un QR compartido por varias unidades.
8. **La clave de agrupación Padre incluye el `orderId`** salvo cuando hay `groupId`
   explícito.
9. **Los Hijos no pueden venderse por separado** de un bloque cerrado (`canSell={false}`).
10. **Los dominios de payload no se cruzan**: puerta y tienda se rechazan mutuamente.

## 8. Cobertura de tests

| Área | Suites |
| --- | --- |
| Criptografía del Living QR | `lib/totp-offline.test.ts`, `lib/scan-payload.test.ts` |
| Payload de canje | `lib/store/living-store-payload.test.ts` |
| Agrupación Padre/Hijo | `lib/ticket-wallet.test.ts` |
| Extras | `lib/tickets/wallet-extras.test.ts` |
| Política de QR estático | `lib/tickets/static-tps-policy.test.ts`, `lib/tickets/ensure-dynamic-qr.test.ts` |
| Visibilidad y carga de la billetera | `lib/tickets/wallet-visibility.test.ts`, `lib/tickets/wallet-query.test.ts`, `lib/wallet-os.test.ts` |
| Anti-duplicado y reloj en puerta | `lib/scanner/admission-lease.test.ts`, `lib/scanner/server-clock.test.ts`, `lib/scanner/scan-replay.test.ts`, `lib/scanner/offline-sync-conflicts.test.ts` |
| Códigos de respaldo e impresión | `lib/ticket-print.test.ts` |
| Estado visual y ciclo de vida | `lib/ticket-visual-status.test.ts`, `lib/ticket-schedule.test.ts`, `lib/ticket-share.test.ts` |

Se ejecutan con `npm test`.
