# Auditoría arquitectónica: de boletería nocturna a plataforma multi-nicho

**Alcance:** análisis de solo lectura del código actual de TokePass.  
**Objetivo de negocio:** expandir a “Accesos y Experiencias” (cursos, webinars, deporte, capacitaciones) **sin romper** el flujo de fiestas / recitales.  
**Fecha del corte:** 2026-08-21.  
**Fuera de alcance de esta fase:** implementación, migraciones y cambios de producto.

**Veredicto ejecutivo**

El núcleo transaccional (SKU → carrito → pago → orden → stock) ya es reutilizable. El mapa de recinto **no es obligatorio**. El wizard **ya tiene** un switch Presencial / Streaming.

El acoplamiento real no está en el checkout: está en (1) el esquema que exige `location` + `qr_code`, (2) el copy y la taxonomía de “noche”, y (3) el entregable post-compra, que asume **siempre** un QR de puerta. Un curso online se puede *vender* hoy con workarounds. No se puede *entregar* como experiencia digital (link de Zoom, LMS, material) sin modelo nuevo.

No existe `delivery_mode` ni `event_category` como enum de negocio. Existe `events.category_id` (FK a `event_categories`) y una convención de venue `"Streaming / Online"` / `"Online"`.

---

## FASE 1 — Modelos de datos (schema y types)

### 1. Estado actual

#### Event (`types/database.ts` → `Event`)

Campos estructurales relevantes:

| Campo | Tipo | Obligatorio en DB | Rol |
|---|---|---|---|
| `title` | `string` | sí | Nombre de la experiencia |
| `date` / `ends_at` | timestamptz | `date` sí | Ancla temporal (también `schedule_days`) |
| `location` | `string` | **sí (`text not null`)** | Texto de lugar. En borrador a veces `""`; al publicar exige ≥ 3 caracteres o un venue con nombre + location |
| `venue_id` | uuid \| null | no | Recinto reutilizable |
| `venue_map` | JSON | no | Plano SVG |
| `has_seating_plan` | boolean | sí (default false) | Activa mapa / sectores numerados |
| `has_schedule` | boolean | no | Agenda de bloques |
| `category_id` | uuid \| null | no | Taxonomía Super Admin |
| `age_restriction` | `atp` \| `16` \| `18` | sí en publish | Política de edad |
| `qr_type` | `dynamic` \| `static` | sí | Tipo de QR de puerta |
| `visibility` | `public` \| `private` \| `guest_list_only` | sí | Visibilidad B2C |
| `province` / `department` | string \| null | no | Geo Argentina |
| `lineup` / `event_artists` | JSON / relación | no | Artistas / lineup |
| `default_ticket_tab` | `auto` \| `seated` \| `general` \| `bundle` \| `addon` | no | Tab inicial del picker |

**No existe** `delivery_mode` (`presencial` / `online` / `hibrido`).  
**No existe** `event_category` como enum de producto (`Fiesta`, `Curso`, `Deporte`).  
**No existe** `meeting_url`, `access_url`, `lms_url` ni `fulfillment_type`.

La modalidad online **ya se usa**, pero como convención de strings:

```1:13:lib/venues/streaming-venue.ts
export const STREAMING_VENUE_NAME = "Streaming / Online"
export const STREAMING_VENUE_LOCATION = "Online"

export function isStreamingVenue(venue: {
  venueName?: string | null
  venueLocation?: string | null
}) {
  // name === "streaming / online" || location === "online"
}
```

Discovery también trata `"online"` / `"streaming"` como no-geográficos (`STREAMING_LOCATION_RE` en `lib/discovery-filters.ts`) y pinta la card como `"Online"`.

#### Venue / “Sector”

`Venue` (`venues`) es un recinto físico reutilizable:

- `name` y `location` son **NOT NULL**
- `latitude` / `longitude` son opcionales
- `capacity` / `max_capacity` > 0
- `venue_map`, `seating_layout`, `zone_blueprint`

No hay una entidad de dominio llamada `Sector` como tabla canónica de negocio. El “sector” vive en tres capas:

1. **Plano:** zonas / sectores del JSON `venue_map` (`GENERAL` vs `RESERVED`).
2. **SKU:** `ticket_tiers.seating_sector_id` (nullable). `NULL` = inventario flotante (GA / Master Manifest).
3. **Legado:** `event_zones` + `seats` (arquitectura omni inicial).

