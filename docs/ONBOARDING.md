# Onboarding — Manual de supervivencia

Guía para pasar de un clone limpio a un entorno local funcionando, y para no romper nada
mientras aprendés el código. Leela completa antes del primer commit: la sección 5 no es
opcional.

**Regla que resume todo el documento:** tu `.env.local` nunca apunta a la base de datos de
producción. Ni "un ratito para ver una tabla". Nunca.

---

## 0. Requisitos previos

| Herramienta | Versión | Verificación |
| --- | --- | --- |
| Node.js | **≥ 20.9.0** (`engines` de `package.json`) | `node -v` |
| npm | ≥ 10 | `npm -v` |
| Git | cualquiera reciente | `git --version` |
| Cuenta de Supabase | plan free alcanza | — |
| Cuenta de Mercado Pago | credenciales de **prueba** | — |

CI corre en Node 20; local conviene Node 20 o 22 LTS. Si usás una versión más nueva y algo
falla solo en tu máquina, empezá por ahí.

Lo que **no** hace falta: Docker, Postgres local, ni la CLI de Supabase para el arranque
básico (ver §3.1).

---

## 1. Clonar e instalar

```bash
git clone <url-del-repo> tokepass
cd tokepass
npm install
```

`npm install` respeta los `overrides` de `package.json` (`postcss` 8.5.25, `sharp` 0.35.3).
Si tenés que forzar algo, **no** uses `--force` ni `--legacy-peer-deps` sin preguntar: esos
pins están fijos por incompatibilidades conocidas.

Instalá también los navegadores de Playwright si vas a tocar E2E:

```bash
npx playwright install chromium
```

---

## 2. Variables de entorno

### 2.1 Crear el archivo

```bash
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
```

`.gitignore` ignora `.env*` con una única excepción (`!.env.example`), así que `.env.local`
nunca se sube. **No cambies esa regla.** Si necesitás documentar una variable nueva, agregá
la clave con un placeholder a `.env.example`, nunca el valor real.

### 2.2 Lo mínimo para que arranque

Con estas cinco alcanza para levantar el servidor, navegar el catálogo y loguearte:

