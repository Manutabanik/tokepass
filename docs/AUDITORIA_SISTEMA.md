# Auditoría completa del sistema TokePass

**Fecha:** 21 de julio de 2026  
**Proyecto:** TokePass — Plataforma de Boletería Digital  
**Versión del codebase:** 0.1.0  
**Estado general:** MVP de arquitectura avanzada — cimientos de producción listos; checkout y varios módulos operativos aún pendientes

---

## 1. Resumen ejecutivo

TokePass es una plataforma de ticketing digital construida con **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS 4**, **Shadcn UI (Base UI)** y **Supabase** (Auth + PostgreSQL + RLS).

El sistema está organizado en **tres superficies de producto**:

| Superficie | Ruta base | Público objetivo | Estado |
|---|---|---|---|
| **Storefront público** | `/`, `/events`, `/login`, `/register` | Compradores (customers) | Shell visual + auth; catálogo sin datos reales |
| **Command Center** | `/admin/*` | Organizadores (`admin`) y super admins | Auth + dashboard parcial + wizard de eventos (sin persistencia completa) |
| **Platform OS** | `/superadmin/*` | Dueño de la plataforma (`super_admin`) | Completo a nivel de lectura/gestión de roles |

### Qué ya funciona de punta a punta

1. Autenticación email/password (clientes y organizadores) + Google OAuth.
2. Creación automática de perfiles vía trigger de Postgres.
3. Registro de organizadores con promoción a rol `admin` (service role).
4. Protección de rutas `/admin` y `/superadmin` (proxy + layouts).
5. Esquema de base de datos omni-evento (venues, zonas, asientos, órdenes, RRPP, add-ons).
6. RPC `reserve_tickets` para reserva atómica de inventario.
7. Panel Platform OS con KPIs globales, organizaciones, usuarios (cambio de roles), eventos y órdenes.
8. Wizard de creación de eventos (UI + validación Zod); persistencia completa aún esqueleto.
9. Listado real de eventos del organizador en el dashboard admin.

### Qué aún no está implementado

1. Catálogo público conectado a la base de datos.
2. Checkout / carrito / pago (MercadoPago u otro).
3. Persistencia completa del wizard (`createCompleteEvent` no escribe a DB).
4. Módulos admin: Mis Eventos (lista), Venues, Finanzas, Equipo/RRPP, Escáner.
5. Página de “mis tickets” del comprador.
6. Landing post-login directa a `/superadmin` (hoy el login manda a `/admin` y se entra a Platform OS por enlace).

---

## 2. Stack tecnológico

### Runtime

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 16.2.10 | App Router, Server Components, Server Actions, Proxy |
| React / React DOM | 19.2.4 | UI |
| TypeScript | 5.x | Tipado estricto |
| Tailwind CSS | 4.x | Estilos |
| Zod | 4.4.3 | Validación de formularios y payloads |
| react-hook-form | 7.81 | Estado de formularios complejos |
| @hookform/resolvers | 5.4 | Bridge Zod ↔ RHF |
| @supabase/ssr | 0.12.3 | Clientes SSR con cookies |
| @supabase/supabase-js | 2.110.7 | Cliente admin (service role) |
| @base-ui/react | 1.6 | Primitivos Shadcn |
| lucide-react | 1.24 | Iconografía |
| class-variance-authority / clsx / tailwind-merge | — | Variantes y utilidades CSS |

