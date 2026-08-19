# Guía de escala — día de evento masivo

TokePass concentra el pico en **reservas atómicas** (`reserve_tickets_tx` / `reserve_seating_unit_tx`), no en Mercado Pago. El checkout Pro ocurre *después* del hold. El día del show, mirá primero cola de Postgres y Server Actions de Next, no el widget de MP.

## Antes del pico

- Corré `npm run load:collision` contra **staging** con `K6_SEATING_UNIT_ID` = una mesa real. Esperás **1 OK** y **99 conflictos** (`SEATING_UNIT_UNAVAILABLE` / sold out), sin timeouts.
- Spike 5k–10k VUs (`K6_SCENARIO=spike`) solo en un proyecto Supabase de carga, con **Supavisor (transaction pooler)** y `max_connections` deje margen para el dashboard.
- Confirmá que el evento está `published`, que `zone_tier_pricing` no tiene rangos solapados y que el hold de checkout (≈8 min) no deja unidades colgadas: el cron `expire-orders` tiene que correr.

## Supabase (Postgres + API)

| Métrica | Por qué | Umbral práctico |
| --- | --- | --- |
| CPU | `FOR UPDATE` en units/tiers bajo ráfaga | Alertar >70% sostenido 5 min |
| RAM / cache hit | Planes con muchos `event_seating_units` | Cache hit <95% = I/O |
| Active connections | Cada RPC toma una conexión (o slot del pooler) | <70% de `max_connections` |
| Waiting / lock time | 100 VUs en Mesa 12 deben esperar el row lock, no colgar | Locks >2s = revisar índices / tx largas |
| Error rate PostgREST | 400 de negocio (sold out) es **sano**; 500/57014 no | 5xx ≈ 0 |
| WAL / replication lag | Realtime Live Ops (scanner/dashboard) | Lag <1s |
| Disk IO | Lazy seating + inserts de tickets | Picos cortos OK; sostenido no |

En el dashboard: **Reports → Database** (CPU, IO, connections) y **API** (REST p95). Activá **Database Linter** si hay seq scans en `event_seating_units (event_id, sector_id, status)`.

Pooler: los clientes de Next (server actions) deben usar el **transaction mode** en serverless. El rol `service_role` del k6 **nunca** en producción.

## Vercel (Next.js App Router)

| Señal | Qué indica |
| --- | --- |
| Function duration / p95 de Server Actions | `startCheckoutWithPayment` + RPC |
| Concurrent executions / queue | saturación del runtime Node |
| Error rate 5xx vs 4xx | 4xx de stock es esperado |
| ISR / cache HIT de `/events/[id]` | la ficha no debe pegarle a Postgres en cada view; el mapa de sectores sí (lazy) |
| Fluid / streaming TTFB | CDN vs origin en LATAM |
| Exhausted connections (logs `too many clients`) | mal pooler o service role en edge |

Alertas: p95 action > 3s, 5xx > 1%, cola de funciones > 0 durante >2 min.

## Aplicación TokePass

- **Hold de asiento**: reserved vs sold. Si el cron falla, el cupo “fantasma” dispara sold out falso.
- **Realtime Live Ops**: suscribirse a `UPDATE` de tickets, no a dumps de units.
- **Escáner**: manifiesto offline; no dispares N queries por beep.
- **Mercado Pago**: webhook `order.paid` debe ser idempotente. El pico de preferencias es *después* de reservar: si MP cae, el hold expira y la unidad vuelve.

## Runbook corto (hora 0)

1. Health: `GET /api/health` (DB ok, no skipped crítico).
2. CPU/conexiones Supabase en verde.
3. Una compra sandbox del organizador (sin MP real).
4. Escanear un QR de prueba en gatera General y Barrera si hay parking.
5. Si locks suben: pausar boost/ads, no “reiniciar Postgres”.
6. Si 5xx en reserve: rollback de traffic (feature flag / unpublish) antes que de schema.

## Qué no hacer

- No abras 10k conexiones directas a `db.*.supabase.co` (usar pooler).
- No uses `K6_SERVICE_ROLE_KEY` de prod.
- No midas éxito de carga por “todas las reservas 200”: en Mesa 12 **el 99% debe fallar bien**.