Un curso online no necesita sector. El modelo ya lo permite: `has_seating_plan = false` + tiers `layout_type = "general"` + `seating_sector_id = null`.

#### TicketTier (SKU comercial)

`TicketTier` es el producto vendible. Es el modelo **más reutilizable** del sistema:

- `name`, `price` (All-In), `base_price`, `capacity`, `sold`
- `day_id` nullable (abono vs jornada)
- `layout_type`: `general` | `table_combo` | `numbered_seat`
- `tier_type`: `seated` | `general` | `addon` | `bundle`
- `category`: `standard` | `bundle` | `special` (categoría comercial, no de nicho)
- combos, fases/lotes, min/max por compra, `admit_count` (QRs por unidad)

Nada en el SKU dice “silla de boliche”. Un “Pase Webinar” o “Módulo 1” cabe acá.

#### Ticket (instancia post-compra)

Cada fila de `tickets` es un **pase de puerta**:

| Campo | Obligatorio | Implicancia |
|---|---|---|
| `qr_code` | **sí, unique** desde `00001_core_schema.sql` | Siempre hay código |
| `totp_secret` | **sí, unique** | Semilla del Living QR |
| `is_dynamic_qr` | sí | QR vivo vs estático |
| `ticket_type` | sí | `admission` \| `parking` \| `access_pass` |
| `seat_id` / `seating_unit_id` | no | Solo si hay mapa |
| `max_admissions` / `admissions_used` | sí | Check-in de puerta |
| `issuance_channel` | sí | `online` \| `pos` \| `batch_print` \| `complimentary` \| `accreditation` |

`ticket_type = access_pass` **no** es un link digital. En el scanner (`lib/scanner/gate.ts`) `parking` y `access_pass` se tratan como pases de predio (otra puerta), no como Zoom.

`issuance_channel = "online"` significa “vendido por web”, no “evento virtual”.

#### Order

`Order` es un comprobante de pago, no un “pedido de experiencia”:

- montos (`subtotal`, `service_charge`, `total_amount`)
- estado, provider (Mercado Pago, POS, sandbox, free…)
- buyer / guest (`guest_token`, DNI, teléfono)
- consentimiento legal
- **no tiene `event_id`**: el evento se deriva de los tickets

No hay `order_items` genéricos. Las líneas reales son tickets (+ `order_addons` / `event_items`).

`EventItem` (upsell) está tipado a predio nocturno: `drinks`, `food`, `merch`, `parking`, `access_pass`, etc. (`lib/store-categories.ts`).

#### Taxonomía B2C

Tabla `event_categories` (migración `20261106500000_p37_event_categories.sql`):

- Super Admin crea slugs (`name`, `slug`, `icon_name`, `is_active`)
- `events.category_id` es FK opcional (`ON DELETE SET NULL`)
- Seed actual: **Fiestas, Recitales, Teatro & Cultura, Deportes**
- No hay Cursos, Webinars, Corporativo ni Capacitación

El fallback de discovery (`lib/discovery-categories.ts`) hardcodea esos mismos cuatro moods (`DiscoveryMoodId`) y keywords de fiesta (`boliche`, `after`, `perreo`, `rave`…).

El filtrado B2C (`filterCatalogEvents`) ya matchea **por UUID de categoría**. Agregar “Cursos” en Super Admin **filtra** sin migrar schema. No cambia copy, iconos ni tema.

### 2. Cuellos de botella / hardcoding