| Variable | De dónde sale | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Va al browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | misma pantalla, clave `anon` | Va al browser; protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | misma pantalla, clave `service_role` | **Solo servidor.** Ver §5.3 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` en local | Sin path final |
| `MERCADOPAGO_ACCESS_TOKEN` | MP → Credenciales de **prueba** | Tiene que empezar con `TEST-` |

Los secretos que en producción son obligatorios (`GUEST_TICKET_SECRET`,
`CHECKOUT_FULFILLMENT_SECRET`, `CRON_SECRET`, `WAITING_ROOM_SECRET`) en local pueden quedar
con el placeholder, salvo que trabajes en checkout de invitado, PIN de puerta, cron o sala de
espera. Generá uno cuando lo necesites:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.3 El prefijo `NEXT_PUBLIC_` es una decisión de seguridad

Todo lo que empieza con `NEXT_PUBLIC_` **se inlinea en el bundle del browser** y es público,
para siempre, para cualquiera que abra DevTools.

- La clave `anon` lleva el prefijo a propósito: es pública por diseño y toda su seguridad
  depende de **RLS** en Postgres.
- La clave `service_role` **bypassea RLS por completo**. Si alguna vez ves un
  `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` en un diff, es un incidente de seguridad, no un
  typo. Rechazá el PR.

`lib/supabase/admin.ts` abre con `import "server-only"` justamente para que ese módulo falle
en build si alguien lo importa desde un componente cliente.

### 2.4 Bloques opcionales

Están todos documentados inline en `.env.example`. Activá solo el que necesites:

| Bloque | Cuándo activarlo | Comportamiento sin él |
| --- | --- | --- |
| `UPSTASH_REDIS_*` | Rate limiting, sala de espera | Local: se saltea. **Producción: fail-closed**, el checkout rechaza todo |
| `RESEND_API_KEY` | Envío de emails | No se manda nada |
| `NEXT_PUBLIC_SENTRY_DSN` | Debug de errores en cliente | Sin telemetría |
| `TURNSTILE_*` / `RECAPTCHA_*` | Captcha en checkout | Local: no se pide. Producción: obligatorio |
| `APPLE_PASS_*` / `GOOGLE_WALLET_*` | Passes nativos | Botones ocultos por flag |
| `GOBI_WEBHOOK_*` | WhatsApp oficial | Sin notificaciones |
| `SPOTIFY_CLIENT_*` | Enriquecer artistas | Sin datos de Spotify |
| `E2E_*` | Playwright | Corre contra `localhost:3000` |
| `K6_*` | Pruebas de carga | `npm run load:*` no arranca |

Dos que sirven para probar features localmente sin adivinar:

```bash
MAX_CONCURRENT_USERS=0   # fuerza la sala de espera en /event/[id]/queue
NEXT_PUBLIC_PWA=1        # habilita la PWA (en prod se activa sola)
```

---

## 3. Tu propia base de datos

### 3.1 No hay stack local, y es importante entender por qué

El repo **no tiene `supabase/config.toml`**, así que `supabase start` no levanta nada. Lo que
hay es `supabase/migrations/` con **239 archivos SQL** que definen todo el esquema: tablas,
RLS, funciones y RPCs transaccionales como `reserve_tickets_tx` o `redeem_item`.

Consecuencia práctica: **cada dev trabaja contra su propio proyecto Supabase remoto.** No
existe un "localhost de la base". Y de ahí sale el riesgo central de este proyecto: la única
diferencia entre tu base y la de producción son tres strings en un archivo de texto. Por eso
la sección 5 existe.

### 3.2 Crear el proyecto

1. En [supabase.com](https://supabase.com) creá un proyecto nuevo. Nombralo de forma que sea
   imposible confundirlo: `tokepass-dev-<tu-nombre>`.
2. Elegí la región más cercana (`sa-east-1` para Argentina).
3. Guardá la contraseña de la base en tu gestor de contraseñas, no en un `.txt`.
4. Copiá URL, `anon` y `service_role` a tu `.env.local`.

### 3.3 Aplicar las migraciones

Van **en orden alfabético de nombre de archivo**, que es cronológico por diseño. El orden
importa: hay migraciones que hacen `ALTER` sobre tablas creadas 200 archivos antes.

**Opción A — SQL Editor** (sin instalar nada): pegá y ejecutá cada archivo en orden. Tedioso
con 240 archivos, pero sirve para un subconjunto o para entender qué hace cada uno.

**Opción B — CLI de Supabase** (recomendada):

```bash
npm i -g supabase
supabase login
supabase link --project-ref <tu-project-ref>   # genera supabase/config.toml local
supabase db push
```

`config.toml` no está committeado justamente para que nadie herede el link de otro. Después
del `link`, **verificá a qué proyecto quedó apuntando** antes de cualquier `db push`.

### 3.4 Convención de nombres de migraciones

```
00001_core_schema.sql                                  ← legacy, secuencial
20261132200000_p208_claim_test_transfer_cap_bypass.sql ← timestamp + fase + descripción
```

El `pNNN` es el número de fase del roadmap. Al crear una migración nueva: timestamp mayor al
último, `pNNN` siguiente, y descripción en snake_case que diga **qué cambia**, no "fix".

### 3.5 `DATABASE_URL`: puerto 6543, no 5432

Si necesitás SQL directo (scripts, migraciones, un cliente como DBeaver), usá el **pooler
transaccional de Supavisor en el puerto 6543**:

```
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

El código lo fuerza igual, pero conviene entender el motivo:

```ts
// lib/supabase/pooler.ts
if (url.port === DIRECT_DB_PORT || url.port === "") {
  url.port = TRANSACTION_POOLER_PORT   // 5432 → 6543
}
```

El 5432 directo es una conexión por invocación. En serverless, un pico de tráfico agota
`max_connections` y **se cae también el dashboard**, justo cuando lo necesitás para
diagnosticar. `docs/SCALING_GUIDE.md` tiene el detalle.

