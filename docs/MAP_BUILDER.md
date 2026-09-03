# Map Builder — Motor del editor de recintos

Documento técnico del **TokePass Studio**: el editor visual que dibuja recintos, genera
mobiliario vendible y sincroniza esa geometría con el inventario transaccional.

## Archivos del motor

| Archivo | Rol |
| --- | --- |
| `types/venue-map.ts` | Contrato del JSON: tipos, parser tolerante y serializador |
| `components/admin/interactive-venue-map-editor.tsx` | Estado interactivo, gestos, render SVG (~7.200 líneas) |
| `lib/seating/venue-polygon.ts` | Espacios de coordenadas y matemática de colisiones |
| `lib/seating/adopt-elements-into-zone.ts` | Adopción espacial de mesas al soltarlas |
| `lib/seating/venue-element-geometry.ts` | Geometría de piezas, clonado y reconstrucción de sillas |
| `components/admin/venue-svg-symbols.tsx` | Biblioteca de símbolos SVG e instancing |
| `lib/seating/venue-map-lod.ts` | Level of detail, AABB y cámara |
| `lib/seating/venue-map-history.ts` | Undo / redo |
| `lib/seating/editor-stock-lock.ts` | Bloqueo por stock comprometido |
| `lib/seating/editor-test-purge.ts` | Distinción entre venta real y compra de prueba |
| `lib/seating/reconcile-map-seating-units.ts` | Puente JSON → `event_seating_units` |
| `lib/seating/map-inventory-hydration.ts` | Puente inventario → pintura del canvas |

---

## 1. El contrato del JSON

`InteractiveVenueMap` (`version: 1`) es la única fuente de verdad de la geometría:

```ts
type InteractiveVenueMap = {
  version: 1
  stage: VenueMapStage | null      // escenario (rect + rotación opcional)
  labels: VenueMapLabel[]          // textos libres
  aisles: VenueMapAisle[]          // pasillos
  sectors: VenueMapSector[]        // gradas paramétricas (filas × asientos)
  elements: VenueMapElement[]      // mobiliario: mesas, sillas, palcos, infraestructura
  zones: VenueMapZone[]            // polígonos comerciales contenedores
  backgroundImage: string | null   // plano de referencia + escala/offset/opacidad
  backgroundOpacity: number
  backgroundScale: number
  backgroundX: number
  backgroundY: number
}
```

### 1.1 Dos capas, un solo array

`elements` mezcla piezas vendibles y decorativas; la discriminante es `category`
(`commercial` | `infrastructure`). `serializeVenueMap` aprovecha esto para **normalizar al
guardar**: la infraestructura se reescribe campo por campo con `price: 0`, `capacity: 0`,
`seats: []` y `chairCount: 0`, de modo que un escenario o un baño nunca puedan arrastrar
precio residual si antes fueron una mesa.

### 1.2 Dos semánticas de precio en lockstep

`sellMode` (`per_seat` | `group`) y `priceMode` (`per_person` | `closed_unit`) describen lo
mismo desde dos ángulos y se mantienen sincronizados por `resolveVenuePricing()`. La razón
de duplicarlo es que los mapas viejos solo tienen `sellMode`, y la UI necesita el término
explícito: `venueUnitPriceLabel()` decide si el inspector dice "Precio total de la mesa" o
"Precio por silla".

### 1.3 El parser es deliberadamente tolerante

`parseVenueMap()` no valida: **repara**. Acepta el mapa como string JSON, lo desanida si
viene envuelto (`layout`, `map`, `venue_map`, `data`), acepta `camelCase` y `snake_case` en
cada campo, deriva polígonos desde `points` o desde `x/y/width/height`, aplana `elements`
anidados dentro de `sectors` (formato legacy) deduplicando por id, y cuando falta un id
genera uno **estable y determinista** a partir del nombre:

```ts
// stableFallbackEntityId("zone", "Sector VIP Norte", 2) → "zone-sector-vip-norte-3"
```

Ese determinismo importa: un id inventado al azar rompería el vínculo con el inventario en
cada lectura. El slug normaliza acentos (NFD), recorta a 24 caracteres y cae a `item` si el
nombre quedó vacío.

### 1.4 El JSON no guarda ocupación

Decisión central del diseño, anotada en el propio parser:

```ts
// types/venue-map.ts
function parseSeatStatus(value: unknown): VenueMapSeatStatus {
  // Inventory occupancy (sold / reserved / available) lives on
  // event_seating_units. Map JSON only records editor geometry locks.
  if (value === "blocked" || value === "disabled" || value === "inactive") {
    return "blocked"
  }
```

`status` en el JSON solo expresa *"el editor bloqueó esta butaca"*. Vendido, reservado y
disponible viven exclusivamente en Postgres. Sin esta separación, cada guardado del mapa
sobrescribiría el estado de ventas.

---

## 2. Espacios de coordenadas

El motor maneja **dos espacios** y casi todos los bugs de mapas nacen de confundirlos.

```
Mundo del canvas:  800 × 560 px   (VENUE_MAP_CANVAS)
Elementos:         píxeles de canvas — x, y son el CENTRO de la pieza
Polígonos de zona: porcentaje del canvas (0–100), con overflow permitido hasta 140
```

Las zonas se guardan en porcentaje para sobrevivir a cambios de viewBox; los elementos en
píxeles porque su geometría (radio de mesa, pitch de sillas) es absoluta.

### 2.1 La heurística de espacio y su marca explícita

Los mapas antiguos no declaran su espacio. `polygonLooksLikePixels()` lo infiere: si algún
vértice supera **200** (`VENUE_PIXEL_SPACE_MIN`) no puede ser un porcentaje razonable, así
que es píxeles. Pero un vértice puede legítimamente pasar de 100 cuando el viewBox se
expande, y por eso existe `VENUE_PERCENT_OVERFLOW_MAX = 140` como cota documental.

Para no depender de heurísticas, todo polígono nuevo se marca con
`polygonSpace: "percent"`, y `normalizePolygonToPercent()` respeta esa marca **sin volver a
multiplicar ni dividir**. `serializeVenueMap` reestampa `polygonSpace: "percent"` en cada
zona al guardar. El fallo que esto previene: una zona reconvertida dos veces colapsa contra
la esquina superior izquierda del plano.

