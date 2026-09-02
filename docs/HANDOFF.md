# Handoff técnico — TokePass

Documento de entrega para el desarrollador entrante. El código está en **Code Freeze**: la
arquitectura, el módulo de pagos y el motor de mapas no se tocan. El alcance del trabajo entrante
son bugs menores y la deuda listada acá.

Última verificación: 2 de septiembre de 2026.

---

## 1. Qué leer, y en qué orden

Los nueve manuales están en `docs/`. El orden recomendado no es alfabético: cada uno asume lo
anterior.

| # | Documento | Para qué sirve | Leelo si vas a tocar |
| --- | --- | --- | --- |
| 1 | [`ONBOARDING.md`](./ONBOARDING.md) | Levantar el entorno local, variables de Supabase, reglas de producción | **Siempre, primero** |
| 2 | [`DEPLOYMENT.md`](./DEPLOYMENT.md) | La puerta obligatoria antes de un push y cómo se aplican migraciones | **Antes del primer push** |
| 3 | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, patrones, propósito de cada directorio | Siempre, tercero |
| 4 | [`DB_SCHEMA.md`](./DB_SCHEMA.md) | Relaciones entre tablas, RLS, bloqueos anti-sobreventa | Cualquier cosa con datos |
| 5 | [`AUTH.md`](./AUTH.md) | OAuth + OTP, sesiones, rutas protegidas | Login, roles, middleware |
| 6 | [`SERVER_ACTIONS.md`](./SERVER_ACTIONS.md) | Catálogo de mutaciones y qué tabla toca cada una | Cualquier mutación |
| 7 | [`PAYMENTS.md`](./PAYMENTS.md) | Ciclo de vida de la transacción, webhooks, sandbox | Checkout, cobros |
| 8 | [`MAP_BUILDER.md`](./MAP_BUILDER.md) | Editor de mapas, adopción espacial, vínculo con inventario | Mapas, butacas |
| 9 | [`WALLET_SECURITY.md`](./WALLET_SECURITY.md) | Billetera, QR rotativo de 15s, canje en barra | Entradas, escáneres |

Complementarios, preexistentes: [`AUDITORIA_SISTEMA.md`](./AUDITORIA_SISTEMA.md) y
[`SCALING_GUIDE.md`](./SCALING_GUIDE.md).

Cada manual cierra con una sección "Deuda y riesgos verificados". **Esa es la fuente de verdad de
bugs conocidos**, no este documento: acá solo se indexan y se priorizan.

---

## 2. Cómo verificar que no rompiste nada

Corré esto antes de cada commit. Los cuatro primeros deben pasar; el quinto falla a propósito
(ver sección 4).

```bash
npm run lint             # eslint . --max-warnings 0   → debe salir 0
npx tsc --noEmit         # typecheck del proyecto      → debe salir 0
npm test                 # 1661 tests, 468 suites      → 0 fallos
npm run build            # build de producción         → debe salir 0
npm run typecheck:tests  # typecheck de los tests      → 125 errores esperados
```

Estado al momento de la entrega:

| Chequeo | Resultado |
| --- | --- |
| `lint` | limpio, con `--max-warnings 0` |
| `tsc` (proyecto) | limpio, con `strict: true` |
| `test` | 1661 / 1661 |
| `build` | limpio |
| `typecheck:tests` | 125 errores en 27 archivos (deuda conocida) |

E2E: `npm run test:e2e` (Playwright). Requiere entorno levantado y **nunca** debe apuntar a
producción.

---

## 3. Pendiente inmediato de la última refactorización

Dos cosas quedaron a medio camino a propósito, porque requieren acceso a la base de datos:

**3.1 Aplicar la migración P209.** El archivo
`supabase/migrations/20261132300000_p209_drop_unused_cart_hold_getters.sql` elimina dos funciones
SQL (`get_seating_unit_cart_hold` y `get_ga_cart_hold`) que quedaron sin ningún llamador. Está
escrito y verificado (ninguna otra función SQL las invoca) pero **no aplicado**. El detalle de qué
hacían, por qué borrarlas no altera la retención de lugares y qué **no** hay que borrar por
arrastre está en `DB_SCHEMA.md`, sección 6.2.