1. **`events.location` NOT NULL** y el publish (`publishEvent` en `app/actions/events.ts`) exige lugar ≥ 3 caracteres o venue con `name` + `location`. El workaround `"Online"` funciona, pero el campo sigue siendo “dirección de predio”, no un modo de entrega.
2. **No hay `delivery_mode`.** Online se infiere por strings mágicos. Frágil para híbrido, reportes, SEO y reglas de UI.
3. **`venues.location` NOT NULL** y `capacity > 0`. Un “venue virtual” hay que fingirlo (`Streaming / Online` + capacidad inventada).
4. **`tickets.qr_code` + `totp_secret` NOT NULL UNIQUE.** El entregable canónico es QR. No hay columna para URL de acceso, ventana de revelado, o “sin check-in físico”.
5. **`ticket_type` no modela delivery.** `access_pass` es puerta de predio.
6. **`qr_type` en Event** asume que el evento *tiene* QR (dinámico o estático).
7. **Staff y ops** (`door_staff`, `bar_staff`, `cashier`, `EventDoorAccessPin`) están pensados para puerta/barra, no para un host de Zoom.
8. **Add-ons** (`drinks`, `Beer` icon) acoplan el upsell a consumo de predio.
9. **`age_restriction`** es obligatorio al publicar (`atp` / `+16` / `+18`). Sirve para un curso (ATP), pero el copy B2C habla de DNI en puerta.
10. **Lineup / Spotify / `event_artists`** sesgan el recinto hacia show. La agenda (`agenda_blocks`) es más genérica (“charlas, shows o itinerario”).
11. **Moneda:** fees y copy asumen ARS. No es bloqueo de nicho, sí de mercado.
12. **Acoplamiento a “fiestas/recitales”:** medio. El schema es de *ticketing de acceso*, no de *nightlife*. El sesgo está en seed, enums de staff/addons, QR obligatorio y copy. Un curso *cabe* si se acepta fingir venue + emitir QR inútil.

### 3. Reutilizabilidad

- SKU / inventario / lotes / combos / abonos multi-día / cupos: sirven para un curso de 4 clases o un torneo.
- `visibility` + guest list + max por usuario: sirven para capacitaciones privadas.
- `has_seating_plan` + `has_schedule` como flags opcionales: el camino correcto para no romper fiestas.
- `category_id` + panel Super Admin: se pueden sumar nichos **sin migración**.
- `Order` + providers de pago + holds + fees All-In: agnósticos al tipo de experiencia.
- `schedule_days` / agenda: un webinar de 3 sesiones o un congreso ya encajan.
- Convención streaming + `eventCardLocationLabel`: el catálogo ya sabe pintar “Online”.
- `venue_id` nullable + mapa JSON opcional: no hay que “apagar” el recinto en schema.

---

## FASE 2 — UI / UX y hardcoding (landing y cards)

### 1. Estado actual

**Home** (`app/(public)/page.tsx`) carga catálogo + categorías DB (fallback local) y monta `DiscoveryHub`. No hay pestañas de mega-nicho (Entretenimiento / Cursos / Deportes) a nivel de layout. El filtro es **categoría + provincia + fecha + artista**.

**Hero** (`components/discovery/hero-section.tsx`): titular y subtítulo fijos. Debajo, `SearchBar` (query, ubicación, categoría, artista, preset de fecha).

**Cards** (`components/discovery/event-card.tsx`): flyer, precio, urgencia, categoría, `MapPin` + `eventCardLocationLabel`. Estructura neutra. El sesgo está en el copy alrededor, no en el layout de la card.

**Directory** (`DiscoveryHub` `variant="directory"`): ya usa `role="tablist"` sobre las categorías. Son chips, no un sistema de contexto (colores / hero / empty state por nicho).

**Tema:** `app/globals.css` fija `--primary` en emerald de marca. El hero usa un degradé violeta → fucsia → cyan **hardcodeado**. No hay `ThemeProvider` por categoría ni tokens `--niche-*`.

#### Inventario de copy “de noche” (hardcodeado)