`polygonFromCanvas()` existe como camino explícito canvas → % para el cierre de polígonos
durante el dibujo, justamente para saltear la heurística cuando ya se conoce el espacio.

Los vértices se registran con el flotante exacto del puntero. El imán de grilla
(`VENUE_GRID_SIZE`, 20 px) aplica al mobiliario y al desplazamiento de la zona entera, nunca
al contorno: el borde real de un recinto casi nunca cae en múltiplos de 20, y forzarlo
deformaba el trazado sobre la foto.

---

## 3. Estado interactivo

### 3.1 Estado React vs. refs espejo

El editor mantiene ~60 `useState` para el chrome (herramienta activa, colapsos, modales,
zoom, modo de trabajo) y **refs espejo** para todo lo que se lee dentro de un gesto:
`mapRef`, `occupancyRef`, `liveTransformRef`, `hoveredZoneIdRef`, `transformBoundsRef`,
`magneticSnapRef`.

El motivo es que un `pointermove` a 120 Hz no puede depender del closure de render: leer
`mapRef.current` da el mapa actual sin re-renderizar ni arrastrar valores obsoletos.

### 3.2 Transformación en vivo, commit al final

El patrón que sostiene la fluidez es la separación entre **preview efímero** y **estado
comprometido**. Durante el arrastre no se toca `map`: se pinta un `LiveTransform`
(`move` | `scale` | `rotate`) que el SVG aplica como `transform` sobre un `<g>` contenedor.

```
pointerdown → transformDrag.current = { mode, origin, ids }
pointermove → paintLive({ type: "move", dx, dy })   // solo un transform SVG
pointerup   → commitLiveTransform(snap)             // aquí sí se reescribe el mapa
```

`commitLiveTransform()` aplica el snap magnético al soltar, y antes de escribir descarta
transformaciones nulas con `isIdentityLive()`: menos de 0,05 px de traslación, menos de
0,001 de escala o menos de 0,05° de rotación no generan entrada de historial. Sin ese
umbral, un click simple ensuciaría el undo.

### 3.3 Cache del CTM

Convertir coordenadas de pantalla a SVG requiere `getScreenCTM()`, que fuerza layout.
`readScreenCtm()` lo cachea con una ventana de **16 ms** (un frame), de modo que un gesto
con varios eventos por frame lo calcula una sola vez.

### 3.4 Historial

`lib/seating/venue-map-history.ts` implementa undo/redo con dos pilas y
`structuredClone`, limitado a **40 pasos** (`VENUE_MAP_HISTORY_LIMIT`). El límite se aplica
descartando desde el frente (`slice(next.length - limit)`), no desde el final.

Un caso especial: `shouldUndoPolygonDraft()` hace que `Ctrl+Z` durante el trazado de un
polígono retire el último vértice en lugar de deshacer la operación anterior — el usuario
espera que el undo actúe sobre lo que está dibujando.

### 3.5 Modos y aislamiento

- `tool`: `select` | `stage` | `sector` | `aisle` | `label` | `polygon` | `matrix`.
  `polygon` y `matrix` dibujan sobre el lienzo, así que apagan los hit targets de los
  objetos (`drawingOnCanvas`) para que el arrastre no agarre una mesa por el camino.
- `workMode`: `architecture` (geometría libre) vs. `pricing` (geometría congelada,
  `geometryLocked`, y colores reemplazados por heatmap de precios).
- `isolationId`: aislamiento de un grupo de elementos; el resto del plano baja a
  `opacity-50`.
- `activeZoneId`: navegación macro/micro. Se entra desde "Ingresar y distribuir sector" en
  el inspector de la zona, que guarda el encuadre en `overviewViewportRef` y encuadra el
  polígono con `fitViewportToWorldBox`. En vista micro el lienzo **no atenúa: oculta** —
  se van la foto de fondo, las demás zonas, el escenario, los pasillos, los carteles y
  todo elemento o butaca que no pertenezca a la zona. Queda el polígono activo como
  contorno tenue (`lodMode="micro"`, sin etiqueta ni relleno pesado) sobre el lienzo
  neutro con grilla. Todo lo que se coloca adentro se adopta a esa zona
  (`withActiveZoneId` y el hover de drop forzado). Se sale con "Volver al mapa general",
  Escape, o seleccionando algo de afuera en el árbol de capas.
- El id se resuelve siempre contra el mapa (`microZoneId = activeZone?.id`), así un id
  colgado no deja el lienzo en blanco.
- Selección polimórfica: `Selection` distingue `element`, `elements`, `seats`, `zone`,
  `sector`, `stage`, `aisle`, `label` — cada tipo con su propio gizmo e inspector.
- El inspector de una zona (`VenueZoneBasicsPanel`) tiene solo Nombre, Color y el botón de
  ingreso: el inventario de una zona son las piezas que se colocan adentro, no una grilla
  paramétrica tipeada a mano. Los campos `rows`/`itemsPerRow`/`capacity` siguen en el tipo
  y en los mapas ya guardados, pero ya no se editan desde el panel; el precio se sigue
  tocando en el modo Tarifas.
- El inspector de una pieza abre con **Nombre** y **Capacidad (accesos)**: son los dos
  datos que la vuelven inventario. La capacidad es un número por objeto
  (`elementCapacityPatch`) que mueve a la vez las sillas dibujadas y los accesos que se
  emiten, con los topes de `elementCapacityRange` (mesa 2–12, tablón 1–24, cupo 1–100);
  en una butaca el campo no aparece porque siempre vale 1. Debajo, el switch **Mostrar
  nombre en el plano** escribe `hideLabel` y solo cambia el dibujo: el nombre sigue
  saliendo en el boleto y en la lista de la puerta.

---

## 4. SVG instancing (clonación)

La clonación opera en dos niveles distintos que conviene no confundir: **instancing de
render** (una silueta, muchas copias en el DOM) y **clonación de datos** (generar muchos
elementos en el JSON).

### 4.1 Instancing de render: `<symbol>` + `<use>`

La butaca de teatro es la pieza que puede aparecer cientos de veces, así que se define una
sola vez por SVG y se referencia:

