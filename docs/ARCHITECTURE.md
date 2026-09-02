# Arquitectura de TokePass

Plataforma de boletería digital (B2C + panel de organizadores + operación en puerta)
construida sobre Next.js 16 con App Router y Supabase como backend.

---

## 1. Stack tecnológico principal

### Framework y runtime

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Framework | **Next.js 16.2** (App Router) | Server Components por defecto, Server Actions para mutaciones |
| UI | **React 19.2** | `react-dom` 19.2, Suspense en el layout raíz |
| Lenguaje | **TypeScript 5** | `strict`, alias de import `@/*` |
| Runtime | **Node.js ≥ 20.9** + Edge runtime | El interceptor de red corre en Edge |
| Hosting | **Vercel** | `poweredByHeader: false`, headers de seguridad en `next.config.ts` |

### Datos y autenticación

- **Supabase** (Postgres + Auth + Storage + Realtime).
  - `@supabase/ssr` para clientes conscientes de cookies (browser / server / edge).
  - `@supabase/supabase-js` para el cliente *service role*.
  - Row Level Security habilitado a nivel de tabla; el esquema vive en `supabase/migrations/`.
- **Upstash Redis** + `@upstash/ratelimit` para rate limiting distribuido y sala de espera.
- **jose** para verificación de JWT (incluye chequeos de AAL/MFA).

### Pagos y fulfillment

- **Mercado Pago** (`mercadopago`) como gateway principal, con webhooks adicionales
  para Payway y NaranjaX.
- **Resend** + **React Email** (`emails/`, `components/emails/`) para correos transaccionales.
- **@react-pdf/renderer** y **qrcode** para PDF de entradas y códigos QR.
- **passkit-generator** para Apple Wallet; ruta propia para Google Wallet.

### Presentación

- **Tailwind CSS 4** (`@tailwindcss/postcss`) + **shadcn/ui** sobre **Base UI**,
  con `class-variance-authority`, `clsx` y `tailwind-merge`.
- **motion** para animación, **next-themes** para tema claro/oscuro, **sonner** para toasts.
- **Recharts** (dashboards), **Leaflet / react-leaflet** (mapas de venue y geolocalización),
  **react-virtuoso** (listas largas), **react-zoom-pan-pinch** (mapas de butacas),
  **@yudiel/react-qr-scanner** (escaneo en puerta).

### Estado de cliente

- **Zustand** (`lib/stores/`) para estado compartido de checkout, carrito y storefront.
- **React Hook Form** + **Zod** (vía `@hookform/resolvers`) para formularios y validación.

### Observabilidad y calidad

- **Sentry** (`@sentry/nextjs`, `instrumentation.ts`, `instrumentation-client.ts`).
- **Playwright** para E2E (`tests/e2e/`), runner propio de unit tests
  (`scripts/run-unit-tests.mjs`, tests colocados como `*.test.ts`).
- **k6** (`load-test.js`) con escenarios de smoke, colisión y spike.
- **ESLint 9** con `--max-warnings 0`; `prebuild` valida variables de entorno de producción.

---

## 2. Patrón de diseño utilizado

TokePass no sigue un patrón único de libro, sino una combinación deliberada:

### 2.1 Server-first con Server Actions (RPC tipado)

El patrón dominante es **Server Components para lectura + Server Actions para escritura**.
No existe una capa REST interna para el producto: `app/actions/` concentra ~70 módulos de
acciones (`checkout.ts`, `events.ts`, `scanner.ts`, `payouts.ts`, …) que actúan como la
frontera de aplicación. Las rutas en `app/api/` se reservan para lo que *debe* ser HTTP:
webhooks de pago, cron jobs, generación de PDF/wallet, y endpoints consumidos por hardware
de escaneo.

### 2.2 Contrato uniforme de resultado

Toda mutación devuelve un `ActionResult<T>` discriminado en lugar de lanzar excepciones
hacia la UI:

```ts
// lib/action-result.ts
export function ok<T>(data?: T) {
  if (arguments.length === 0) return { success: true as const }
  return { success: true as const, data }
}

export function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}
```

### 2.3 Separación por capas dentro de `lib/`