---

## 4. Levantar el entorno

```bash
npm run dev
```

Abre en `http://localhost:3000`.

### 4.1 Verificar que la base responde

```bash
curl http://localhost:3000/api/health
```

Lo que devuelve `app/api/health/route.ts`:

- `"status": "healthy"` → Supabase responde.
- `"status": "degraded"` → Redis configurado pero fallando. En local es esperable.
- `"status": "unhealthy"` + HTTP 503 → Supabase no responde. Revisá URL y claves.
- `"redis": { "status": "skipped" }` → Redis sin configurar. Normal en local.

### 4.2 Suite de verificación

Corré esto **antes de cada commit**, en este orden:

```bash
npm run lint             # eslint --max-warnings 0 (cero advertencias, no solo cero errores)
npx tsc --noEmit         # tipos del código base
npm run typecheck:tests  # tipos de los tests (tsconfig.test.json aislado)
npm test                 # unit tests de lib/**/*.test.ts
npm run build            # build de producción
```

**Son dos chequeos de tipos distintos y hay que correr los dos.** `npx tsc --noEmit` usa
`tsconfig.json`, que **excluye los archivos de test**: por eso el código base puede estar limpio
mientras los tests tienen errores de tipos. `npm run typecheck:tests` usa `tsconfig.test.json`,
que extiende el config base pero sobrescribe `include`/`exclude` para tomar `**/*.test.ts` y
`tests/**/*`. Sin él, los tests nunca se tipaban.

Ojo con la forma del comando: **no existe** un script `tsc` en `package.json`, así que
`npm run tsc --noEmit` falla con *"Missing script: tsc"*. Para el código base es `npx tsc`.

`npm run typecheck:tests` **hoy falla**, con 125 errores en 27 archivos. No es un bug tuyo ni de
producción: es deriva entre los fixtures de los tests y los tipos que evolucionaron. La regla
mientras esa deuda exista es **que el número no crezca**; el desglose por archivo y la estrategia
para bajarlo están en `HANDOFF.md`. Si tu cambio suma errores nuevos, son tuyos.

`npm test` no usa Vitest ni Jest: es el runner nativo de Node vía
`scripts/run-unit-tests.mjs`, que junta los globs a mano porque Node 20 no los expande. Solo
recoge `.test.ts` **bajo `lib/`** — la lógica pura va ahí, y por eso es testeable.

Tests de UI y flujos:

```bash
npm run test:e2e       # Playwright, levanta `npm run dev` solo
npm run test:e2e:ui    # modo interactivo
```

Playwright corre con locale `es-AR` y timezone `America/Argentina/Buenos_Aires`, porque el
formato de fechas y los cortes de día son lógica de negocio.

### 4.3 Un detalle de `npm run build`

`prebuild` ejecuta `scripts/check-production-env.mjs`, pero el script arranca con:

```js
const enforce =
  process.env.VERCEL_ENV === "production" || process.env.REQUIRE_PRODUCTION_ENV === "1"
if (!enforce) process.exit(0)
```

En local no valida nada. Para reproducir lo que va a pasar en el deploy sin subir nada:

```bash
# bash
REQUIRE_PRODUCTION_ENV=1 npm run build
```

```powershell
# PowerShell
$env:REQUIRE_PRODUCTION_ENV="1"; npm run build; Remove-Item Env:\REQUIRE_PRODUCTION_ENV
```

Ahí exige HTTPS, orígenes sin path, secretos de ≥24 caracteres, y **rechaza tokens `TEST-`
de Mercado Pago**. Es un buen chequeo antes de tocar variables en Vercel.

---

## 5. Reglas estrictas de base de datos

Esta sección es la razón de ser del documento. TokePass vende entradas con dinero real:
`tickets`, `orders` y `event_seating_units` son registros financieros. Un `UPDATE` mal hecho
no se revierte con `git revert`.

### 5.1 Regla 0 — Producción nunca entra en tu `.env.local`