```tsx
// components/admin/venue-svg-symbols.tsx
export const THEATRE_SEAT_SYMBOL_ID = "tokepass-theatre-seat"
const THEATRE_SEAT_UNIT = 12

/** Unit seat (back + cushion) for hardware-instanced `<use>` copies. */
export function TheatreSeatDefs({ id = THEATRE_SEAT_SYMBOL_ID }: { id?: string }) {
  return (
    <defs>
      <symbol id={id} viewBox="-6 -6 12 12" overflow="visible">
        {/* respaldo + almohadón */}
      </symbol>
    </defs>
  )
}
```

`TheatreSeatDefs` se monta **una vez** en la raíz del SVG del editor, y cada butaca es un
`<use href="#tokepass-theatre-seat">`. Tres detalles hacen que funcione:

1. **Unidad fija de 12 px.** El símbolo siempre se instancia a `THEATRE_SEAT_UNIT` y el
   tamaño real se logra con `scale`, no cambiando `width`/`height`. Así el navegador puede
   reutilizar el mismo árbol renderizado.
2. **Transform compuesto en orden.** Rotación primero, escala centrada después:

   ```
   rotate(θ cx cy) translate(cx cy) scale(s) translate(-cx -cy)
   ```

   El sandwich de `translate` alrededor de `scale` mantiene el centro fijo; sin él la pieza
   se iría hacia el origen al escalar.
3. **Color por `currentColor`.** El símbolo pinta con `currentColor` y cada `<use>` fija
   `color={fill}`. Una sola definición sirve para verde disponible, rojo vendido, ámbar en
   hold y esmeralda seleccionada, sin duplicar geometría.

`VenueShapePreview` genera un `symbolId` propio con `useId()` para los thumbnails de la
paleta, evitando colisión de ids cuando hay varios SVG en pantalla.

### 4.2 Símbolos paramétricos

Mesas, tablones, palcos y zonas de pie no usan `<symbol>` porque su forma depende de los
datos (cantidad de sillas, lados ocupados). Se generan por composición:

- **`RoundTableSymbol`** — sillas en órbita: `orbit = r + chairRadius + 2`, ángulo
  `(i / count) · 2π`, posición `(cx + cos θ · orbit, cy + sin θ · orbit)`.
- **`LongTableSymbol`** — dos filas independientes (`sideA` arriba, `sideB` abajo) con
  interpolación lineal `t = i / (n - 1)` sobre el ancho menos el inset, y el caso `n === 1`
  centrado en `t = 0.5` para no dividir por cero.
- **`VipBoxSymbol`** — grilla de `cols = ceil(count / 2)` más respaldo, apoyabrazos y mesa
  elíptica.

Todas comparten `VenueElementSymbol` como dispatcher, que resuelve la silueta con
`resolveVenueShapeType(element)`: `shapeType` explícito si existe, y si no el default
derivado del tipo comercial. Esa indirección permite que una pieza vendida como `round_table`
se dibuje como `long_table` sin cambiar su semántica comercial.

### 4.3 Hit targets expandidos

Una silla se dibuja con radio 3 px: imposible de tocar en un teléfono. `expandedChairHit()`
inyecta un círculo transparente de `max(chairRadius, 11) + hitPadding` con
`strokeWidth: 14`. Es un elemento aparte del visual, y **no se emite** si la silla está
bloqueada o si no hay handlers, para no inflar el DOM sin motivo.

Los targets se marcan con `data-inventory`, `data-element-id`, `data-seat-id` y
`data-locked`, y el editor resuelve qué se tocó con `inventoryHitFromNode(event.target)` en
un único handler delegado en el `<svg>` raíz, en lugar de suscribir miles de listeners.

### 4.4 Clonación de datos

| Herramienta | Función | Matemática |
| --- | --- | --- |
| Duplicar | `cloneVenueElements(els, ids, offset)` | Copias con UUID corto nuevo, nombre libre y desplazamiento |
| Matriz | `generateGridArray(config)` | `pitch = (ancho/columnas, alto/filas)` del área, tope **800** items |
| Anillos | `lib/seating/concentric-ring.ts` | `polarFromUp(cx, cy, r, θ)` |
| Arco | `distributeOnArc(...)` | Redistribución sobre circunferencia |

`generateGridArray` arranca en el centro de la primera celda del área
(`originX = area.minX + pitchX/2`), asigna un `groupId` compartido
(`grid-<slug>-<uuid8>`), guarda la fila en `ringIndex` y reconstruye las sillas de cada
pieza con `rebuildElementSeats()`. `clampGridArraySize()` recorta filas y columnas para no
pasar de `GRID_ARRAY_MAX_ITEMS = 800`, ajustando primero columnas y después filas.

**Matriz de elementos (estampado por área).** La herramienta `matrix` de la barra
flotante (y el ítem homónimo de la paleta) no coloca nada al activarse: el
organizador arrastra sobre el lienzo, y al soltar se abre `GridArrayDialog` con el
área ya medida. Con `area` presente el paso lo define la caja y no el gap
(`gridArrayPitch` → `pitch = (área / columnas, área / filas)`), y cada pieza queda
en el centro de su celda, así ninguna se pasa del borde dibujado.
`gridArrayPiecesOverlap()` avisa en el modal cuando la densidad pedida hace que las
piezas se pisen.

Lo que se inyecta son elementos sueltos: id propio, `x`/`y` propios y adopción a la
zona con `adoptDroppedElements(..., activeZoneId)`. La matriz es la forma de
estamparlos, no un objeto que los agrupe: después se puede mover o borrar cualquiera
de a uno para recortar un borde en diagonal. Mientras la herramienta está activa el
lienzo no agarra objetos (`objectHitsEnabled = false`), el área se recorta al mundo
con `clampWorldPoint()` y Escape vuelve a selección.

**Nombrado del bloque (opcional).** El modal pide `Prefijo` y `N° de inicio`, y
`nameGridArray()` decide con eso:

- **Con prefijo** numera de izquierda a derecha y de arriba abajo delegando en
  `applyAutoNumbering(..., { direction: "ltr", pad: 1 })` — alcanza porque
  `generateGridArray` ya guardó la fila en `ringIndex`. El separador lo pone la
  librería: "Mesa" → `Mesa 1`, pero un prefijo que ya termina en separador se
  respeta ("M-" → `M-1`). `pad: 1` evita el relleno de ceros del panel de
  numeración inteligente ("Mesa 01"). El modal muestra el primero y el último
  nombre que van a salir, y avisa si esos nombres ya están en uso en el plano
  (subir el `N° de inicio` es la salida).