**3.2 Regenerar los tipos después de aplicarla.** `types/database.ts` es generado y todavía
declara esas dos funciones. Mientras no se regenere, TypeScript va a aceptar llamadas a RPCs que
ya no existen en la base. El comando, una vez linkeado el proyecto:

```bash
npx supabase gen types typescript --project-id <tu-project-ref> --schema public > types/database.ts
```

No lo corrí porque requiere credenciales y el proyecto prohíbe explícitamente conectarse a la base
de producción (ver `ONBOARDING.md`, sección de reglas estrictas).

---

## 4. Deuda de tipos en los tests

`npm run typecheck:tests` existe y funciona, pero reporta **125 errores en 27 archivos**. Contexto
importante antes de que los mires:

- Los 298 archivos de test **no estaban typecheckeados nunca**: el `tsconfig.json` los excluye. La
  deuda se acumuló durante meses de agregar campos a los tipos de producción.
- **Ninguno de los 125 indica un bug de producción.** Se revisó una muestra de cada clase de
  error: son fixtures de test que construyen objetos parciales, a los que les faltan campos que
  después se volvieron obligatorios, o que acceden a propiedades de una unión sin estrechar el
  tipo.
- Los 1661 tests **pasan en runtime**, porque la función bajo prueba solo lee los campos que el
  fixture sí provee.

O sea: es higiene de tipos, no corrección de bugs. Es un buen primer trabajo para familiarizarse
con el código, archivo por archivo, sin riesgo de romper producción.

### 4.1 Desglose por archivo

| Errores | Archivo | Códigos |
| --- | --- | --- |
| 21 | `lib/events/publish-event-v2.test.ts` | TS2353×16 TS2339×3 TS2739×2 |
| 13 | `lib/seating/venue-map-pricing.test.ts` | TS2352×6 TS2739×6 TS2339×1 |
| 13 | `lib/validations/event-draft-v2.test.ts` | TS2739×7 TS2353×2 TS2339×2 TS2741×1 TS2740×1 |
| 13 | `lib/checkout/cart-item-identity.test.ts` | TS2339×13 |
| 10 | `lib/validations/event-form-schedule.test.ts` | TS2322×8 TS2739×1 TS2740×1 |
| 8 | `lib/seating/live-venue-map-for-day.test.ts` | TS2322×8 |
| 5 | `lib/events/sanitize-ticket-tiers.test.ts` | TS2352×5 |
| 5 | `lib/seating/inventory-hit.test.ts` | TS2345×3 TS2322×1 TS2739×1 |
| 4 | `lib/seating/storefront-sector-catalog.test.ts` | TS2740×4 |
| 4 | `lib/inventory/capacity-budget.test.ts` | TS2741×4 |
| 4 | `lib/checkout/seat-hold-day.test.ts` | TS2353×4 |
| 3 | `lib/checkout/sellable-tickets.test.ts` | TS2353×3 |
| 2 | `lib/seating/storefront-selection.test.ts` | TS2740×2 |
| 2 | `lib/events/draft-seating-map-v2.test.ts` | TS2339×2 |
| 2 | `lib/events/draft-schedule-bindings.test.ts` | TS2339×2 |
| 2 | `lib/seating/venue-touch.test.ts` | TS2339×1 TS2345×1 |
| 2 | `lib/events/rehydrate-event-draft-v2.test.ts` | TS2571×1 TS2339×1 |
| 2 | `lib/events/sync-published-combo-items.test.ts` | TS2339×2 |
| 2 | `lib/events/editor-v2-ux.test.ts` | TS2345×2 |
| 1 | `lib/seating/venue-price-groups.test.ts` | TS2740×1 |
| 1 | `lib/admin/audience-csv.test.ts` | TS2322×1 |
| 1 | `lib/seating/studio-bulk-edit.test.ts` | TS2345×1 |
| 1 | `lib/inventory/capacity-thermometer.test.ts` | TS2322×1 |
| 1 | `lib/events/inventory-summary-v2.test.ts` | TS2353×1 |
| 1 | `lib/inventory/day-ticket-coverage.test.ts` | TS2339×1 |
| 1 | `lib/checkout/ticket-day-groups.test.ts` | TS2322×1 |
| 1 | `lib/seating/stabilize-venue-map-ids.test.ts` | TS2345×1 |