**Prohibido, sin excepciones:**

- Pegar la URL o las claves del proyecto de producción en `.env.local`.
- Conectar DBeaver, TablePlus, psql o cualquier cliente a la base de producción.
- Correr `supabase db push` o `supabase link` contra el ref de producción.
- Apuntar `npm run dev` a producción "para reproducir un bug".
- Copiar un dump de producción a tu máquina.

El motivo no es solo el riesgo de escritura. `npm run dev` con las claves de producción
ejecuta Server Actions reales: puede emitir tickets, disparar emails a compradores reales,
consumir admisiones y crear preferencias de pago. Hot reload en un archivo equivocado alcanza
para mandar un email a alguien que compró una entrada de verdad.

Si necesitás datos parecidos a producción, pedí un **seed anonimizado** para tu proyecto de
dev. No hay atajo aceptable.

### 5.2 Cómo saber a dónde estás apuntando

Chequeá **antes** de cualquier operación destructiva. El `project-ref` es el subdominio de la
URL de Supabase:

```bash
# bash / macOS / Linux
grep NEXT_PUBLIC_SUPABASE_URL .env.local

# PowerShell
Select-String NEXT_PUBLIC_SUPABASE_URL .env.local
```

Memorizá tu ref. Si el que ves no es el tuyo, **pará y preguntá** antes de tocar nada. Si ya
linkeaste la CLI, verificá también con `supabase projects list`, que marca el proyecto
vinculado.

Señales de que estás en el lugar equivocado:

- Aparecen eventos, organizadores o compradores que no creaste vos.
- Hay tickets con `is_test = false` que no emitiste.
- El dashboard muestra montos que no cargaste.
- `/api/health` responde con latencias de otra región.

En cualquiera de esos casos: cerrá el server, no ejecutes nada más, avisá.

### 5.3 `service_role` — cuándo y cómo

La clave `service_role` **bypassea RLS**. Con ella, un `.delete()` sin `.eq()` borra la tabla
completa sin que ninguna política lo frene.

- Solo se usa vía `createAdminClient()` (`lib/supabase/admin.ts`), que importa `server-only`.
- Nunca en un componente cliente, nunca con prefijo `NEXT_PUBLIC_`, nunca en un script que
  tenga la URL de producción a mano.
- En Server Actions, la ruta correcta es `createClient()` (`lib/supabase/server.ts`), que
  respeta la sesión del usuario y **por lo tanto RLS**. Si estás alcanzando el admin client
  para "que ande", casi siempre falta una policy o falla el chequeo de autorización.
- Para k6 y pruebas de carga: `K6_SERVICE_ROLE_KEY` de staging únicamente. Está escrito en
  `docs/SCALING_GUIDE.md`: *"No uses `K6_SERVICE_ROLE_KEY` de prod."*

### 5.4 Migraciones: append-only

1. **Jamás edites una migración ya aplicada.** Ni un typo, ni un comentario. Otra persona ya
   la corrió; tu edición no se le va a aplicar y sus esquemas divergen en silencio.
   Corregí con una migración nueva.
2. **Jamás borres una migración** ni la renombres. El orden alfabético es el orden de
   ejecución.