| Ubicación | Texto actual | Sesgo |
|---|---|---|
| `app/(public)/page.tsx` metadata | “TokePass — Tu próxima gran noche” / “Fiestas, festivales y las mejores noches de tu ciudad. Entradas digitales seguras que funcionan sin internet.” | Alto |
| `app/layout.tsx` metadata | “TokePass — Vive el evento” / “Tu entrada en el celular… Boletería digital 100% segura.” | Medio (boletería / entrada) |
| `components/discovery/hero-section.tsx` | “Tu próxima gran noche empieza acá.” / “Descubrí las mejores fiestas, festivales y recitales de tu ciudad.” / “entrada 100% offline.” | Alto |
| `components/discovery/empty-state.tsx` | “Sintonizando la agenda de la noche…” | Alto |
| `app/(public)/cuenta/page.tsx` | “Tu próximo show…” / “Fiestas, recitales y más” | Alto |
| `components/discovery/search-bar.tsx` | “Buscar evento o artista…” / “Todas las ubicaciones” | Medio (artista + geo) |
| `components/discovery/discovery-hub.tsx` | “Buscar por artista, evento o lugar…” | Medio |
| `lib/discovery-categories.ts` | Labels + keywords: Fiestas, Recitales, boliche, after, perreo, rave… | Alto |
| `components/admin/organizer-events-manager.tsx` | “Creá tu primera noche como borrador…” | Alto |
| `components/admin/schedule-days-builder.tsx` | “Cada noche o día…” | Medio |
| `components/admin/event-creation-wizard.tsx` | “varias noches o dias” / “Un festival necesita…” (validación) | Medio |
| `components/public/organizer-landing.tsx` | “entrada del boliche o el estadio”, “te arruina la puerta” | Alto |
| `components/public/commercial-canvas.tsx` | Barra, predio, no-show, RRPP, “entradas truchas”, Living QR | Alto |
| Storefront (`event-storefront.tsx`) | “Verificá… en puerta”, “Qué llevar… Living QR”, Uber / Maps | Alto para online |
| Nav | “Mis Entradas” / “Entradas” | Medio (léxico) |

Copy **ya neutro** (reutilizable): “Publicá tu evento en TokePass”, “Buscar eventos”, “Favoritos”, “Explorar”, schema.org `WebSite` sin mencionar fiestas.

### 2. Cuellos de botella / hardcoding

1. El **posicionamiento de marca** en metadata + hero está 100% nightlife. Un curso publicado hoy aparece bajo “tu próxima gran noche”.
2. **Empty state** y cuenta del comprador no tienen variante por categoría.
3. **Búsqueda sesgada a artista + lugar.** Un curso se busca por tema / instructor; el haystack incluye lineup y venue (`catalogSearchHaystack`).
4. **Filtro geo primero.** `SearchBar` abre por “Todas las ubicaciones”. Eventos `Online` no son una provincia; hoy se cuelan o se filtran mal si el usuario elige San Juan.
5. **`DiscoveryMoodId`** está cerrado a `fiestas | recitales | teatro | deportes`. El runtime ya usa UUIDs de DB; el tipo y el fallback local no.
6. **Iconos de categoría** (`lib/category-icons.ts`): disco, mic, teatro, trophy. No hay `GraduationCap`, `Video`, `BookOpen`, `Briefcase`.
7. **Storefront de evento no pregunta si es streaming.** Siempre monta `EventLocationPanel` (Maps + Uber) y el acordeón de puerta / DNI / Living QR. Un webinar mostraría “Ubicación: Streaming / Online” + CTA de Uber.
8. **Tabs de mega-nicho con cambio de color:** hoy **no hay** un contexto de nicho. Cambiar el filtro de categoría es fácil; cambiar “el frontend entero” (hero, tokens, empty, CTA organizador) no está cableado.

### 3. Reutilizabilidad

- `DiscoveryHub` + `filterCatalogEvents` + query `?category=` ya son un sistema de pestañas de catálogo.
- `event_categories` administrable: se puede seedear “Cursos” / “Deportes” (Deportes ya existe) **sin tocar cards**.
- `EventCard` es un mosaico de flyer + precio + fecha + lugar. Sirve para un curso si el lugar dice “Online” y la categoría es correcta.
- `eventCardLocationLabel` ya evita el ruido “Online, San Juan · Online”.
- Tokens CSS (`--primary`, `bg-card`) permiten un theme por nicho **si** se introduce un provider; no hay que reescribir las cards.
- `mapDbCategoriesToDiscovery` ya mapea filas DB → chips del hero.

**Viabilidad de pestañas Entretenimiento / Cursos / Deportes**

| Capa | Esfuerzo | Nota |
|---|---|---|
| Filtrar el grid por grupo de `category_id` | Bajo | El mecanismo existe |
| Copy del hero / metadata / empty | Bajo | Strings fijos, 6–8 archivos |
| Seed de categorías + iconos | Bajo | Super Admin + `CATEGORY_ICON_MAP` |
| Tema de color por pestaña | Medio | No hay context de nicho; el primary es global |
| Storefront / cuenta / comercial sin “puerta” | Alto | Copy y componentes asumen predio |
| No romper nightlife | Bajo si las pestañas son *filtros*, no un rewrite | El default puede seguir siendo Entretenimiento |