- **Sin prefijo** las piezas quedan **sin etiqueta dibujada**, no sin nombre:
  `nameGridArray` marca `hideLabel: true` y conserva el nombre por defecto del
  tipo. Es deliberado: `normalizeSeatingLayout()` (`app/actions/venues.ts`)
  rechaza ubicaciones con `label` vacío, `elementSeatLabel()` armaría boletos
  tipo `" - Silla 3"` y el manifiesto de la puerta quedaría sin nada que leer.
  Para que dos matrices sin prefijo no dejen dos "Mesa 1" en la lista de la
  puerta, el editor pasa `labelOffset` con las piezas del mismo tipo que ya hay
  en el plano, igual que la colocación de a una.

`hideLabel` es puro dibujo: `VenueMapElementLayer` calcula `labelText = ""` y las
etiquetas superpuestas solo se emiten con texto no vacío (antes salía un `<text>`
vacío). Aplica también al plano del comprador, que comparte esa capa; el nombre
del carrito no cambia porque sale de `getVenueElementDisplayName()`. En el
inspector el switch **Mostrar nombre en el plano** lo alterna, y escribir un
nombre lo vuelve a mostrar solo.

**Alt + arrastre duplica.** Sobre una pieza (o sobre la silla de una mesa, que
duplica la mesa) el gesto crea la copia bajo el puntero y arrastra **solo la copia**,
aunque pertenezca a una grada: `beginGroupMove([clone.id])` en lugar de expandir al
grupo. Sobre el lienzo vacío Alt sigue siendo paneo, así que `wantsAltDuplicate()`
solo le gana a `wantsCanvasPan()` cuando hay un objeto debajo, y nunca en modo
`pricing`. Si el arrastre no llegó a mover nada, `settleDuplicateDrag()` corre la
copia 15 px para que no quede invisible sobre el original; si el gesto se cancela,
`abortTransientGestures()` deshace el paso de historial que la creó.

Dos detalles que la copia no hereda: el **nombre**, porque viaja al boleto
(`nextFreeElementLabel()` da el primer libre: "Mesa 4" → "Mesa 5", "Mesa VIP" →
"Mesa VIP 2"), y **`isLocked`**, que `applyLocalStockLocks()` inyecta cuando la pieza
tiene ventas y `occupancyFromMapSeatStatuses()` lee como ocupado — heredarlo mostraría
la copia agotada antes de existir. Capacidad, precio, color, `zoneId` y `groupId` sí
se copian tal cual.

`distributeOnArc` calcula el radio desde el sweep pedido:

```
radius = span / (2 · sin(max(0.08, sweep/2)))
```

El piso de `0.08` rad en el seno evita la división por cero cuando el sweep tiende a 0. El
centro se coloca a `radius` del centroide en dirección al foco (por defecto el escenario,
arriba), y cada pieza recibe `rotation = angle` para que **mire al foco**.

### 4.5 Level of detail

`lib/seating/venue-map-lod.ts` degrada el detalle según la cámara: `showChairs` y
`showLabels` se apagan al alejarse (`MAP_LABEL_MIN_ZOOM = 0.35`), y
`semanticMapLabelScale()` agranda las etiquetas al alejarse (hasta 2,6×) para que "Pista" o
"Mesa 1" sigan legibles. `compactVenueElementLabel()` recorta "Mesa 12" a "12" con zoom alto.

Cuando el mapa no tiene zonas dibujadas, `synthesizeLodZones()` **inventa** polígonos
agrupando elementos por `groupId`/`sectorName` y calculando el AABB de cada grupo con
`unionAabb`, más 18 px de padding. Requiere al menos 2 grupos para activarse: con uno solo
no hay nada que discriminar.

**Macro/micro del comprador.** En `InteractiveSeatingCanvas` la navegación es estado
local (`viewMode`, `focusedZoneId`, `revealedZoneId`) y el carrito vive en
`useStorefrontSeatStore` + `useCheckoutStore`. Están separados a propósito: el
polígono de cada zona sale siempre de `resolveLodZones(map)` — el 100 % de las zonas
del evento — y lo seleccionado solo decide **con qué color se pinta**
(`syncSelectionPaint`, `selectedId`), nunca qué zonas existen. `exitLodView()` toca
navegación y cámara, y nada del carrito.

**Entrar cuesta más que salir.** `enterLodZone()` solo cambia de vista si hay algo
que mostrar: `zoneHasRevealableInventory()` corre la misma cuenta que el render del
micro (`publicRevealElements` + `publicRevealSeats`) **antes** de tocar cámara o
estado. Hace falta porque `hasAssignedReservedPlaces()` clasifica como numerada a una
zona con grilla paramétrica declarada aunque nadie haya dibujado piezas adentro, y
también a piezas atribuidas por `zoneId` que caen fuera del polígono; entrar en esos
casos era un zoom hacia un lienzo sin nada. Sin inventario adentro, el clic se
resuelve como sector entero (`onSelectZone`, o `selectGeneralZone()` si el canvas no
tiene padre) y la navegación queda intacta.

**La transición no corta, atenúa.** Entrar a una zona es una sola animación de
cámara (`zoomToZone` → `zoomToElement(node, scale, 400ms)`) sobre un plano que sigue
ahí: la foto del predio baja a `MAP_BACKDROP_MICRO_OPACITY` (0,18) con la transición
de `.venue-map-backdrop` en vez de desmontarse, y las zonas no enfocadas quedan en
0,3 con `grayscale(1)` y su propia transición en `VenueMapZoneLayer`. El escenario,
los pasillos y las etiquetas nunca se sacan. Las piezas de adentro montan 160 ms
después (`REVEAL_MOUNT_MS`, por `revealedZoneId`) y entran con el fade de
`.venue-map-reveal` (350 ms), que se reinicia solo porque el grupo va con
`key={focusedZoneId}`. Todo respeta `prefers-reduced-motion`.