`lib/` funciona como capa de dominio y servicios, agrupada por *bounded context*
(`checkout/`, `inventory/`, `pricing/`, `seating/`, `scanner/`, `finance/`, `wallet/`,
`waiting-room/`, …). Las Server Actions orquestan; `lib/` contiene las reglas de negocio
puras, lo que permite testearlas con unit tests colocados sin levantar Next.

Sobre esa base opera una segunda estrategia, más estricta, reservada para los contextos que
crecieron demasiado: **módulos de dominio en capas** bajo `lib/modules/`. El primero, y hoy
único, es `lib/modules/checkout/`, resultado de descomponer un archivo de Server Actions de
~4.980 líneas que concentraba tipos, cálculo de precios, reserva de inventario, pasarelas de
pago y orquestación en un mismo lugar.

La diferencia con `lib/checkout/` no es cosmética. `lib/checkout/` agrupa helpers puros por
tema y sus archivos se importan libremente entre sí; `lib/modules/checkout/` impone una
**dirección de dependencia**. Las capas se ordenan de afuera hacia adentro, y ninguna capa
interior importa a una exterior:

```
app/actions/checkout.ts                      Fachada · "use server" · 13 acciones
        │
        │  la compra completa                    las otras 12 acciones
        │  (startCheckoutWithPayment)             (holds de butaca, lockTickets, …)
        ▼                                                       │
services/checkout.service.ts   ── orquesta ──┐                  │
        │                                    │                  │
        ├──▶ services/pricing.service.ts     │                  │
        ├──▶ services/inventory.service.ts ◀─┴──────────────────┤
        ├──▶ services/payment.service.ts                        │
        └──▶ services/access.service.ts    ◀────────────────────┘
                    │
                    ▼
        types/ · errors/ · constants/            Núcleo sin dependencias
```

Dos detalles que el diagrama hace explícitos y conviene no perder de vista. El primero es que
**ningún servicio importa a otro servicio, con la única excepción del orquestador**: `pricing`,
`inventory`, `payment` y `access` son hermanos que no se conocen entre sí, y es eso lo que
permite razonar sobre cada uno por separado. El segundo es que la fachada no siempre pasa por el
orquestador: sólo la compra completa lo hace, mientras que las otras doce acciones —holds de
butaca, `lockTickets`, liberación de reservas— llaman a `inventory` y `access` directamente,
porque no son casos de uso transaccionales de varios pasos.

Cuatro reglas sostienen el patrón, y romperlas es lo que degradaría el módulo de nuevo a un
God File:

1. **Sólo la fachada lleva `"use server"`.** Los servicios son módulos puros de servidor, no
   Server Actions. Si un servicio recibiera la directiva, cada función exportada se
   convertiría en un endpoint HTTP invocable.
2. **El cliente con RLS se inyecta; el privilegiado se crea explícito y local.** Los servicios
   reciben un `CheckoutSupabase` por parámetro para operar con los permisos del comprador, de
   modo que RLS siga aplicando y las funciones sean testeables. Cuando una operación
   legítimamente necesita saltear RLS —la reserva atómica, el ledger de comisiones, la
   contabilidad de idempotencia— el servicio construye un cliente `service_role` en el punto
   exacto de uso con `createAdminClient()`, en lugar de recibirlo. Ver un `createAdminClient()`
   dentro de un servicio es intencional, no una fuga: la excepción es `access.service.ts`, que
   no recibe cliente alguno porque toda su función es resolver visibilidad con privilegios
   elevados antes de que exista un contexto de comprador.
3. **El orquestador respeta un orden fijo**: cotizar precios → reservar stock atómicamente →
   generar el link de pago. Invertirlo produciría sobreventa o cobros sin reserva.
4. **El núcleo no conoce a nadie.** `types/`, `errors/` y `constants/` no importan servicios,
   por lo que pueden ser consumidos desde cualquier capa sin arrastrar dependencias.

### 2.4 Aislamiento por audiencia vía Route Groups

Cada audiencia vive en un route group con su propio layout, `error.tsx` y chrome:
`(public)`, `(admin)`, `(superadmin)`, `(promoter)`, `(door)`, `(offline)`. Esto permite que
un mismo dominio sirva storefront, back-office y operación en puerta sin mezclar
dependencias de cliente ni navegación.

### 2.5 Interceptor Edge como *chain of responsibility*

