# Deploy: puerta obligatoria y migraciones

Qué hay que correr, y en qué orden, **antes de empujar a producción**. Y cómo se aplican los
cambios de base de datos, que es la única parte del deploy que no se revierte con `git revert`.

Este documento cubre sólo la puerta previa y las migraciones. Para lo demás:

| Tema | Dónde está |
| --- | --- |
| Setup local, variables de entorno, reglas de base de datos | `ONBOARDING.md` |
| Preparación ante picos de tráfico, crons, pooler | `SCALING_GUIDE.md` |
| Estado de entrega, deuda conocida, pendientes | `HANDOFF.md` |
| Esquema, RLS, holds | `DB_SCHEMA.md` |

---

## 1. La puerta obligatoria

Cinco comandos, en este orden. El orden importa: los rápidos primero, para no esperar un build
de producción y descubrir después que había un warning de lint.

```bash
npm run lint             # 1. eslint . --max-warnings 0
npx tsc --noEmit         # 2. tipos del código base (tsconfig.json)
npm run typecheck:tests  # 3. tipos de los tests (tsconfig.test.json)
npm test                 # 4. unit tests de lib/**/*.test.ts
npm run build            # 5. build de producción
```

Node mínimo: **20.9.0** (`engines` en `package.json`).

### 1.1 Los dos chequeos de tipos no se solapan

Esto es nuevo y es la razón de ser de este documento. **Hay que correr los dos.**

| | Código base | Tests |
| --- | --- | --- |
| Comando | `npx tsc --noEmit` | `npm run typecheck:tests` |
| Config | `tsconfig.json` | `tsconfig.test.json` (aislado) |
| Qué mira | La app; **excluye** los archivos de test | `**/*.test.ts` y `tests/**/*` |
| Estado esperado | Limpio, con `strict: true` | 125 errores en 27 archivos |

`tsconfig.test.json` extiende el config base, pero sobrescribe `include` **y** `exclude`. El
`exclude` va reescrito a propósito: heredado del padre dejaba fuera los propios archivos de test y
el chequeo pasaba en verde revisando cero archivos. También fija `target: ES2022` (hay literales
`BigInt` en los tests) e `incremental: false`, para que no sobreviva caché entre corridas.

Consecuencia práctica: **el código base puede estar perfectamente limpio mientras los tests no
compilan.** Antes de que existiera `typecheck:tests`, esos errores no los veía nadie.

Cuidado con la forma del comando: **no existe** un script `tsc` en `package.json`. `npm run tsc
--noEmit` falla con *"Missing script: tsc"*. Para el código base es `npx tsc --noEmit`; el que va
con `npm run` es `typecheck:tests`.

### 1.2 Qué bloquea el deploy y qué no

No todos los chequeos tienen el mismo peso, y conviene ser explícito para que nadie empuje con
algo roto ni se frene por deuda ya conocida.

| Chequeo | Esperado | ¿Bloquea? |
| --- | --- | --- |
| `npm run lint` | 0 warnings | **Sí.** Corre con `--max-warnings 0`: un warning es un error. No subas el umbral |
| `npx tsc --noEmit` | limpio | **Sí.** Cualquier error acá es código de producción que no tipa |
| `npm run typecheck:tests` | 125 errores en 27 archivos | **Sí, si el número creció.** Ver 1.3 |
| `npm test` | 1661 / 1661, 468 suites | **Sí.** Un test rojo bloquea |
| `npm run build` | exit 0 | **Sí.** Es lo que va a correr el hosting |

`npm test` no usa Vitest ni Jest: es el runner nativo de Node vía `scripts/run-unit-tests.mjs`, y
sólo recoge `.test.ts` **bajo `lib/`**. Un cambio de UI puede pasar los cinco chequeos sin que
ningún test lo haya mirado. Los flujos van por Playwright (`npm run test:e2e`), que **nunca** debe
apuntar a producción.

### 1.3 El caso especial de `typecheck:tests`

Hoy **falla**, con exit code 2: 125 errores en 27 archivos. No es un bug de producción, es deriva
entre los fixtures de los tests y tipos que evolucionaron sin que nadie recompilara los tests.

La regla mientras esa deuda exista: **el número no puede crecer.** Si tu cambio suma errores
nuevos, son tuyos y bloquean. Si el total baja, mejor. El desglose por archivo, los códigos de
error frecuentes y la estrategia para llevarlo a cero están en `HANDOFF.md`, sección 4.

Cuando el baseline llegue a 0, actualizá este documento y `ONBOARDING.md` para que el chequeo pase
a ser "limpio, sin excepciones".

---

## 2. La validación de entorno de producción

`npm run build` dispara `prebuild`, que corre `scripts/check-production-env.mjs`. **En local no
valida nada**, porque arranca así:

```js
const enforce =
  process.env.VERCEL_ENV === "production" ||
  process.env.REQUIRE_PRODUCTION_ENV === "1"

if (!enforce) process.exit(0)
```

Es decir: tu `npm run build` local pasa aunque el entorno de producción esté mal configurado. La
falla aparece recién en el deploy. Para adelantarla:

```bash
# bash
REQUIRE_PRODUCTION_ENV=1 npm run build
```

```powershell
# PowerShell
$env:REQUIRE_PRODUCTION_ENV="1"; npm run build; Remove-Item Env:\REQUIRE_PRODUCTION_ENV
```

Corré esto **cada vez que toques variables de entorno en el hosting**, antes de deployar. Lo que
exige:

- **Presencia** de las variables críticas: Supabase (URL, anon, `service_role`), origen público,
  Mercado Pago (token y secreto de webhook), `CRON_SECRET`, `RESEND_API_KEY`,
  `CHECKOUT_FULFILLMENT_SECRET`, `GUEST_TICKET_SECRET`, Upstash Redis, `WAITING_ROOM_SECRET` y las
  claves de captcha. Varias aceptan nombres alternativos (`MP_ACCESS_TOKEN` o
  `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_BASE_URL` o `NEXT_PUBLIC_SITE_URL`).
- **Placeholders rechazados**: un valor que contenga `your-`, `xxxxxxxxx` o `example` cuenta como
  no configurado.
- **HTTPS obligatorio**, y el origen público tiene que ser sólo el origen: sin path, sin query,
  sin hash, y nunca `localhost` ni `127.0.0.1`.
- **Secretos de 24 caracteres o más.**
- **Nada de modo prueba en producción**: `MP_FORCE_SANDBOX=1` está prohibido, y el token de
  Mercado Pago no puede empezar con `TEST-`.

Esta última regla es la que evita el peor error posible del deploy: publicar un evento real
cobrando contra el sandbox.

---

## 3. Migraciones de base de datos

### 3.1 Append-only, sin excepciones

`supabase/migrations/` tiene **240 archivos** y se aplican **en orden alfabético de nombre**, que
es cronológico por diseño. Hay migraciones que hacen `ALTER` sobre tablas creadas 200 archivos
antes, así que el orden no es negociable.

**Nunca** edites ni borres una migración ya aplicada. Un cambio se corrige con una migración
nueva encima. Editar una vieja deja la base desplegada y el repositorio contando historias
distintas, y el siguiente que clone va a construir un esquema que no existe en ningún lado.

Nombre de una migración nueva: timestamp mayor al último, número de fase siguiente, y descripción
en snake_case que diga **qué cambia**, no "fix".

```
20261132300000_p209_drop_unused_cart_hold_getters.sql
└── timestamp     └── fase  └── qué cambia
```

### 3.2 Aplicar y regenerar tipos

```bash
supabase link --project-ref <project-ref>   # verificá a qué proyecto quedó apuntando
supabase db push
npx supabase gen types typescript --project-id <project-ref> --schema public > types/database.ts
```

El segundo comando y el tercero van **siempre juntos**. `types/database.ts` es generado: si
aplicás una migración y no regenerás, TypeScript sigue validando contra el esquema viejo y va a
aceptar llamadas a RPCs que la base ya no tiene. El error aparece en runtime, en producción.

Después de regenerar, volvé a correr la puerta del punto 1: el archivo nuevo puede romper tipos.

### 3.3 Pendiente al momento de escribir esto

**P209 está escrita y verificada, pero no aplicada.**
`20261132300000_p209_drop_unused_cart_hold_getters.sql` elimina `get_seating_unit_cart_hold` y
`get_ga_cart_hold`, dos getters de hold que quedaron sin llamador. Hasta que se aplique y se
regeneren los tipos, `types/database.ts` declara dos funciones que el SQL ya borró.

Qué hacían y por qué borrarlas no altera la retención de lugares: `DB_SCHEMA.md`, sección 6.2.
Cómo aplicarla: `HANDOFF.md`, sección 3.

---

## 4. Regla que no se negocia

Ningún paso de este documento se corre apuntando a la base de producción desde una máquina de
desarrollo. Ni para "reproducir un bug", ni para "verificar un dato". El detalle de por qué, y qué
usar en su lugar, está en `ONBOARDING.md`, sección 5.

---

## Documentos relacionados

- `ONBOARDING.md` — setup local, variables de entorno, reglas estrictas de base de datos
- `HANDOFF.md` — estado de entrega, deuda de tipos en tests, pendientes inmediatos
- `SCALING_GUIDE.md` — antes de un pico de tráfico: crons, pooler, pruebas de carga
- `DB_SCHEMA.md` — esquema, RLS, ciclo de vida del hold
- `PAYMENTS.md` — transacciones, webhooks, sandbox vs real