La cámara es la parte delicada: al salir del detalle hay que reencuadrar el plano
completo en el mismo gesto. El efecto de auto-encuadre no sirve para eso, porque
`shouldRunBuyerAutoFit()` solo corre en el primer frame macro de la sesión o si cambia
el tamaño del contenedor; volver de una zona no cumple ninguna de las dos. Por eso
`exitLodView()` llama al encuadre él mismo, y `applyBuyerContentFit()` **no mira
`viewMode`**: se la invoca en el mismo tick que `setViewMode("macro")`, cuando el
estado todavía dice "micro". Un guard ahí adentro dejaba al comprador con el zoom
clavado en la zona que acababa de cerrar, con el resto del plano fuera de pantalla —
se ve igual que si las zonas hubieran desaparecido.

**Tres estados que se leen sin texto.** `buyerZonePaint({ selected, soldOut, baseColor })`
(en `lib/seating/buyer-map-selection-paint.ts`) es la única definición de cómo se ve
un sector para el comprador:

| Estado | Relleno | Opacidad | Contorno | Resplandor | Click |
| --- | --- | --- | --- | --- | --- |
| Agotado | `BUYER_SEAT_FILL.sold` | 0,3 | gris | no | no |
| En el carrito | color del sector | 0,9 | anillo de contraste, 3 px | sí, en su color | sí |
| Disponible | color del sector | 0,4 | su color, 2 px | el neón del mapa | sí |

El color del sector se mantiene en los tres: lo que cambia es la solidez, el anillo y
el resplandor. El agotado gana sobre el carrito, así que nunca brilla algo que no se
vende. El anillo es blanco salvo que el relleno sea casi blanco (`buyerZoneRing()`
mide luminancia), donde el blanco sobre blanco no se vería.

Se aplica por dos caminos que coinciden a propósito. En el render, `VenueMapZoneLayer`
usa la función cuando `buyerOccupancy` está prendido — el editor conserva su paleta,
que tiene estados que el comprador no ve (drop target, spotlight, nodos) — y ahí el
estado "elegido" ahora gana sobre `lodMode="macro"`, que antes lo tapaba y dejaba al
sector del carrito igual que a uno libre. En vivo, `paintBuyerMapSelection()` repinta
el DOM sin remount con la misma función: hace falta porque la pertenencia al carrito
vive en refs (`selectionIdsRef`) y no en props, justamente para no re-renderizar el
canvas entero con cada cambio de carrito. `selectedId` solo cubre la zona enfocada
(`visibleZoneId`), así que el pintor es el que alcanza a las demás zonas del carrito.

Dos límites del pintor, deliberados: no toca `fill-opacity` (depende de la vista —
macro, micro, zona enfocada — y devolver un valor capturado antes lo replicaría en la
vista equivocada; de la opacidad se encarga React), y a butacas y mesas las sigue
pintando con el verde del carrito (`BUYER_SELECTION_FILL`) en lugar del color base:
el color base de una butaca **es** su estado (libre / tomada), así que reusarlo
borraría la selección. En el micro los tres estados de una mesa quedan igual de
legibles: gris sin click si está vendida, verde sólido con resplandor si está en el
carrito, su color si está libre.

---

## 5. Adopción espacial de mesas

Es el algoritmo que hace que arrastrar una mesa dentro de un polígono la convierta en
inventario de ese sector, heredando nombre, color y precio.

### 5.1 Point-in-polygon: raycasting even-odd

```ts
// lib/seating/venue-polygon.ts
export function isPointInPolygon(
  point: VenueMapPoint,
  polygon: readonly VenueMapPoint[],
): boolean {
  if (polygon.length < 3) return false
  const last = polygon[polygon.length - 1]!
  const first = polygon[0]!
  const closed =
    last.x === first.x && last.y === first.y ? polygon.length - 1 : polygon.length
  if (closed < 3) return false
  let inside = false
  for (let i = 0, j = closed - 1; i < closed; j = i, i += 1) {
    const a = polygon[i]!
    const b = polygon[j]!
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}
```

Se lanza un rayo horizontal hacia la izquierda y se cuentan cruces: impar = dentro. Tres
decisiones específicas:

- **`a.y > point.y !== b.y > point.y`** garantiza que cada arista se cuente una sola vez y
  resuelve el caso del vértice exactamente a la altura del punto.
- **`|| Number.EPSILON`** en el denominador evita la división por cero en aristas
  horizontales sin necesidad de un caso especial.
- **Vértice de cierre duplicado ignorado.** Si el último vértice repite el primero se
  descarta, porque contarlo agregaría una arista degenerada y podría invertir la paridad.

Funciona con polígonos cóncavos y con forma de estrella, que es el caso real de las gradas
en L o en U.

### 5.2 Normalización antes de comparar

El punto viene en píxeles de canvas y el polígono puede estar en porcentaje. `isPointInPolygon`
**exige el mismo espacio**, así que el wrapper convierte primero:

```ts
isCanvasPointInZonePolygon(point, polygon, space)
  → isPointInPolygon(point, polygonToCanvas([...polygon], space))
```

### 5.3 Desempate por orden de pintado

```ts
for (let i = zones.length - 1; i >= 0; i -= 1) { ... }
```

`zoneIdContainingCanvasPoint()` recorre las zonas **en reversa** y devuelve la primera que
contiene el punto. Como el SVG pinta en orden de array, la última es la de encima: gana la
zona visualmente superior, que es la que el usuario cree estar señalando. El parámetro
`skipId` excluye la zona que se está arrastrando, para que un polígono no se adopte a sí
mismo.

### 5.4 Seguimiento durante el arrastre

Mientras se mueve la selección, cada `pointermove` en modo `move` llama a
`syncDropZoneHover()`, que:

1. Verifica con `shouldTrackDropZone()` que el gesto sea elegible — no hay edición de
   vértices en curso, el modo es `move` (no scale/rotate) y no se trata de una zona sin
   elementos.
2. Calcula el **centroide del bounding box en vivo** con `dropSelectionCentroid()`, que
   aplica el `LiveTransform` actual al centro del box. Es decir, usa la posición *visual*
   del arrastre, no la posición comprometida.
3. Resuelve la zona y la escribe en `hoveredZoneIdRef` + `hoveredZoneId`, con un guard de
   igualdad (`if (hoveredZoneIdRef.current === next) return`) para no re-renderizar en cada
   frame cuando el hover no cambió. En vista micro se saltea el cálculo y el hover es
   siempre la zona activa: como el resto del plano está oculto, un polígono solapado que
   no se ve no puede robarse la adopción.