`proxy.ts` delega en `lib/edge/handle-request.ts`, que aplica filtros en orden:
bypass de rutas exentas → rate limit por IP → puerta de sala de espera → refresco de sesión
y autorización. Cada paso puede cortar la cadena devolviendo su propia respuesta.

### 2.6 Defensa en profundidad

La autorización se verifica en tres niveles independientes: el interceptor Edge (redirecciones
tempranas), cada Server Action / route handler (revalidación del actor), y RLS en Postgres
(última línea). El CSP se emite por request con nonce criptográfico
(`lib/security/csp.ts`), consumido por el layout raíz a través del header `x-nonce`.

### 2.7 Offline-first en operación

Los flujos de puerta y billetera degradan a almacenamiento local
(`lib/offline-store.ts`, `lib/offline-scanner-store.ts`, `lib/totp-offline.ts`,
route group `(offline)`) más PWA con service worker, porque la validación en puerta ocurre
en entornos sin conectividad garantizada.

---

## 3. Estructura de carpetas

```
tokepass/
├── app/                  Rutas, layouts y frontera de aplicación (App Router)
├── components/           Componentes de UI (agrupados por audiencia + primitivas)
├── lib/                  Lógica de dominio, servicios e integraciones
├── hooks/                Hooks de React reutilizables (cliente)
├── types/                Tipos compartidos (incluye el esquema de la base)
├── utils/                Utilidades algorítmicas puras
├── emails/               Plantillas de email (React Email)
├── supabase/             Migraciones SQL y configuración del proyecto Supabase
├── tests/                Suites end-to-end (Playwright)
├── scripts/              Scripts de build, validación y generación de assets
├── public/               Assets estáticos, iconos PWA, service worker
├── docs/                 Documentación de arquitectura, escalado y auditoría
├── proxy.ts              Interceptor Edge global (ex `middleware.ts`)
├── next.config.ts        Config de Next: headers, redirects, rewrites, Sentry
└── instrumentation*.ts   Inicialización de Sentry (server y client)
```

### 3.1 `app/` — rutas y frontera de aplicación

| Directorio | Propósito |
| --- | --- |
| `app/(public)/` | Storefront B2C: home, `/eventos`, ficha de evento, checkout, portal `/cuenta`, login/registro, legales |
| `app/(admin)/` | Panel del organizador: eventos, editor v2, finanzas, payouts, POS, escáneres, equipo, venues |
| `app/(superadmin)/` | Back-office de plataforma: organizaciones, liquidaciones, auditoría, soporte, settings globales (existe además `(super-admin)/` con el prefijo de URL heredado) |
| `app/(promoter)/` | Panel de RRPP / promotores y su dashboard de ventas referidas |
| `app/(door)/` | Operación en puerta (`/puerta`, `/puerta/escanear`), UI optimizada para móvil y baja luz |
| `app/(offline)/` | Fallback sin conectividad (billetera offline, error boundary propio) |
| `app/actions/` | **Server Actions**: toda la escritura y la lectura autorizada del producto |
| `app/api/` | Route handlers HTTP: webhooks de pago, cron, wallet/PDF, endpoints de escáner, OG images, proxy de tiles y de imágenes |
| `app/auth/callback/` | Intercambio de código OAuth / verificación de OTP por email |
| `app/event/[id]/` | Rutas internas de checkout y sala de espera (expuestas vía rewrites en `/events/:id/*`) |
| `app/layout.tsx` | Layout raíz: fuentes, tema, PWA, referidos, guardas globales, `Toaster` |
| `app/manifest.ts`, `robots.ts`, `sitemap.ts` | Metadata generada (PWA y SEO) |

Los route groups no aparecen en la URL: son un mecanismo de organización y de
layouts independientes.

### 3.2 `components/` — capa de presentación

Agrupada por audiencia y no por tipo de componente: `public/`, `account/`, `admin/`,
`superadmin/`, `promoter/`, `door/`, `checkout/`, `b2c/` (selección de butacas),
`venue/` (editor de mapas), `waiting-room/`, `print/`, `emails/`.
Transversales: `ui/` (primitivas shadcn/Base UI), `layout/`, `navigation/`,
`providers/`, `shared/`, `errors/`, `pwa/`, `auth/`, `legal/`, `discovery/`.

### 3.3 `lib/` — dominio, servicios e infraestructura