### 4.2 Qué significa cada código, y el patrón de arreglo

| Código | Significado | Arreglo típico |
| --- | --- | --- |
| TS2739 / TS2740 / TS2741 | Al fixture le faltan campos obligatorios | Completar los campos, o mejor: extraer una factory de fixtures con defaults y hacer que el test pase solo overrides |
| TS2353 | El fixture pasa una propiedad que el tipo no declara | Verificar si el campo se renombró en producción; el test puede estar validando un nombre viejo |
| TS2322 / TS2345 | El tipo del fixture no es asignable al parámetro | Suele resolverse con la misma factory |
| TS2339 | Se accede a una propiedad que no existe en el tipo (a veces `never`) | Estrechar la unión antes de acceder, o tipar la variable local |
| TS2352 | Cast entre tipos que no se solapan | Revisar si el cast sigue teniendo sentido; puede necesitar `as unknown as` o un fixture real |
| TS2571 | Se opera sobre un valor `unknown` | Estrechar con un type guard |

**Recomendación fuerte:** la mayoría de los errores viene de que cada archivo de test arma sus
propios fixtures a mano. Antes de arreglar 27 archivos uno por uno, conviene crear una factory
compartida (`lib/test-utils/fixtures.ts`) que construya un `EventFormValues` completo con defaults
y acepte un `Partial` de overrides. Tres de los archivos de `lib/inventory/` ya tienen esa
función `ticket()` copiada y pegada; unificarla resuelve varios errores de una.

### 4.3 Notas sobre `tsconfig.test.json`

Dos cosas de esa configuración no son obvias y conviene no "arreglarlas" sin entender por qué
están:

- **`exclude` está sobrescrito.** El `tsconfig.json` base excluye `**/*.test.ts` y `tests/**`, y
  como en TypeScript el `exclude` filtra al `include`, heredarlo haría que el proyecto resuelva a
  cero archivos y el chequeo pase en falso.
- **`incremental: false` y `target: ES2022`.** La base activa `incremental`, que cachea
  diagnósticos en un `.tsbuildinfo` y hace que el chequeo reporte resultados obsoletos después de
  cambiar la config. Y el `target: ES2017` de la base rechaza literales BigInt que son válidos en
  Node 20, donde corren los tests.

---

## 5. Bugs conocidos, priorizados

La lista completa está en la sección "Deuda y riesgos verificados" de cada manual. Acá va la
priorización sugerida. **Ninguno de estos está arreglado.**

### 5.1 Seguridad — mirar primero

| Ref | Qué pasa |
| --- | --- |
| `PAYMENTS.md` 11.5 | Una firma de webhook inválida devuelve HTTP 200 |
| `SERVER_ACTIONS.md` 8.6 | `registerPublicGuest` escribe `promoter_id` sin verificar propiedad |
| `AUTH.md` 9.5 | El login de organizador permite enumerar emails registrados |
| `AUTH.md` 9.8 | El allowlist de orígenes incluye todo `*.vercel.app` |
| `SERVER_ACTIONS.md` 5.1 | Cinco mutaciones sin autenticación |

### 5.2 Integridad de datos

| Ref | Qué pasa |
| --- | --- |
| `SERVER_ACTIONS.md` 8.1 | El guardado del mapa no es atómico: siete escrituras en cadena sin transacción |
| `PAYMENTS.md` 11.3 | Tickets que pueden quedarse en `pending_payment` |
| `DB_SCHEMA.md` 8.3 | Sin reintento automático ante deadlock |
| `DB_SCHEMA.md` 8.2 | El tope por identidad no se aplica (función vaciada) |
| `PAYMENTS.md` 11.1 | El QR se genera después del commit, y el mail puede adelantarse |

### 5.3 Menores y de consistencia

| Ref | Qué pasa |
| --- | --- |
| `PAYMENTS.md` 11.12 | Incoherencia menor de moneda en `MercadoPagoAdapter` |
| `SERVER_ACTIONS.md` 8.2 | `requireSuperAdmin` duplicado ocho veces, con deriva entre copias |
| `SERVER_ACTIONS.md` 8.3 | `ActionResult` existe y nadie lo usa |
| `AUTH.md` 9.10 | Conviven las rutas `/superadmin` y `/super-admin` |
| `DB_SCHEMA.md` 8.1 | `load-test.js` no ejerce el camino de producción (usa un RPC viejo) |
| `WALLET_SECURITY.md` §5 | Los extras comprados en checkout (`TP2.`) se rechazan en el escáner de barra |