3. **Toda tabla nueva necesita RLS.** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` más las
   policies, en la misma migración. Una tabla sin RLS con la clave `anon` en el browser es
   una tabla pública.
4. **Probá contra tu proyecto de dev primero**, siempre.
5. **Cuidado con las recursiones de RLS.** Ya pasó: existe
   `20261131100000_p197_fix_events_ticket_holder_rls_recursion.sql`. Una policy que consulta
   una tabla cuya policy consulta la primera es un bucle infinito en runtime, no un error de
   sintaxis.
6. **Los RPC transaccionales son el corazón del sistema.** `reserve_tickets_tx`,
   `reserve_seating_unit_tx`, `execute_safe_transfer`, `redeem_item`. Su atomicidad es lo que
   evita vender la misma mesa dos veces. No los toques sin leer `docs/SCALING_GUIDE.md` y sin
   correr `npm run load:collision` en staging, donde el resultado correcto es **1 OK y 99
   conflictos**.

### 5.5 Nunca SQL manual a mano alzada

Incluso en tu propia base:

- `UPDATE` y `DELETE` **siempre** con `WHERE`. Escribí el `WHERE` antes del `SET`.
- Antes de un `UPDATE`, corré el mismo `WHERE` como `SELECT` y mirá cuántas filas devuelve.
- Cambios de estado de tickets y órdenes van por los RPC, que mantienen los invariantes de
  stock. Un `UPDATE tickets SET status = 'valid'` a mano deja el inventario inconsistente.
- Nada de `TRUNCATE` ni `DROP TABLE` fuera de una migración.

### 5.6 Datos de prueba: usá el modo test, no datos falsos en producción

El sistema tiene modo de prueba de primera clase (`orders.is_test`, `environment = 'test'`,
`tickets.isTest`). Los tickets de prueba se muestran con banda roja **"Modo prueba · sin
validez"** y se excluyen de los dashboards financieros
(`p193_event_dashboard_exclude_sandbox`).

Usalo. Nunca crees un "evento de prueba" en producción: contamina métricas, puede aparecer en
el catálogo público y bloquea el editor de mapas por stock comprometido. Para limpiar,
`lib/seating/editor-test-purge.ts` tiene la purga controlada.

### 5.7 Pagos

- Local y staging: token de **prueba** de Mercado Pago (`TEST-`). `check-production-env.mjs`
  rechaza un `TEST-` en producción, y `MP_FORCE_SANDBOX=1` está prohibido ahí.
- Los E2E bloquean la pasarela por diseño (`tests/e2e/helpers/mp-guard.ts` intercepta los
  hosts de MP y devuelve 418). Si un test tuyo necesita saltear ese guard, el test está mal
  planteado.
- Webhooks: los secretos de Naranja X y Payway son **fail-closed** — sin secreto, el POST se
  ignora. No "resuelvas" un webhook que no llega borrando la verificación de firma.

### 5.8 Checklist antes de cada commit

```
[ ] .env.local apunta a MI proyecto de dev (ref verificado)
[ ] Ningún secreto real en el diff (revisá `git diff --staged`)
[ ] No edité ni borré migraciones existentes
[ ] Toda tabla nueva tiene RLS + policies
[ ] npm run lint             → 0 warnings
[ ] npx tsc --noEmit         → limpio (código base)
[ ] npm run typecheck:tests  → sin errores NUEVOS (baseline: 125 en 27 archivos)
[ ] npm test                 → verde
[ ] npm run build            → compila
```

Los dos chequeos de tipos no se solapan: `tsconfig.json` excluye los tests y
`tsconfig.test.json` es el único que los mira. Ver 4.2.

Antes de un push a producción hay además una validación de entorno y el procedimiento de
migraciones: están en [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 6. Cómo se trabaja en este código

### 6.1 Este Next.js no es el que conocés

`AGENTS.md` lo dice en la primera línea, y aplica igual para humanos: **Next.js 16.2** tiene
breaking changes respecto de lo que probablemente aprendiste. La documentación de la versión
exacta está instalada localmente:

```
node_modules/next/dist/docs/
```

Leé la guía correspondiente **antes** de escribir código, no después de que falle el build.
Las que más se usan acá: `01-app/01-getting-started/16-proxy.md`,
`02-guides/server-actions.md`, `02-guides/caching-without-cache-components.md`,
`02-guides/authentication.md` y `02-guides/upgrading/version-16.md`.

El cambio que más confunde al llegar: **`middleware.ts` ya no existe, ahora es `proxy.ts`**
en la raíz. Ahí viven CSP con nonce, captura de referidos, redirects legacy y el refresco de
sesión de Supabase.

### 6.2 Convenciones del proyecto

- **Server Components para leer, Server Actions para escribir.** Las actions en `app/actions/`
  son la frontera de la aplicación: autenticación, autorización, validación con Zod y rate
  limiting van ahí. Devuelven `ActionResult<T>`.
- **Tres capas de autorización**: interceptor en `proxy.ts`, chequeo en la Server Action, y
  RLS en Postgres. Las tres, siempre. RLS es la última línea y nunca se omite.
- **La lógica pura va a `lib/`**, con su `.test.ts` al lado. Si algo es difícil de testear,
  suele ser porque está mezclado con I/O en un componente.
- **`types/database.ts`** es el contrato tipado del dominio. Si cambiás el esquema, actualizá
  ese archivo.
- **Textos de UI en español rioplatense**, con `formatEventDay` / `formatEventTime` para
  fechas. Ver `GUIA_MICROCOPY_CONVERSION.md`.
- **Commits en español, minúscula, con prefijo**: `feat:`, `fix:`, `refactor:`. Mirá
  `git log --oneline` para calibrar el tono.

### 6.3 Mapa de lectura

En este orden:

| Documento | Qué te da |
| --- | --- |
| `README.md` | Arranque de tres pasos |
| `docs/ARCHITECTURE.md` | Stack, patrones, estructura de carpetas, flujo de auth |
| `docs/WALLET_SECURITY.md` | Billetera, estructura Padre/Hijo, Living QR |
| `docs/MAP_BUILDER.md` | Editor de mapas, adopción espacial, inventario |
| `docs/SCALING_GUIDE.md` | Día de evento masivo, umbrales, runbook |
| `docs/AUDITORIA_SISTEMA.md` | Estado auditado del sistema |
| `AUDITORIA_PLATAFORMA.md`, `AUDITORIA_ESTADO_ACTUAL.md` | Deuda técnica y pendientes |
| `AGENTS.md` | Reglas para agentes de IA (y recordatorio de Next 16) |

---

## 7. Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY` | `.env.local` incompleto o sin reiniciar | Completá y reiniciá `npm run dev` |
| `/api/health` → 503 | URL o claves mal, o proyecto pausado | Supabase pausa proyectos free inactivos: reactivalo |
| Todas las queries devuelven vacío | Migraciones sin aplicar, o RLS bloqueando | Verificá §3.3; probá la misma query en el SQL Editor |
| `Missing TOTP Secret` en un QR | El ticket no tiene `totp_secret` | Emitido con un flujo viejo; regeneralo en tu base de dev |
| Checkout rechaza todo | Captcha o Redis en fail-closed | En local dejá `TURNSTILE_*` y `UPSTASH_*` sin configurar |
| `too many clients already` | Puerto 5432 en vez de 6543 | Usá el pooler (§3.5) |
| Cambio en `.env.local` sin efecto | Next lee el env al arrancar | Reiniciá el server; las `NEXT_PUBLIC_*` además requieren rebuild |
| `npm run lint` falla por un warning | `--max-warnings 0` | Arreglalo; no subas el umbral |
| E2E se cuelga esperando el server | Ya tenés un `npm run dev` en el puerto | `E2E_SKIP_WEBSERVER=1` reusa el que está |
| La sala de espera no aparece | `MAX_CONCURRENT_USERS` sin setear | Poné `0` para forzarla, `1` para auto-admitir |

---

## 8. Primera tarea sugerida

Para conocer el código sin riesgo, en orden:

1. Levantá el entorno y confirmá `/api/health` en `healthy`.
2. Registrate como usuario en tu instancia local y recorré el flujo de compra completo con
   Mercado Pago sandbox.
3. Creá un evento con mapa interactivo desde el panel de organizador y armá una mesa.
4. Comprá una entrada en **modo prueba** y abrí el QR en la billetera. Mirá cómo rota cada
   15 segundos.
5. Escaneá ese QR desde el escáner de puerta.
6. Corré `npm test` y leé un par de suites de `lib/` — son la mejor documentación ejecutable
   del dominio.

Si algo de esta guía quedó desactualizado mientras la seguías, corregila en el mismo PR. Es
el mejor primer aporte posible.