| Subdirectorio | Propósito |
| --- | --- |
| `supabase/` | Fábricas de cliente: `client.ts` (browser), `server.ts` (RSC/actions), `admin.ts` (service role), `middleware.ts` (Edge), `pooler.ts` (SQL directo) |
| `auth/` | Destinos post-login, paths seguros contra open redirect, cookies de sesión, AAL2/MFA, vinculación de dispositivo de billetera |
| `edge/` | Composición del interceptor Edge |
| `security/` | CSP con nonce, rate limiting distribuido, límites de checkout |
| `waiting-room/` | Sala de espera / cola virtual y cookies VIP de admisión |
| `checkout/`, `payments/`, `mercadopago/`, `money/`, `pricing/`, `finance/` | Compra, gateways, aritmética monetaria, fees y liquidaciones |
| `inventory/`, `seating/`, `venues/`, `maps/` | Stock, holds de butacas, mapas de venue y geometría |
| `tickets/`, `wallet/`, `pdf/`, `scanner/` | Emisión, passes de wallet, PDF y validación de accesos |
| `events/`, `catalog/`, `storefront/`, `store/`, `seo/` | Modelo de evento, catálogo público y metadata |
| `notifications/`, `email/`, `analytics/`, `sentry/`, `ops/` | Comunicaciones, telemetría y operación |
| `modules/` | **Módulos de dominio en capas** (DDD). Contiene `checkout/`; ver 3.3.1 |
| `stores/` | Stores de Zustand (checkout, carrito, chrome, runtime PWA) |
| `services/` | Servicios de aplicación e integraciones salientes |
| `validations/`, `errors/`, `utils/`, `time/`, `constants/` | Esquemas Zod, errores tipados y helpers transversales |
| `realtime/`, `resilience/` | Suscripciones Realtime, reintentos y degradación |

En la raíz de `lib/` viven además módulos de dominio de un solo archivo con su test
colocado (`pos-checkout.ts`, `resale.ts`, `referral.ts`, `scan-payload.ts`,
`checkout-hold.ts`, `logger.ts`, …).

#### 3.3.1 `lib/modules/checkout/` — el módulo en capas

Es la implementación concreta del patrón descripto en 2.3, y el único módulo de este tipo hasta
hoy. Los tamaños dan una idea de dónde está la complejidad real del negocio:

```
lib/modules/checkout/
├── services/                      Lógica de negocio, una responsabilidad por archivo
│   ├── checkout.service.ts        1.729  Orquestador del caso de uso completo
│   ├── inventory.service.ts         586  Stock, fases, ventanas de venta, asientos
│   ├── access.service.ts            236  Acceso al evento, sandbox, sala de espera
│   ├── pricing.service.ts           197  Cotización server-side y ledger de comisiones
│   └── payment.service.ts           189  Sesión de pago y compensación
├── types/
│   └── checkout.types.ts            143  Tipos del dominio (14 definiciones)
├── errors/
│   └── map-reserve-error.ts         159  Errores de RPC → mensajes de usuario
└── constants/
    └── checkout-errors.ts             8  Mensajes de error compartidos
```

**`services/` — la capa de dominio.** Cada archivo cubre una responsabilidad y ninguno conoce
a la fachada:

| Servicio | Responsabilidad | Qué NO hace |
| --- | --- | --- |
| `checkout.service.ts` | Orquesta el caso de uso: valida el contexto, aplica las guardas de negocio y encadena los demás servicios en el orden correcto. Es el único que conoce a los otros cuatro | No habla directamente con la pasarela de pago ni calcula precios por sí mismo |
| `inventory.service.ts` | Reserva atómica de stock, fases de venta y su rollover, ventanas de venta, resolución de ids del mapa a unidades de butaca | No decide precios ni abre sesiones de pago |
| `pricing.service.ts` | Cotización server-side bajo el modelo All-In, resolución de la regla de comisiones del evento y persistencia del ledger de fees | No reserva stock; el precio se calcula **antes** de tocar inventario |
| `payment.service.ts` | Construye el payload de la pasarela, abre la sesión de pago y **compensa** liberando la reserva si el pago falla | No conoce las reglas de inventario: recibe la orden ya creada |
| `access.service.ts` | Resuelve si la compra es real o de prueba (`useSandbox`), valida la sala de espera y migra holds de invitado al comprador autenticado | No muta inventario ni dinero |