Ese `hoveredZoneId` alimenta el resaltado del polígono: el organizador ve a qué sector va a
caer la mesa antes de soltar.

### 5.5 Resolución al soltar

```ts
// lib/seating/adopt-elements-into-zone.ts
export function resolveDropZoneId(
  elements: readonly VenueMapElement[],
  zones: readonly VenueMapZone[] | undefined,
  hoveredZoneId?: string | null,
): string | null {
  const list = zones ?? []
  const hovered = hoveredZoneId?.trim()
  if (hovered && list.some((zone) => zone.id === hovered)) {
    return hovered
  }
  if (elements.length === 0 || list.length === 0) return null
  const cx = elements.reduce((sum, item) => sum + elementCanvasCenter(item).x, 0) / elements.length
  const cy = elements.reduce((sum, item) => sum + elementCanvasCenter(item).y, 0) / elements.length
  return zoneIdContainingCanvasPoint({ x: cx, y: cy }, list)
}
```

Estrategia de dos niveles: se **prefiere el hover del último frame** del arrastre y, si ya
se limpió o apunta a una zona inexistente, se recalcula con el **centroide de los centros**
de los elementos soltados. El fallback importa porque `pointerup` puede llegar después de
que el hover se reseteó, y sin él una selección múltiple soltada dentro de un polígono no se
adoptaría.

Hay un sesgo conocido en el fallback: `elementCanvasCenter()` calcula
`element.x + width/2`, pero `x`/`y` **ya son el centro** de la pieza (así los trata
`elementAabb()`, que resta y suma media dimensión desde `x`/`y`). El centroide del fallback
queda entonces corrido media pieza hacia abajo y a la derecha. En la práctica casi no se
nota porque el camino normal es el hover del último frame, y porque el desvío es mucho menor
que un polígono de sector; pero si se toca este código, es el punto a corregir.

### 5.6 Herencia y preservación de grupos

```ts
// lib/seating/adopt-elements-into-zone.ts
export function adoptElementIntoZone(
  element: VenueMapElement,
  zone: AdoptableZone,
): VenueMapElement {
  if (!isSellableElement(element)) return element

  const previousZoneId = element.zoneId?.trim() || ""
  const groupId = element.groupId?.trim() || ""
  const inheritGroup = !groupId || groupId === previousZoneId || groupId === zone.id
  const nextColor = zone.color?.trim() || element.color
  const nextPrice = zone.price > 0 ? zone.price : element.price

  return {
    ...element,
    zoneId: zone.id,
    sectorName: zone.name,
    color: nextColor,
    price: nextPrice,
    ...(inheritGroup ? { groupId: zone.id, groupName: zone.name } : {}),
  }
}
```

Reglas y su razón:

- **La infraestructura no se adopta.** Un baño dentro de la zona VIP no debe volverse
  vendible.
- **`price` solo se hereda si la zona tiene precio > 0.** Una zona sin precio no debe
  poner en cero una mesa ya tarifada.
- **`groupId` se preserva** cuando pertenece a una agrupación propia (una grilla generada,
  un anillo). Solo se reescribe si estaba vacío o si coincidía con la zona anterior o la
  nueva. Sin esta condición, arrastrar un bloque generado disolvería su agrupación.
- **`adoptElementsIntoZone` devuelve el mapa original por identidad** si nada cambió
  (`changed` queda en `false`), evitando entradas de historial y re-renders espurios.

### 5.7 Pertenencia en lectura: cadena de precedencia

Para consultas (storefront, LOD, reconciliación) la relación se resuelve con
`elementBelongsToZone()`, que aplica una cadena de precedencia de lo explícito a lo
geométrico:

```
zoneId explícito → groupId === zone.id → id === zone.id
  → sectorName coincide → groupName coincide → point-in-polygon del centro
```

La geometría es el **último** recurso. Un elemento con `zoneId` asignado no cambia de dueño
por haber quedado visualmente encima de otro polígono, lo que evita que mover un polígono
reasigne inventario ya vendido.

---

## 6. Del JSON a la tabla de inventario

```
InteractiveVenueMap (events.venue_map, jsonb)
        │  venueMapToSeatingLayout()
        ▼
seatingLayout (sectores → filas → items)
        │  seatingLayoutUnitDrafts()
        ▼
MapSeatingUnitDraft[]
        │  reconcileMapSeatingUnitsAfterSave()
        ▼
event_seating_units  ←→  ticket_tiers
        │  hydrateVenueMapOccupancy()
        ▼
occupancy: Record<layoutId, SeatStatus>  →  pintura del canvas
```

### 6.1 La clave de vínculo

Cada unidad se identifica por la tripleta:

```
`${layout_item_id}::${sector_id}::${event_date_id ?? ""}`
```

`layout_item_id` es el id del elemento o de la silla dentro del JSON. Ese es el punto de
contacto entre geometría e inventario, y la razón por la que los ids del mapa deben ser
estables entre guardados (ver §6.4).

### 6.2 Qué se convierte en inventario

`seatingLayoutUnitDrafts()` solo emite drafts para sectores `table_combo` o
`numbered_seat` — las zonas `general` se venden por aforo y no generan filas. Además
descarta items con `status === "blocked"` y deduplica por `layoutItemId`. La capacidad se
resuelve en cascada: `item.capacity` → `sector.capacity_per_unit` → 1.

### 6.3 Resolución de tier

`resolveMapUnitTierId()` busca a qué tipo de entrada corresponde cada unidad, en orden:

1. `ticketTypeId` explícito en el elemento o la silla, si existe entre los tiers.
2. Tier cuyo `seating_sector_id` coincide con el sector.
3. Primer tier con layout sentado (`table_combo` / `numbered_seat`) que no sea `extra`.
4. Primer tier público que no sea `extra`.
5. Cualquier tier.

En eventos multijornada los tiers se filtran por `day_id` antes de aplicar la cascada, y si
ese filtro deja el set vacío se vuelve al conjunto completo.

### 6.4 Reconciliación no destructiva

`reconcileMapSeatingUnitsAfterSave()` es un upsert con dos protecciones explícitas:

```ts
// lib/seating/reconcile-map-seating-units.ts
        if (nextTier === current.tier_id && current.status !== "blocked") continue
        if (current.status === "sold" || current.status === "reserved") continue
```

Nada con estado `sold` o `reserved` se toca, ni siquiera para corregirle el tier.
`resolveSeatingUnitTierId()` decide el tier respetando el estado, y los inserts van en
chunks de 100 filas. La lectura de unidades existentes está topeada en 20.000.

### 6.5 El camino de vuelta: hidratación

`hydrateVenueMapOccupancy()` cruza el JSON estático con el inventario vivo **antes del
primer paint**, sin mutar el mapa. Combina cuatro fuentes por prioridad
(`mergeInventoryOccupancy`):

1. Filas de `event_seating_units`.
2. SKUs agotados (`occupancyFromSoldOutTicketTypes`) — un tier sin stock bloquea toda la
   geometría que lo referencia, por `ticketTypeId`, `groupId`, `zoneId` o `id`.
3. Tickets emitidos (`occupancyFromSoldTicketRefs`), descartando `cancelled`/`refunded`/
   `revoked` y filtrando por jornada activa.
4. Occupancy en vivo por Realtime.

Después aplica **rollup a padres**: si todas las sillas de una mesa están tomadas, la mesa
queda `occupied`; si están tomadas o en hold con al menos un hold, queda `held`.
`isVenueMapElementSoldOut()` invierte la lógica según `sellMode`: en `group` **una** silla
vendida agota la mesa entera (se vende como unidad cerrada), mientras que en `per_seat`
hacen falta todas.

`lockUnknownLayoutIds` cierra el último hueco: cuando hay un roster de unidades, los ids
presentes en el JSON que no aparecen en la base se marcan como ocupados en lugar de
mostrarse libres. Es preferible no vender una butaca que venderla dos veces.

### 6.6 Escritura y concurrencia

`saveVenueMapOnly()` (`app/actions/events.ts`):

1. Autoriza: sesión requerida, y organizador `admin` con `organizer_approval_status`
   `approved`, o super admin.
2. Normaliza con `serializeVenueMap(parseVenueMap(input))` — el payload nunca se guarda
   crudo.
3. **Compare-and-swap** sobre `updated_at`: compara contra `expectedUpdatedAt` y además
   añade `.eq("updated_at", casUpdatedAt)` al UPDATE, de modo que dos pestañas editando el
   mismo mapa no se sobrescriban en silencio (`VENUE_MAP_STALE_WRITE_ERROR`).
4. Valida inmutabilidad de layout con `assertDraftMapLayoutImmutable()` antes de escribir.
5. Reconcilia unidades y devuelve el nuevo `updatedAt`, que el editor guarda en
   `loadedUpdatedAtRef` para el próximo CAS.

---

## 7. Protección contra bloqueos de pruebas

El problema que resuelve esta capa: el organizador prueba su propio evento, compra una
mesa, y al volver al editor esa mesa aparece bloqueada. Sin distinguir venta real de venta
de prueba, la única salida sería borrar el evento.

La solución separa **tres estados** y no dos.

### 7.1 Qué bloquea de verdad

```ts
// lib/seating/editor-stock-lock.ts
export function seatingUnitLocksEditor(
  unit: { status?: string | null; sold?: boolean | null; isTest?: boolean },
  eventStatus?: string | null,
) {
  return (
    seatingUnitHasCommittedSale(unit) &&
    !unit.isTest &&
    eventStatusAllowsEditorStockLock(eventStatus)
  )
}
```

Se requieren **tres condiciones simultáneas**: venta comprometida (`sold` / `reserved`),
que **no** sea de prueba, y que el evento esté `published`. Un evento en borrador nunca
bloquea, porque cualquier compra ahí es por definición un ensayo.

### 7.2 Dos mapas de ocupación en paralelo

El editor calcula dos hidrataciones independientes sobre el mismo mapa:

```tsx
// components/admin/interactive-venue-map-editor.tsx
  const occupancyBySeatId = useMemo(
    () =>
      hydrateVenueMapOccupancy(map, {
        seatingUnits: seatingUnitsForEditorLock(seatingUnits, eventStatus),
        lockUnknownLayoutIds: false,
      }),
    [eventStatus, map, seatingUnits],
  )
  const testOccupancyBySeatId = useMemo(
    () =>
      hydrateVenueMapOccupancy(map, {
        seatingUnits: seatingUnitsForEditorTestPaint(seatingUnits, eventStatus),
        lockUnknownLayoutIds: false,
      }),
    [eventStatus, map, seatingUnits],
  )
```

| Mapa | Contenido | Efecto en la UI |
| --- | --- | --- |
| `occupancyBySeatId` | Ventas reales en evento publicado | Bloquea la edición |
| `testOccupancyBySeatId` | Compras de prueba o evento en borrador | Solo pinta y avisa |

`elementHasEditorTestPaint()` garantiza que no se solapen: si la pieza tiene stock real, no
se considera pintura de prueba. Y el mensaje es deliberadamente tranquilizador:

> *"Esta mesa tiene una compra de prueba o el evento está en borrador. Podés editarla con
> normalidad."*

`lockUnknownLayoutIds: false` en ambos casos es intencional: en el editor, un id sin fila en
la base es geometría nueva sin guardar, no algo a bloquear.

### 7.3 Bloqueo granular por campo

Un elemento con stock vendido no queda congelado por completo. Solo se rechazan los cambios
que romperían inventario ya emitido:

```ts
// components/admin/interactive-venue-map-editor.tsx
const STOCK_LOCKED_ELEMENT_PATCH_KEYS = [
  "ticketTypeId",
  "type",
  "zoneId",
  "groupId",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "chairCount",
  "sideA",
  "sideB",
  "sellMode",
] as const
```

Geometría, agrupación y semántica de venta están vetadas; **el color, la etiqueta y el
precio siguen siendo editables**. Un organizador puede renombrar "Mesa 4" a "Mesa VIP 4"
con la mesa vendida, pero no moverla ni cambiarle la cantidad de sillas.

`updateElement()` compara el patch entrante contra esa lista y solo entonces llama a
`refuseStockLocked()`.

### 7.4 Capas de defensa en el editor