### 5.4 Deuda dejada a propósito en el módulo de checkout

| Qué | Dónde | Por qué se dejó |
| --- | --- | --- |
| `loadEventServiceFeeRule` no tiene canal de error | `lib/modules/checkout/services/pricing.service.ts` | Si el `select` sobre `events` falla, cae en silencio a fees por defecto. El fallback parece intencional para tolerar drift de schema; hacerlo fallar duro rompería eventos donde las columnas todavía no existen. **Decisión de negocio pendiente.** |
| Dos Server Actions sin consumidor | `app/actions/checkout.ts` | `createComboReservation` (combos/bundles) y `createCheckoutPreference` (documentada como firma legacy) no tienen llamadores en el repo. Se conservaron por posible compatibilidad externa. Si se confirma que nadie las usa, borrarlas reduce superficie HTTP. |
| `HoldSeatSchema` y `pickExclusiveHoldRowForRequestedDay` | eliminados | Quedaron sin uso al borrar `holdSeat`. Están en el historial de git si hacen falta. |

---

## 6. Reglas no negociables

Estas no son preferencias de estilo. Romper cualquiera de las tres tiene consecuencias sobre datos
reales o dinero real.

1. **Nunca conectarse a la base de producción** desde local, ni con `supabase link`, ni con
   `supabase db push`, ni copiando su URL a `.env.local`. Detalle completo en `ONBOARDING.md`.
2. **Nunca exportar tipos ni constantes desde un archivo con `"use server"`.** Los archivos de
   Server Actions solo pueden exportar funciones `async`. Los tipos van en
   `lib/modules/checkout/types/` o equivalente.
3. **Nunca devolver objetos crudos de la base al cliente.** Ni IDs internos de pasarelas de pago,
   ni tokens, ni errores de Postgres sin filtrar. El patrón correcto está en
   `lib/modules/checkout/services/checkout.service.ts`.

Además, por el Code Freeze: no se toca la arquitectura del checkout, el flujo de pagos ni el motor
de mapas sin acuerdo previo por escrito.

---

## 7. Estructura del módulo de checkout

Es la parte del código que más cambió recientemente, así que vale un mapa. El flujo va de arriba
hacia abajo; ninguna capa de abajo importa a una de arriba.

```
app/actions/checkout.ts              ← Server Actions ("use server"), 13 exports async
  │                                    Solo valida y delega. Envuelve todo en try/catch.
  ▼
lib/modules/checkout/services/
  checkout.service.ts                ← Orquestador. Orden estricto:
  │                                    1) precios  2) reserva atómica  3) link de pago
  ├── pricing.service.ts             ← Cotización y ledger de fees
  ├── inventory.service.ts           ← Stock, fases, ventanas de venta, asientos
  ├── payment.service.ts             ← Pasarelas + compensación si falla el pago
  └── access.service.ts              ← Acceso al evento, sandbox, waiting room

lib/modules/checkout/types/          ← Tipos compartidos (sin "use server")
lib/modules/checkout/errors/         ← Mapeo de errores de RPC a mensajes de usuario
lib/modules/checkout/constants/      ← Mensajes de error compartidos
```

Dos invariantes que conviene no romper:

- Los servicios **no** llevan `"use server"`: son módulos puros de servidor, no Server Actions.
- Si falla la generación del link de pago (paso 3), `cleanupPendingOrder` libera la reserva del
  paso 2 vía el RPC `expire_abandoned_order`. Está cableado en todos los caminos de error. Si
  agregás un camino de salida nuevo después de la reserva, **tenés que llamarlo**.

---

## 8. Contacto y alcance

El detalle de qué está dentro y fuera del alcance del trabajo entrante está en el contrato
(`docs/legal/WORK_FOR_HIRE.md`). La confidencialidad sobre todo lo descrito en estos manuales está
cubierta por el NDA (`docs/legal/NDA.md`). Ambos son borradores pendientes de revisión legal.