**`types/` — el núcleo tipado.** Un solo archivo con las 14 definiciones que cruzan capas
(`CheckoutResult`, `CheckoutSupabase`, `ReserveTxRow`, `HoldOwner`, `LockTicketsResult`, …).
Importa todo con `import type`, de modo que se borra por completo en tiempo de ejecución y no
arrastra dependencias de servidor hacia quien lo consuma.

**`errors/` y `constants/` — traducción y vocabulario.** `map-reserve-error.ts` traduce los
códigos crudos que devuelven los RPC transaccionales de Postgres a mensajes accionables para el
comprador, y es la razón por la que un error de concurrencia no llega al cliente como un
volcado de Postgres. `checkout-errors.ts` centraliza los tres mensajes compartidos entre
capas, para que la fachada y los servicios no rediverjan en su redacción.

> **Sobre los esquemas Zod: no hay una subcarpeta `schemas/` en el módulo, y es a propósito.**
> Los esquemas de validación del checkout viven en `lib/validations/checkout.ts`
> (`CheckoutPayloadSchema`, `CheckoutSeatHoldSchema`, `formatCheckoutPayloadError`, …) porque
> los consume tanto el servidor como el **cliente**: `components/checkout/CheckoutTunnel.tsx`
> es un componente `"use client"` que importa de ahí para validar el formulario antes de
> enviarlo. Mover esos esquemas dentro de un módulo server-only rompería ese uso compartido y
> duplicaría la definición de la validación, que es justamente lo que Zod evita. Es la
> excepción deliberada a la regla de que todo el dominio del checkout vive en `lib/modules/`.

### 3.4 Otros directorios

- **`hooks/`** — hooks de cliente: realtime de ocupación y holds (`use-seat-holds-realtime`),
  autoguardado (`use-debounced-autosave`), escaneo (`use-totem-scanner`),
  instalación PWA, media queries, wake lock.
- **`types/`** — `database.ts` (tipos generados de Supabase, base de todos los clientes
  tipados), `auth.ts` (roles de staff y allowlist de rutas), y tipos de eventos,
  tickets, venues y mapas.
- **`utils/`** — algoritmos puros sin dependencias de framework (`seat-allocation.ts`).
- **`supabase/migrations/`** — fuente de verdad del esquema: tablas, RLS, funciones RPC
  (`claim_active_wallet_device`, holds de butacas, turnos de POS, liquidaciones).
- **`scripts/`** — `check-production-env.mjs` (corre en `prebuild` y aborta si falta
  configuración), `run-unit-tests.mjs`, `generate-pwa-icons.mjs`.

---

## 4. Flujo de autenticación general

### 4.1 Modelo de identidad y roles

La autenticación es de **Supabase Auth**; la autorización se resuelve en Postgres:

- **`profiles.role`** — rol global: `customer` | `admin` (organizador) | `super_admin`.
- **`profiles.organizer_approval_status`** — ciclo de vida del organizador:
  `pending` | `approved` | `rejected` | `suspended`.
- **`event_staff_assignments`** — capacidades **por evento** para operación:
  `door_staff`, `bar_staff`, `cashier`, con `is_active` y `expires_at`.

Las rutas que cada rol de staff puede abrir están declaradas como allowlist en
`types/auth.ts` (`DOOR_STAFF_ROUTES`, `BAR_STAFF_ROUTES`, `CASHIER_POS_ROUTES`), no
inferidas de la URL.

### 4.2 Métodos de ingreso

Todos implementados como Server Actions en `app/actions/auth.ts`, con rate limit por IP
antes de tocar Supabase:

1. **Email + contraseña** (`signInWithEmail`) — mínimo 8 caracteres; el formulario de
   organizador (`loginSource=organizer`) promueve el perfil a `admin` en estado `pending`
   si aún era `customer`.
2. **Magic link + OTP de 6 dígitos** (`signInWithMagicLink` / `verifyEmailOtp`) — se envían
   juntos para que el usuario pueda continuar en el mismo dispositivo o en otro.
3. **Google OAuth** (`signInWithGoogle`) — con `prompt=select_account`.
4. **Accesos sin cuenta** — tokens de invitado (`/entrada/invitado/[guestToken]`,
   `/claim/[token]`) y gate por OTP para compras de invitado.