Recomendación de producto: pestañas = **agrupadores de `event_categories`**, no un frontend nuevo. El color puede ser un acento por tab, no un reskin completo.

---

## FASE 3 — Motor de checkout y mapa interactivo

### 1. Estado actual

No hay `cart-store.ts`. El carrito B2C es `lib/stores/checkout-store.ts` (alias `useStorefrontCartStore`). El mapa vive en `lib/stores/storefront-seat-store.ts`.

**Línea de carrito** (`StorefrontCartLine`):

- `ticketTierId`, `name`, `displayName`, `quantity`, `price`
- `dateId` / `dateLabel` (jornada)
- `seatId` / `elementId` **opcionales**

`addToCart` no exige asiento. `isMapCartLine` solo es true si hay `seatId` o `elementId`.

**¿El mapa es obligatorio?** No.

`eventNeedsInteractiveCanvas(venueMap, tickets)` (`lib/seating/venue-map-pricing.ts`):

1. Si `venueMapHasInventory(map)` es false → **no hay canvas**.
2. Si ningún SKU es `isMapBackedTicket` (numerado / mesa / sector RESERVED con butacas) → **no hay canvas**.

`CheckoutTunnel` deriva `hasSeatingFlow = hasInteractiveMap`. Sin mapa:

- no abre sheet de asientos
- el picker muestra tiers GA / bundle / addon
- `pendingAction === "open_map"` no fuerza un mapa vacío

El wizard, al elegir **Streaming / Online**, apaga el mapa:

- `basics.hasSeatingPlan = false`
- `venue.includesSeatingMap = false`
- `zoneType = general_admission`
- no renderiza `EventVenueStep` ni el diseñador de recinto

Un curso online con un SKU “Acceso al vivo” (GA, cupo 200, sin `seating_sector_id`) **compra igual que una entrada general de fiesta**.

**Pago:** Mercado Pago / sandbox / free / POS. El formulario cobra un `totalAmount` y un `orderId`. No mira sillas ni Zoom.

**Hold de stock:** el asiento reservado (`reserved_until`) solo aplica si hay unidad de mapa. GA usa `sold` + hold de carrito. Un webinar usa el camino GA.

### 2. Cuellos de botella / hardcoding

1. **Copy y UX del túnel** hablan de “entradas”, “lugar”, “mapa”. No bloquean un curso; sí lo disfrazan de fiesta.
2. Si un organizador deja `has_seating_plan = true` con mapa vacío, el canvas **no se exige** (`eventNeedsInteractiveCanvas` = false). El riesgo no es “ explota sin mapa”; es inconsistencia de flags, ya mitigada.
3. **POS y puerta** (`pos-terminal`, `hasInteractiveMap`) asumen evento físico. Un curso online no debería aparecer en totem de boletería; hoy no hay flag que lo excluya.
4. **Checkout de asiento** (`CheckoutPendingAction = "open_map"`) nombra el mundo físico. El motor no depende de eso.
5. **Add-ons de carrito** (bebida, merch, parking) aparecen en el picker si el organizador los carga. No hay tipo “material digital / grabación”.
6. **Identidad + DNI** en checkout está pensada para lookup de puerta. Para un webinar es fricción; para corporativo puede ser deseable.

### 3. Reutilizabilidad

- El carrito **es agnóstico**: vende un SKU con precio y cupo. Le da igual una silla VIP que un pase a un vivo.
- El mapa es **opt-in** (`has_seating_plan` + inventario real). No hay que “desinstalarlo” para cursos.
- Precios All-In, lotes, combos, min/max, guest checkout, holds y Mercado Pago se reutilizan tal cual.
- `default_ticket_tab` ya contempla un flujo 100% `general`.
- Deportes con platea numerada **reusan** el mapa actual (sectores GENERAL / RESERVED).
- Capacitaciones presenciales en aula: mismo mapa o solo GA.

**Conclusión de fase:** el checkout no es el bloqueo. Un webinar se puede vender **hoy** si el organizador marca Streaming y carga un tier general. El bloqueo está después del pago y en la ficha pública.

---

## FASE 4 — Post-compra y delivery de acceso

### 1. Estado actual