1. **Prevención visual** — `applyLocalStockLocks()` marca `isLocked: true` en el mapa de
   render, y `data-locked="1"` + `pointer-events: none` desactivan los hit targets de las
   sillas tomadas.
2. **Aborto de gesto en vuelo** — un `useEffect` observa la selección viva y, si detecta
   stock comprometido, mata el arrastre en curso: `transformDrag.current = null`,
   `setLiveTransform(null)`, `setTransformingKind(null)`. Cubre el caso de que la ocupación
   llegue por Realtime a mitad de un movimiento.
3. **Guards por operación** — `idsAreLocked()`, `elementIdsHaveCommittedStock()` y
   `seatKeysHaveCommittedStock()` custodian borrado, renumeración, edición de sillas,
   explosión de sectores y patches. Todos convergen en `refuseStockLocked()`, que quita el
   foco, muestra un toast con id fijo (`"editor-stock-lock"`, para no apilar duplicados) y
   levanta el `VenueStockLockBanner`, con auto-dismiss a los 6 segundos.
4. **Validación en servidor** — `assertDraftMapLayoutImmutable()` recalcula la verdad contra
   la base antes de escribir, consultando en paralelo unidades vendidas y reservadas,
   unidades con `sold_order_id`, holds vigentes (`reserved_until > now`), tiers con
   `sold > 0`, tickets activos y `seat_holds` sin vencer. Si el mapa entrante no conserva un
   `layout_item_id` protegido, el guardado se rechaza. Los guards de cliente son UX; este es
   el que garantiza la integridad.
5. **Deduplicación de avisos** — `testToastKeyRef` guarda una clave
   `${kind}:${ids.join(",")}` para no repetir el mismo aviso informativo mientras la
   selección no cambie.

### 7.5 La válvula de escape: purgar compras de prueba

`purgeVenueMapEditorTestPurchases(eventId)` es la salida explícita del bloqueo. Confirma
con *"¿Deseas liberar todas las mesas ocupadas por compras de prueba?"* y ejecuta:

1. Autorización: sesión válida y `organizer_id` propio, o super admin.
2. `purgeSandboxInventoryForEvent()` para el inventario de sandbox.
3. `releaseEditorTestOccupancy()`:
   - Lee unidades `sold`/`reserved` (tope 20.000) y recolecta sus `sold_order_id` y
     `reserved_order_id`.
   - Clasifica esas órdenes con `isEditorTestOrder()` — `is_test === true` o
     `environment === "test"` — consultando en chunks de 200 ids.
   - Suma órdenes de tickets marcados `is_test`.
   - `editorTestTicketIdsToDelete()` borra los tickets de prueba.
   - `editorTestUnitIdsToRelease()` devuelve las unidades a `available`, limpiando
     `reserved_by`, `reserved_order_id`, `reserved_until` y `sold_order_id`.
4. Recarga el inventario y refresca `loadedUpdatedAt` para que el próximo CAS sea válido.

El comportamiento clave está en `eventStatusTreatsPurchasesAsDraft()`: si el evento **no**
está `published`, *todas* las ocupaciones se consideran de prueba y se liberan. Si está
publicado, solo se liberan las que pertenecen a órdenes de test identificadas. Es lo que
permite iterar libremente en borrador sin abrir una puerta para borrar ventas reales.

El editor reporta el resultado con números concretos ("Se liberaron N mesas y se quitaron M
tickets de prueba") o "No había compras de prueba para limpiar", en lugar de un éxito
genérico.

### 7.6 Estabilidad de ids

`stabilizeVenueMapIds(previous, next, aliases)` es la protección que evita huérfanos. Al
guardar, intenta preservar el id anterior de cada sector, zona, elemento y grupo:

1. Si el id entrante ya existía y no fue reclamado, se conserva.
2. Si no, se busca por **nombre normalizado** (`normalizeMapSectorLabel` quita acentos,
   pasa a minúsculas y elimina el prefijo `sector`/`zona`/`grada`) en el catálogo previo.
3. Los ids de sillas derivados se remapean con `remapPrefixedIds()`, que reescribe el
   prefijo `<viejoId>-` por `<nuevoId>-`.

El `Set` de `claimed` impide que dos entidades reclamen el mismo id. Sin esta capa, renombrar
un sector generaría ids nuevos y todas las `event_seating_units` apuntarían a
`layout_item_id` inexistentes: butacas vendidas invisibles en el mapa.

`healTicketSeatingSector()` hace la reparación complementaria del lado de los tickets, pero
solo cuando el nombre normalizado tiene **exactamente una** coincidencia — con ambigüedad
prefiere no tocar nada.

---

## 8. Invariantes del motor

Reglas que cualquier cambio debe respetar:

1. El JSON del mapa **nunca** guarda ocupación de inventario. Solo geometría y locks del
   editor.
2. Un polígono en porcentaje **nunca** se remultiplica. Marcar `polygonSpace` es
   obligatorio en polígonos nuevos.
3. Nada con estado `sold` o `reserved` se modifica en la reconciliación.
4. Los ids de layout son estables entre guardados; romperlos huérfana inventario.
5. Los guards del cliente son UX. La verdad se valida en el servidor
   (`assertDraftMapLayoutImmutable`).
6. Un evento en borrador no bloquea la edición: toda ocupación ahí es de prueba.
7. `x`/`y` de un elemento son su **centro**, no su esquina.
8. Toda escritura del mapa pasa por `serializeVenueMap(parseVenueMap(input))`.

## 9. Cobertura de tests

Cada módulo del motor tiene su test colocado, ejecutable con `npm test`:

`adopt-elements-into-zone.test.ts`, `venue-polygon.test.ts`, `venue-map-lod.test.ts`,
`venue-map-history.test.ts`, `editor-stock-lock.test.ts`, `editor-test-purge.test.ts`,
`stabilize-venue-map-ids.test.ts`, `reconcile-map-seating-units.test.ts`,
`map-inventory-hydration.test.ts`, `venue-element-geometry.test.ts`, `venue-array.test.ts`,
`concentric-ring.test.ts`, `venue-transform.test.ts`, `venue-grid-snap.test.ts`,
`venue-map-sku-consistency.test.ts`, `venue-map-persist.test.ts`,
`buyer-map-selection-paint.test.ts`.