### 4.3 Callback y destino post-login

`app/auth/callback/route.ts` es el único punto que materializa la sesión desde un enlace:

1. Intercambia `code` por sesión (`exchangeCodeForSession`) o verifica `token_hash`
   contra los tipos de OTP permitidos.
2. Revalida el usuario con `supabase.auth.getUser()`.
3. Lee el rol **fresco desde Postgres** con el cliente service role
   (`getFreshLoginProfile`): los claims del JWT nunca deciden el destino, porque un cambio
   de rol debe surtir efecto sin esperar la rotación del token.
4. Vincula el **dispositivo de billetera**: resuelve o genera un `deviceId`, lo guarda en
   cookie y llama a la RPC `claim_active_wallet_device` — así una entrada queda atada a un
   único dispositivo activo y se corta la reventa por compartir credenciales.
5. Redirige a `resolveAuthCallbackDestination(next, role)`: respeta el `next` si es un path
   interno seguro, y si no, `/superadmin` → `/admin` → `/` según rol.

El `next` se sanitiza siempre con `safeInternalNextPath`, que rechaza rutas
protocolo-relativas, absolutas y con backslashes (protección contra open redirect).

### 4.4 Sesión y guardas en cada request

`proxy.ts` (Edge, ex `middleware.ts`) corre en todas las rutas salvo estáticos e imágenes
y delega en `lib/edge/handle-request.ts`:

1. Bypass de rutas exentas de refresco de sesión.
2. Rate limit de checkout por IP (Upstash) → `429`.
3. Puerta de sala de espera: puede bloquear o admitir con cookie VIP.
4. `updateSession` (`lib/supabase/middleware.ts`), que hace el trabajo de sesión y acceso:
   - Emite CSP con nonce nuevo y lo propaga como header `x-nonce`.
   - Captura códigos de referido (`?rrpp` / `?ref`) en cookies.
   - Resuelve redirects 308 de rutas legacy (`/my-tickets` → `/cuenta/entradas`).
   - Purga cookies de sesión corruptas cuando `/login` llega con determinados errores.
   - Refresca la sesión con **`supabase.auth.getUser()`** — que valida el token contra
     Supabase Auth, a diferencia de `getSession()`.
   - Autoriza rutas protegidas y propaga las cookies refrescadas incluso en los redirects.

Cookies de sesión: `sameSite=lax` y `secure` en HTTPS o en Vercel.

### 4.5 Matriz de acceso en el interceptor

| Zona de rutas | Sin sesión | Con sesión |
| --- | --- | --- |
| `/superadmin`, `/super-admin` | → `/login-organizador?next=…` | exige `super_admin`; si no, `/admin` o `/` |
| `/admin/**` | → `/login-organizador?next=…` | `admin` / `super_admin` pasan; el resto solo si tiene staff activo **y** la ruta está en su allowlist, si no → su home de staff |
| POS (`/admin/pos`, `/dashboard/pos`) | → `/login-organizador?next=…` | `admin` / `super_admin`, o staff con rol de caja |
| `/promoter/**`, `/rrpp/**` | → `/login?next=…` | acceso de promotor |
| `/cuenta/**` y storefront | público / gate en la página | portal del comprador |

Los roles de staff se leen filtrando por `is_active` y descartando asignaciones vencidas
(`expires_at`), así que revocar acceso a un evento es inmediato.

### 4.6 Refuerzos en el cliente

El layout raíz monta guardas que corrigen estados inconsistentes sin depender del
interceptor: `WalletDeviceBootstrap` (asegura el `deviceId` del dispositivo),
`wallet-device-mismatch-logout` (cierra sesión si la entrada se abre en otro dispositivo),
`login-error-session-purge` y `CheckoutHoldGuard` (libera holds de butacas al abandonar
el checkout).

---

## 5. Referencias

- `docs/SCALING_GUIDE.md` — estrategia de escalado y resultados de carga (k6).
- `docs/AUDITORIA_SISTEMA.md` — auditoría funcional del sistema.
- `AUDITORIA_PLATAFORMA.md`, `AUDITORIA_ESTADO_ACTUAL.md` — estado y hallazgos de plataforma.
- `AGENTS.md` — convenciones para trabajar sobre este repo.