El fulfillment (RPCs de reserva / pago en `supabase/migrations/*`) **siempre** inserta:

- `qr_code` (UUID / unique)
- `totp_secret` (hex unique)
- `is_dynamic_qr` según `events.qr_type`
- `ticket_type` default `admission`

“Mis entradas” (`/cuenta/entradas`, nav “Entradas”, PWA wallet) es una **billetera de QR**:

- `LivingTicketQR` (TOTP offline, rota ~15s) o `StaticSignedQR`
- Apple / Google Wallet
- PDF térmico (`lib/pdf/render-ticket-pdf.tsx`)
- transfer / reventa (rotan el secreto)
- save offline (`lib/offline-store.ts`)

`TicketDetailView` y `LivingTicketCard` **siempre** montan el QR. No hay branch “si es virtual, mostrar link”.

El mail / share asume QR: “generar tu codigo QR”, “Mis entradas”.

El scanner (`door-scanner`, `lib/scanner/gate.ts`) es el consumidor de ese QR. Offline-first, puertas, parking, VIP.

### 2. Cuellos de botella / hardcoding

1. **El sistema asume que SIEMPRE se genera un QR.** No es un default de UI: es NOT NULL en DB + inserción en todos los RPCs + UI de wallet + PDF + Wallet passes + scanner.
2. **No hay campo ni tipo para un entregable no-QR.** Un link de Zoom no tiene dónde persistirse de forma segura (revelado post-pago, oculto pre-evento, rotación, un solo dispositivo).
3. `bonus_reward` / `description` del tier **podrían** usarse como hack (“el link llega por mail”), pero:
   - se muestran en storefront **antes** de comprar
   - no hay ACL
   - no hay “revelar a las 18:50”
4. **Wallet / PDF / PWA offline** no tienen sentido para un Zoom; hoy se generarían igual.
5. **Copy post-compra** (“código QR válido para el acceso al evento”, “Living QR en el celular con batería”) es de predio.
6. **Reventa y transferencia** invalidan QR. Para un curso grabado o un cupo de Meet, las reglas deberían ser otras (o no existir).
7. `ticket_type = access_pass` **no** desbloquea un botón de link; el scanner lo trata como parking/acceso secundario.
8. **Preparación para “botón Zoom oculto en lugar de QR”:** baja. Haría falta:
   - columna o tabla de fulfillment (`delivery_mode`, `access_url` cifrada, `reveal_at`)
   - branch en `TicketDetailView` / PDF / mail / Wallet
   - política: ¿se sigue emitiendo QR por compatibilidad o se relaja el NOT NULL?
   - no romper fiestas (default = QR de puerta)

### 3. Reutilizabilidad

- La **wallet** (“mis accesos”) es el contenedor correcto: cambiar el *payload* (QR vs botón vs archivo) no obliga a otra sección de cuenta.
- Estados de ticket (`valid` / `used` / `cancelled` / `transferred`) sirven para un check-in virtual (marcar “asistió al Zoom”) si se reinterpreta `used`.
- Guest token + claim + mail ya entregan *algo* al comprador.
- Transferencia oficial puede servir para “ceder mi cupo del curso”.
- El Living QR sigue siendo el entregable correcto para **deporte presencial, congreso, capacitación in-company**.
- PDF / print studio siguen sirviendo para acreditaciones corporativas.

**Respuesta directa:** sí, el sistema asume QR siempre. No está preparado para sustituirlo por un link. Está preparado para *sumar* un entregable al lado del QR, si se modela.

---

## FASE 5 — Panel del organizador (dashboard B2B)

### 1. Estado actual

Wizard (`components/admin/event-creation-wizard.tsx`) + validación (`lib/validations/event-form.ts`).

Pasos visibles (`lib/events/wizard-steps.ts`):

| Índice | Título | Contenido |
|---|---|---|
| 0 `IDENTITY` | Identidad | Título, flyer, visibilidad, **categoría**, **edad** |
| 1 `MAP` | Cita y lugar | Fechas, **modalidad**, recinto/mapa, agenda |
| 2 `TICKETS` | Entradas | SKUs, cupos, precios |

**El switch “¿presencial o virtual?” ya existe en el paso 1**, no en el paso 0:

- “Evento Presencial” → recinto físico + (opt) mapa
- “Streaming / Online” → setea venue mágico, apaga mapa, oculta `EventVenueStep`

Texto de ayuda online: *“El evento se publica como Streaming / Online. No hace falta recinto ni mapa de asientos.”*

Al persistir, `location` queda `"Online"` (o el display del place) y `venues.name` `"Streaming / Online"`. `publishEvent` acepta eso (`"Online".length >= 3`).

**Campos del paso 1 presencial** (no se piden en streaming):

- nombre de lugar, dirección, provincia/departamento
- pin GPS (`latitude` / `longitude`) — **obligatorio solo al guardar el venue en catálogo**, no al publicar
- switch “Requiere Mapa de Asientos Numerados”
- diseñador de recinto

**No aparece** en el formulario de creación un campo “Puerta de acceso” (eso es ops: PINs de puerta, staff, scanner).  
**No hay** coordenadas GPS obligatorias para publicar un presencial (sí para persistir el lugar en la libretita de venues).

**Paso 0 — sí o sí hoy (también para un curso):**

- título ≥ 3
- descripción ≥ 10
- `categoryId` UUID de la lista TokePass (hoy: Fiestas / Recitales / Teatro / Deportes)
- `ageRestriction` ATP / +16 / +18
- flyer opcional en draft, esperado en publish

**Paso 2:** “Creá al menos un tipo de entrada” con stock. El léxico es “entrada”, no “inscripción”, pero el modelo es un SKU.

Multi-día: validación *“Un festival necesita al menos dos jornadas.”* Un curso de dos clases tropieza con copy de festival (la regla de cobertura de días sí es reutilizable).

### 2. Cuellos de botella / hardcoding

1. **La modalidad no se persiste como campo.** Recargar el form infiere `isStreaming` por el nombre/location. Un typo o un venue real llamado “Online Café” choca con la heurística.
2. **No hay Híbrido.** No se puede “presencial + link”. El switch es binario.
3. **Categorías cerradas** (“No se pueden crear etiquetas libres”). Sin “Cursos” en Super Admin, el organizador etiqueta mal (p. ej. Teatro) o no publica (`categoryId` requerido).
4. **Edad obligatoria** con UX de boliche. ATP alcanza; el storefront igual habla de puerta.
5. **GPS / Maps / Uber** no se piden en streaming, pero la ficha pública **sí** muestra panel de ubicación.
6. **Paso 1 se sigue llamando “Cita y lugar” / `WIZARD_STEP_MAP`.** El índice mental es recinto.
7. **Lineup de artistas** (Spotify) sigue disponible en identidad/preview. No bloquea; ensucia un curso.
8. **Copy B2B:** “primera noche”, “festival”, “entradas”, “puerta”.
9. **POS, Print Studio, RRPP, barra** viven en el mismo dashboard. Un docente de curso ve un cockpit de boliche.
10. **Publicar exige fecha futura + tickets + ubicación.** Un ever-green (curso grabado, acceso 30 días) no encaja: el evento es una *cita*, no un *producto digital perenne*.

### 3. Reutilizabilidad

- **El switch presencial/virtual del paso 1 ya está.** No hace falta inventarlo; hay que **formalizarlo** (`delivery_mode`) y usarlo en storefront / wallet / publish.
- Ocultar recinto + mapa en streaming ya está implementado y es el patrón correcto.
- Agenda opcional (`hasSchedule` + `AgendaBuilder`) sirve para temario / speakers de un curso.
- Inventario unificado (GA, lotes, combos, abono) sirve para “clase suelta vs pack”.
- Visibilidad `private` / `guest_list_only` sirve corporativo.
- Draft + preview + auditoría de publish (`pending_approval`) sirven para un marketplace multi-nicho.
- Validación de cupo vs aforo **no corre** si no hay mapa: un cupo de webinar es solo `ticket_tiers.capacity`.

**Viabilidad del switch en el paso 1:** ya está en producción a nivel UI. Viabilidad de *producto* = alta, si la siguiente fase:

1. persiste `delivery_mode` (no strings),
2. relaja o reinterpreta `location` cuando es `online`,
3. oculta `EventLocationPanel` / Uber / “en puerta” cuando es virtual,
4. no toca el default presencial (fiestas siguen iguales).