### Scripts disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run start    # Servir build
npm run lint     # ESLint
```

No hay suite de tests automatizados todavía.

### Variables de entorno requeridas (`.env.example`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

| Variable | Dónde se usa | Crítica |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Todos los clientes Supabase | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente browser + SSR | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Registro organizador + Platform OS (bypass RLS) | Sí (solo servidor) |
| `NEXT_PUBLIC_SITE_URL` | Redirects OAuth / confirmación de email | Recomendada |

---

## 3. Arquitectura de carpetas

```
tokepass/
├── app/
│   ├── (public)/              # Storefront + auth de clientes y organizadores
│   ├── (admin)/               # Command Center del organizador
│   ├── (superadmin)/          # Platform OS (dueño de la plataforma)
│   ├── actions/               # Server Actions (auth, events, platform)
│   ├── auth/callback/         # Exchange OAuth / email confirm
│   ├── globals.css
│   └── layout.tsx             # Root layout (metadata, fuentes, idioma es)
├── components/
│   ├── admin/                 # Wizard de eventos
│   ├── shared/                # Navbars, sidebars, forms de auth
│   ├── superadmin/            # KPIs UI, badges, role manager, chart
│   └── ui/                    # Primitivos Shadcn
├── hooks/
│   └── use-auth.ts            # Hook cliente (existe, poco cableado)
├── lib/
│   ├── supabase/              # client, server, admin, middleware
│   ├── validations/           # Schemas Zod (event-form)
│   ├── format.ts              # Moneda, fechas, iniciales
│   └── utils.ts               # cn()
├── supabase/migrations/       # SQL: 00001, 00003, 00004
├── types/database.ts          # Tipos de dominio + Database genérico
├── proxy.ts                   # Entry de protección de sesión (Next 16)
├── package.json
└── .env.example
```

**Nota:** En Next.js 16 este proyecto usa `proxy.ts` (no un archivo `middleware.ts` en la raíz). La lógica de sesión vive en `lib/supabase/middleware.ts` y se invoca desde `proxy.ts`.

---

## 4. Modelo de roles y seguridad

### Roles (`user_role`)

| Rol | Descripción | Acceso |
|---|---|---|
| `customer` | Comprador final | Storefront, login/register estándar |
| `admin` | Organizador de eventos | `/admin/*` (Command Center) |
| `super_admin` | Dueño / operador de la plataforma | `/admin/*` + `/superadmin/*` |

### Cómo se asignan

1. **customer** — por defecto al registrarse (trigger `handle_new_user` en `auth.users`).
2. **admin** — en `/register-organizador` vía `signUpOrganizer`, que hace upsert con service role.
3. **super_admin** — **solo manual** en SQL (nunca expuesto en UI pública). Ejemplo:

```sql
update public.profiles
set role = 'super_admin'::public.user_role
where email = 'tu@email.com';
```

### Capas de protección

```
Request
  │
  ▼
proxy.ts → updateSession()
  │  • Refresca cookies de sesión (getUser)
  │  • /admin y /superadmin sin sesión → /login-organizador?next=...
  │  • /superadmin y rol ≠ super_admin → /admin o /
  │  • /admin y rol ∉ {admin, super_admin} → /
  ▼
Layout del route group
  │  • (admin)/layout.tsx revalida admin | super_admin
  │  • (superadmin)/layout.tsx revalida solo super_admin
  ▼
Server Actions sensibles
     • platform.ts: requireSuperAdmin() antes de usar service role
```

### Clientes Supabase

| Archivo | Clave | Contexto | Bypass RLS |
|---|---|---|---|
| `lib/supabase/client.ts` | Anon | Browser | No |
| `lib/supabase/server.ts` | Anon + cookies | Server Components / Actions | No |
| `lib/supabase/admin.ts` | Service Role | Solo servidor (`server-only`) | Sí |
| `lib/supabase/middleware.ts` | Anon + cookies request | Proxy | No |

---

## 5. Base de datos (Supabase / PostgreSQL)

### Migraciones existentes

| Archivo | Contenido |
|---|---|
| `00001_core_schema.sql` | Core MVP: enums, profiles, events, ticket_tiers, tickets, triggers, RLS, RPC `reserve_tickets` |
| `00003_omni_event_architecture.sql` | Venues, zonas, asientos, promoters, addons, orders, order_addons, `super_admin`, integridad y RLS ampliada |
| `00004_auth_profile_contingency.sql` | Trigger `handle_new_user` endurecido + backfill de perfiles faltantes |

> No existe migración `00002`. La numeración salta de 00001 a 00003 a propósito histórico del proyecto.

### Enums

| Enum | Valores |
|---|---|
| `event_status` | `draft`, `published`, `cancelled`, `completed` |
| `ticket_status` | `valid`, `scanned`, `revoked` |
| `user_role` | `customer`, `admin`, `super_admin` |
| `zone_type` | `general_admission`, `reserved_seating` |
| `seat_status` | `available`, `locked`, `sold` |

> `orders.status` en DB es **text** con check (`pending` \| `paid` \| `failed`), no un enum de Postgres. En TypeScript se modela como `OrderStatus`.

### Tablas y relaciones (visión)

```
auth.users
    │ 1:1
    ▼
profiles ──────────────────────────────┐
    │                                  │
    │ organizer_id                     │ buyer_id / owner_id
    ▼                                  │
venues ◄── events ──► ticket_tiers     │
              │              │         │
              │              ▼         │
         event_zones ◄── (zone_id)     │
              │                        │
              ▼                        │
            seats                      │
                                       │
events ──► promoters                   │
events ──► addons                      │
                                       │
orders ◄── profiles (buyer)            │
  │                                    │
  ├── tickets (order_id, seat_id) ─────┘
  └── order_addons
```

### RPC crítica: `reserve_tickets`

```
reserve_tickets(p_tier_id, p_owner_id, p_quantity)
```

1. `SELECT … FOR UPDATE` sobre el tier (evita race conditions).
2. Verifica stock: `(capacity - sold) >= quantity`.
3. Incrementa `sold`.
4. Inserta N tickets con QR único.
5. Retorna IDs de tickets.

**Estado:** existe en DB y tipada en TypeScript. **No hay UI ni Server Action de checkout que la invoque todavía.**

### Triggers relevantes

- `set_updated_at` en tablas principales.
- `handle_new_user` → inserta/upsert perfil `customer`.
- Validadores de integridad (venue del organizador, tier↔zona, ticket↔asiento).
- Sync de estado de asiento al vender/revocar ticket.

### RLS (resumen)

- **profiles:** cada usuario lee/actualiza el suyo; super_admin tiene acceso amplio.
- **events:** público lee `published`; organizador CRUD propios; super_admin ALL.
- **ticket_tiers / tickets:** lectura pública de published; organizador administra los suyos; dueño lee sus tickets.
- **venues / zones / seats / promoters / addons / orders:** políticas de ownership + super_admin.

---

## 6. Flujos de autenticación (cómo funcionan)

### 6.1 Comprador (customer)

```
/register  →  signUpWithEmail
                │
                ├─ supabase.auth.signUp (metadata: full_name)
                ├─ Trigger DB crea profiles.role = customer
                └─ Si hay sesión → redirect /
                   Si no → mensaje “confirmá tu email”

/login     →  signInWithEmail
                │
                ├─ signInWithPassword
                ├─ Lee profiles.role
                └─ admin|super_admin → /admin
                   customer → /

Google     →  signInWithGoogle → OAuth → /auth/callback
                └─ misma lógica de redirect por rol
```

### 6.2 Organizador (admin)

```
/register-organizador  →  signUpOrganizer
                │
                ├─ signUp (metadata: registration_type=organizer)
                ├─ Si email ya existía (sin identities) → error, NO promueve
                ├─ createAdminClient() upsert profiles.role = admin
                ├─ Si falla el perfil → borra el user de Auth (rollback)
                └─ Sesión → /admin | sino mensaje de confirmación

/login-organizador     →  signInWithEmail (misma action compartida)
                └─ redirect según rol
```

### 6.3 Super administrador

1. Se registra como organizador (o customer) primero.
2. Se promociona manualmente en SQL a `super_admin`.
3. Al loguearse aterriza en `/admin` (Command Center).
4. Desde el header ve el botón **Platform OS** → `/superadmin`.
5. El proxy y el layout de superadmin rechazan a cualquiera que no sea `super_admin`.

### 6.4 Logout

`signOut()` → limpia sesión Supabase → redirect `/`.

---

## 7. Inventario de rutas

### Público — `app/(public)/`

| Ruta | Archivo | Qué hace | Datos reales |
|---|---|---|---|
| `/` | `page.tsx` | Landing marketing con CTAs | Evento featured **hardcodeado** |
| `/events` | `events/page.tsx` | Shell del catálogo (+ query `q`) | **No consulta DB** |
| `/login` | `login/page.tsx` | AuthForms (login/register) | Sí (Auth) |
| `/register` | `register/page.tsx` | AuthForms en modo register | Sí (Auth) |
| `/login-organizador` | `login-organizador/page.tsx` | OrganizerAuthForm login | Sí |
| `/register-organizador` | `register-organizador/page.tsx` | OrganizerAuthForm register | Sí |

### Admin — `app/(admin)/admin/`

| Ruta | Qué hace | Estado |
|---|---|---|
| `/admin` | Dashboard Command Center | Eventos reales + KPIs **fake** |
| `/admin/events` | Lista de eventos | Placeholder |
| `/admin/events/create` | Wizard 4 pasos | UI completa; persistencia skeleton |
| `/admin/venues` | Recintos | Placeholder |
| `/admin/finances` | Finanzas | Placeholder |
| `/admin/team` | Equipo / RRPP | Placeholder |
| `/admin/scanner` | Escáner de puertas | Placeholder |

### Superadmin — `app/(superadmin)/superadmin/`

| Ruta | Qué hace | Estado |
|---|---|---|
| `/superadmin` | Overview: KPIs, chart 14 días, estados | **Producción (lectura)** |
| `/superadmin/organizations` | Organizadores + GMV / eventos | **Producción (lectura)** |
| `/superadmin/users` | Usuarios + cambio de roles | **Producción** |
| `/superadmin/events` | Cartelera global | **Producción (lectura)** |
| `/superadmin/orders` | Órdenes globales | **Producción (lectura)** |
| `/superadmin/settings` | Health de env + SQL promote | **Producción** |

### Auth

| Ruta | Qué hace |
|---|---|
| `/auth/callback` | Exchange de `code` → sesión; redirect por rol a `/admin` o `/` |

---

## 8. Server Actions — detalle

### `app/actions/auth.ts`

| Función | Descripción |
|---|---|
| `signUpWithEmail` | Alta de customer |
| `signUpOrganizer` | Alta de organizador + role `admin` vía service role |
| `signInWithEmail` | Login email/password + redirect por rol |
| `signInWithGoogle` | Inicia OAuth Google |
| `signOut` | Cierra sesión |

### `app/actions/events.ts`

| Función | Descripción | Persistencia |
|---|---|---|
| `getOrganizerEvents` | Lista eventos del usuario autenticado (+ venue) | Lectura real |
| `createEvent` | Inserta evento `draft` desde FormData | Escritura real (no usada por el wizard) |
| `createCompleteEvent` | Valida payload Zod del wizard | **Solo log** — no escribe DB |

### `app/actions/platform.ts`

Todas requieren `requireSuperAdmin()`:

| Función | Descripción |
|---|---|
| `getPlatformOverview` | Totales globales + serie de ingresos 14 días |
| `getOrganizations` | Organizadores con rollup de eventos/tickets/GMV |
| `getPlatformUsers` | Hasta 200 perfiles, búsqueda opcional |
| `getPlatformEvents` | Hasta 200 eventos con organizador |
| `getPlatformOrders` | Hasta 200 órdenes con comprador |
| `updateUserRole` | Cambia rol; bloquea auto-cambio |

**Cómo calcula GMV:** `sum(ticket_tiers.price * ticket_tiers.sold)`. Cuando el checkout empiece a poblar `orders`, los KPIs de órdenes se llenarán solos.

---

## 9. Componentes clave

### Shared

| Componente | Propósito |
|---|---|
| `brand-logo.tsx` | Logo TokePass |
| `public-navbar.tsx` | Nav pública (búsqueda, login/logout) |
| `auth-forms.tsx` | Formularios customer + Google |
| `organizer-auth-form.tsx` | Formularios organizador (dark) |
| `admin-sidebar.tsx` | Navegación Command Center |
| `superadmin-sidebar.tsx` | Navegación Platform OS |
| `admin-section-placeholder.tsx` | UI “próxima iteración” |

### Admin

| Componente | Propósito |
|---|---|
| `event-creation-wizard.tsx` | Wizard 4 pasos: Esencia → Arquitectura → Economía → Crecimiento |

Pasos del wizard:

1. **Esencia** — título, fecha, descripción, flyer (nombre de archivo local; sin upload a Storage).
2. **Arquitectura** — tipo de zona (GA vs asientos), nombre de venue, capacidad o filas×asientos.
3. **Economía** — tiers dinámicos (`useFieldArray`) + Smart Yield (time limit, bonus).
4. **Crecimiento** — switch RRPP + comisión; switch add-ons.

### Superadmin

| Componente | Propósito |
|---|---|
| `page-heading.tsx` | Encabezado de sección |
| `badges.tsx` | Badges de rol / estado evento / estado orden |
| `revenue-chart.tsx` | Barras CSS últimos 14 días |
| `user-role-manager.tsx` | Select + guardar rol (client) |

### UI (Shadcn)

`accordion`, `avatar`, `badge`, `button`, `card`, `form`, `input`, `label`, `select`, `separator`, `switch`, `table`, `tabs`, `textarea`.

---

## 10. Tipos TypeScript (`types/database.ts`)

### Enums TS

`UserRole`, `EventStatus`, `TicketStatus`, `ZoneType`, `SeatStatus`, `OrderStatus`

### Entidades

`Profile`, `Event`, `Venue`, `TicketTier`, `Ticket`, `EventZone`, `Seat`, `Promoter`, `Addon`, `Order`, `OrderAddon`

### Database genérico

Incluye `Tables` (Row/Insert/Update), `Functions.reserve_tickets`, `Enums`. Pensado para tipar los clientes Supabase.

---

## 11. Cómo funcionaría el sistema de punta a punta (diseño actual)

Aunque no todo esté cableado, el diseño implícito del producto es:

```
┌─────────────────────────────────────────────────────────────────┐
│                        COMPRADOR                                │
│  / → /events → (detalle evento) → checkout → reserve_tickets    │
│       → orders + tickets → QR → puerta (scanner)                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ publicado
┌─────────────────────────────────────────────────────────────────┐
│                      ORGANIZADOR                                │
│  /register-organizador → /admin                                 │
│  Wizard → venue + zones + seats + tiers + promoters + addons    │
│  Dashboard / Finanzas / Escáner / Equipo                        │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ gobierno
┌─────────────────────────────────────────────────────────────────┐
│                     SUPER ADMIN                                 │
│  Promote SQL → /superadmin                                      │
│  Overview GMV · Orgs · Users/Roles · Events · Orders · Settings │
└─────────────────────────────────────────────────────────────────┘
```

### Ciclo de vida de un evento (objetivo)

1. Organizador crea evento en wizard (draft).
2. Se persisten venue, zonas, asientos (si reserved), tiers, flags RRPP/add-ons.
3. Publica → `status = published`.
4. Aparece en catálogo público.
5. Comprador elige tier (y asiento si aplica).
6. Checkout crea `orders` + llama `reserve_tickets` (o flujo equivalente).
7. Pago confirma → `orders.status = paid`.
8. Ticket válido con QR; scanner del organizador marca `scanned`.
9. Platform OS ve GMV, órdenes y actividad global.

**Hoy el sistema está en los pasos 1 (parcial) y 9 (completo en lectura).** Los pasos 2–8 son el siguiente bloque de trabajo.

---

## 12. Matriz de madurez por módulo

| Módulo | % estimado | Notas |
|---|---|---|
| Infraestructura Next + Supabase clients | 95% | Listo |
| Auth customer / organizer / OAuth | 90% | Pequeña inconsistencia login redirect (`/login` vs `/login-organizador` en layouts) |
| Esquema DB + RLS + RPC | 90% | Listo; falta migraciones de pago / Storage |
| Platform OS (superadmin) | 85% | Lectura + roles; sin mutaciones de negocio |
| Command Center layout + sidebar | 80% | UI lista |
| Dashboard organizador | 50% | Eventos reales, métricas fake |
| Wizard creación de eventos | 60% | UI/validación ok; no persiste grafo |
| Catálogo público | 15% | Shell vacío |
| Checkout / pagos | 0% | Solo RPC de reserva en DB |
| Escáner | 0% | Placeholder |
| Finanzas / Team / Venues UI | 5% | Placeholders |
| Mis tickets (customer) | 0% | No existe |
| Tests automatizados | 0% | No hay |
| Storage (flyers) | 0% | Wizard solo guarda nombre de archivo |

**Madurez global estimada del MVP:** ~40–45% del producto completo de ticketing.

---

## 13. Deuda técnica y observaciones

1. **`createCompleteEvent` es skeleton** — el wizard da falsa sensación de “evento creado”. Hay que implementar la transacción real (venue → event → zones → seats → tiers → promoters/addons).
2. **KPIs del dashboard admin hardcodeados** — deben salir de queries del organizador.
3. **Home y `/events` sin datos** — desconectados de `events` published.
4. **Inconsistencia de redirect anónimo en admin layout** — usa `/login` mientras el proxy usa `/login-organizador`.
5. **Login no redirige a `/superadmin`** — por diseño actual; podría mejorarse leyendo rol y enviando al Platform OS.
6. **`hooks/use-auth.ts` poco usado** — la app confía más en Server Components.
7. **Sin tests** — riesgo al crecer checkout y RLS.
8. **Service role** — bien encapsulado en `admin.ts`, pero cualquier bug en `requireSuperAdmin` sería crítico; mantener esa frontera estricta.
9. **README desactualizado** — no documenta Platform OS ni `proxy.ts`.
10. **Flyer sin Storage** — falta bucket Supabase Storage + upload firmado.

---

## 14. Roadmap sugerido (próximas entregas)

### Fase A — Persistencia del evento (prioridad alta)

- Implementar `createCompleteEvent` atómico.
- Subida de flyer a Supabase Storage.
- Página `/admin/events` con listado real + estados.
- Publicar / despublicar evento.

### Fase B — Storefront real

- Catálogo `/events` desde DB (`status = published`).
- Página de detalle `/events/[id]`.
- Selección de tier / asiento.

### Fase C — Checkout

- Server Action que use `reserve_tickets`.
- Crear `orders` + tickets.
- Integración MercadoPago (o similar).
- Webhook de confirmación → `paid`.

### Fase D — Operación

- Escáner QR (actualizar `ticket_status`).
- Finanzas del organizador.
- Gestión de RRPP y add-ons.
- Mis tickets del comprador.

### Fase E — Hardening producción

- Tests (unit + e2e auth/RLS).
- Observabilidad / logs.
- Rate limiting en signup organizador.
- Auditoría de cambios de rol.
- CDN / optimización de imágenes.

---

## 15. Checklist de puesta en producción (estado actual)

| Requisito | Estado |
|---|---|
| Variables de entorno documentadas | ✅ |
| Auth segura con `getUser()` (no solo `getSession`) | ✅ |
| RLS habilitado en tablas core | ✅ |
| Service role solo en servidor | ✅ |
| Build de producción pasa (`next build`) | ✅ (verificado en desarrollo del Platform OS) |
| Panel de gobierno de plataforma | ✅ |
| Migraciones aplicadas en proyecto Supabase remoto | ⚠️ Verificar en cada entorno |
| Checkout / pagos | ❌ |
| Backup / monitoring | ❌ (fuera del repo) |
| Dominio + HTTPS + Site URL en Auth providers | ⚠️ Configuración de Supabase Dashboard |
| Google OAuth habilitado en Supabase | ⚠️ Configuración externa |

---

## 16. Mapa rápido de archivos críticos

| Archivo | Por qué importa |
|---|---|
| `proxy.ts` | Puerta de entrada de sesión |
| `lib/supabase/middleware.ts` | Reglas de acceso admin/superadmin |
| `lib/supabase/admin.ts` | Privilegio máximo del servidor |
| `app/actions/auth.ts` | Identidad y redirects |
| `app/actions/events.ts` | Eventos del organizador |
| `app/actions/platform.ts` | Gobierno de plataforma |
| `types/database.ts` | Contrato de dominio |
| `supabase/migrations/00001_*.sql` | Fundación DB |
| `supabase/migrations/00003_*.sql` | Arquitectura omni-evento |
| `supabase/migrations/00004_*.sql` | Contingencia de perfiles |
| `components/admin/event-creation-wizard.tsx` | UX de creación |
| `app/(superadmin)/layout.tsx` | Guardián Platform OS |

---

## 17. Conclusión

TokePass ya tiene **cimientos de producción serios**:

- Tres paneles claros (público, organizador, plataforma).
- Auth multi-rol con defensa en profundidad.
- Esquema de base de datos listo para eventos complejos (GA, numerados, RRPP, add-ons, órdenes).
- Platform OS operativo para gobernar usuarios y ver métricas globales.

Lo que falta para un producto de ticketing “cerrado” es principalmente el **camino comercial**:

> Persistencia completa del evento → catálogo público → checkout/pago → tickets del comprador → escáner.

Con esos bloques, el resto del sistema (roles, RLS, Platform OS, RPC de inventario) ya está preparado para soportar la operación.

---

*Documento generado automáticamente a partir del estado del repositorio TokePass. No inventa features: refleja solo lo presente en el código y las migraciones al momento de la auditoría.*