Mover el switch al paso 0 es cosmético. El paso 1 es el lugar correcto (decide qué UI de recinto mostrar).

---

## Matriz de impacto (sin implementar)

| Capacidad deseada | ¿Se puede hoy sin code? | Qué falta para no romper fiestas |
|---|---|---|
| Vender un webinar GA | **Sí** (Streaming + tier general + location “Online”) | Copy + ocultar Maps/Uber |
| Filtrar “Cursos” en home | **Sí**, si Super Admin crea la categoría | Hero / empty / iconos |
| Tabs Entretenimiento / Cursos / Deportes | Parcial (chips de categoría) | Agrupar slugs + copy por tab |
| Mapa opcional | **Sí** (ya es opt-in) | Nada crítico |
| Carrito agnóstico | **Sí** | Léxico “entrada” → “acceso” (i18n) |
| No pedir GPS en virtual | **Sí** (ya) | Persistir modalidad |
| No generar QR | **No** | Migración + branch de wallet |
| Botón Zoom post-pago | **No** | Fulfillment digital + ACL |
| Híbrido (puerta + link) | **No** | `delivery_mode` + dos entregables |
| Curso grabado ever-green | **No** | `date` NOT NULL + publish fecha futura |
| Deporte con platea | **Sí** (mapa actual) | Categoría Deportes ya existe |
| Capacitación in-company privada | **Sí** (`private` + GA) | Dashboard menos “puerta/barra” |

---

## Qué no tocar (núcleo a preservar)

1. Motor de stock / holds / fases / combos / abonos.
2. Checkout Zustand + Mercado Pago + guest.
3. Mapa interactivo como **módulo opt-in** (fiestas, estadios, teatros).
4. Living QR + scanner offline (sigue siendo la ventaja para predio).
5. `event_categories` como taxonomía administrable (no un enum rígido nuevo que reemplace la FK).
6. Wizard de 3 pasos; el switch de modalidad del paso 1.

## Qué sí modelar en una fase posterior (no en esta auditoría)

1. **`delivery_mode`:** `in_person` | `online` | `hybrid` (fuente de verdad; deprecar la heurística de venue).
2. **`fulfillment_type` por evento o por tier:** `door_qr` (default) | `meeting_link` | `async_content`.
3. **Entregable digital** (URL cifrada, `reveal_at`, visibilidad post-pago).
4. **Agrupadores de discovery** (Entretenimiento / Aprendizaje / Deportes) sobre las categorías existentes.
5. **Copy / i18n de nicho** (hero, empty, storefront, wallet) sin fork de componentes.
6. Relajar copy de “festival” en multi-día; no la regla de cobertura de jornadas.

---

## Respuestas cortas a las preguntas del brief

| Pregunta | Respuesta |
|---|---|
| ¿Hay campos que limiten el evento a lo físico? | Sí: `events.location` NOT NULL, `venues.location` NOT NULL, publish `ERROR_FALTA_UBICACION`. Se mitiga con `"Online"`. GPS no es obligatorio al publicar. |
| ¿Existe `event_category` o `delivery_mode`? | Hay `category_id` → `event_categories` (seed nightlife). **No** hay `delivery_mode`. Online = convención de venue. |
| ¿Qué tan acoplada está la DB a fiestas? | Medio. Ticketing genérico + QR/puerta + seed/staff/addons de predio. |
| ¿Copy hardcodeado de noche? | Sí; listado en Fase 2. |
| ¿Tabs de nicho + colores? | Filtrar es fácil. Tema/contexto no existe. |
| ¿El mapa es opcional? | Sí. Sin inventario de mapa el checkout no lo exige. Streaming lo apaga. |
| ¿El carrito es agnóstico? | Sí. SKU + qty + asiento opcional. |
| ¿Siempre se genera QR? | Sí. NOT NULL + RPCs + wallet + PDF + Wallet. |
| ¿Listo para Zoom en vez de QR? | No. La wallet puede hospedarlo; el modelo no. |
| ¿Campos B2B absurdos para un curso? | GPS/puerta no se piden en Streaming. Categoría nightlife + edad + “entrada” + panel de Maps en la ficha pública sí sobran. |
| ¿Viabilidad del switch presencial/virtual en paso 1? | **Ya está.** Falta persistirlo y usarlo fuera del wizard. |
