/**
 * TokePass — pruebas de carga / concurrencia (k6)
 *
 * Objetivo:
 *   - Smoke: health de Next + (opcional) RPC de reserva.
 *   - Collision: 100 VUs reservan la misma unidad (Mesa 12) en el mismo instante.
 *     Como máximo 1 éxito; el resto debe fallar con error de negocio (no timeout).
 *   - Spike: 5.000 → 10.000 VUs. SOLO staging. Requiere pooler (Supavisor).
 *
 * Uso:
 *   k6 run load-test.js
 *   k6 run -e K6_SCENARIO=collision load-test.js
 *   k6 run -e K6_SCENARIO=spike load-test.js
 *
 * Nunca apuntes K6_SUPABASE_URL / K6_SERVICE_ROLE_KEY a producción.
 */

import http from "k6/http"
import { check, sleep } from "k6"
import { Counter, Rate, Trend } from "k6/metrics"
import { SharedArray } from "k6/data"

const scenario = (__ENV.K6_SCENARIO || "smoke").toLowerCase()

const reserveOk = new Counter("tokepass_reserve_ok")
const reserveConflict = new Counter("tokepass_reserve_conflict")
const reserveError = new Counter("tokepass_reserve_error")
const conflictRate = new Rate("tokepass_conflict_rate")
const reserveLatency = new Trend("tokepass_reserve_latency", true)

const ownerPool = new SharedArray("owners", () => {
  const raw = __ENV.K6_OWNER_IDS || ""
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
})

function spikeStages() {
  return [
    { duration: "1m", target: 200 },
    { duration: "2m", target: 2000 },
    { duration: "2m", target: 5000 },
    { duration: "2m", target: 10000 },
    { duration: "2m", target: 10000 },
    { duration: "2m", target: 0 },
  ]
}

export const options =
  scenario === "collision"
    ? {
        scenarios: {
          mesa12: {
            executor: "shared-iterations",
            vus: 100,
            iterations: 100,
            maxDuration: "45s",
          },
        },
        thresholds: {
          tokepass_reserve_ok: ["count<=1"],
          http_req_duration: ["p(95)<3000"],
          http_req_failed: ["rate<0.15"],
        },
      }
    : scenario === "spike"
      ? {
          scenarios: {
            ramp: {
              executor: "ramping-vus",
              startVUs: 0,
              stages: spikeStages(),
              gracefulRampDown: "30s",
            },
          },
          thresholds: {
            http_req_duration: ["p(95)<5000"],
            http_req_failed: ["rate<0.05"],
          },
        }
      : {
          vus: 5,
          duration: "30s",
          thresholds: {
            http_req_duration: ["p(95)<2000"],
            http_req_failed: ["rate<0.05"],
          },
        }

function envOr(name, fallback) {
  const value = __ENV[name]
  return value && String(value).trim() ? String(value).trim() : fallback
}

function supabaseHeaders() {
  const anon = envOr("K6_SUPABASE_ANON_KEY", "")
  const service = envOr("K6_SERVICE_ROLE_KEY", "")
  const key = service || anon
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  }
}

function isConflictBody(body) {
  const text = String(body || "").toLowerCase()
  return (
    text.includes("seating_unit_unavailable") ||
    text.includes("sold out") ||
    text.includes("agotad") ||
    text.includes("already reserved") ||
    text.includes("p0001") ||
    text.includes("23505")
  )
}

function pickOwner(vu) {
  if (ownerPool.length === 0) {
    return "00000000-0000-4000-8000-000000000001"
  }
  return ownerPool[(vu - 1) % ownerPool.length]
}

function postRpc(fnName, payload) {
  const base = envOr("K6_SUPABASE_URL", "")
  if (!base) {
    return null
  }
  const url = `${base.replace(/\/$/, "")}/rest/v1/rpc/${fnName}`
  const started = Date.now()
  const res = http.post(url, JSON.stringify(payload), {
    headers: supabaseHeaders(),
    timeout: "15s",
    tags: { rpc: fnName },
  })
  reserveLatency.add(Date.now() - started)
  return res
}

function classifyReserve(res) {
  if (!res) {
    reserveError.add(1)
    return "missing_env"
  }

  let parsed = null
  try {
    parsed = JSON.parse(res.body)
  } catch (error) {
    parsed = null
  }

  const hasTicket =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    Boolean(parsed[0] && parsed[0].ticket_id)

  if (res.status === 200 && hasTicket) {
    reserveOk.add(1)
    conflictRate.add(false)
    return "ok"
  }

  if (res.status >= 400 && isConflictBody(res.body)) {
    reserveConflict.add(1)
    conflictRate.add(true)
    return "conflict"
  }

  reserveError.add(1)
  conflictRate.add(false)
  return "error"
}

export default function () {
  const nextOrigin = envOr("K6_NEXT_ORIGIN", "http://localhost:3000")

  if (scenario === "smoke" || scenario === "spike") {
    const health = http.get(`${nextOrigin.replace(/\/$/, "")}/api/health`, {
      timeout: "10s",
      tags: { endpoint: "health" },
    })
    check(health, {
      "health 200": (r) => r.status === 200,
    })
  }

  const eventId = envOr("K6_EVENT_ID", "")
  const unitId = envOr("K6_SEATING_UNIT_ID", "")
  const tierId = envOr("K6_TIER_ID", "")
  const canRpc = Boolean(
    envOr("K6_SUPABASE_URL", "") &&
      (envOr("K6_SERVICE_ROLE_KEY", "") || envOr("K6_SUPABASE_ANON_KEY", "")) &&
      eventId &&
      (unitId || tierId),
  )

  if (!canRpc) {
    sleep(1)
    return
  }

  const ownerId = pickOwner(__VU)

  if (unitId) {
    const res = postRpc("reserve_seating_unit_tx", {
      p_event_id: eventId,
      p_owner_id: ownerId,
      p_tier_id: tierId || null,
      p_seating_unit_id: unitId,
      p_promoter_id: null,
    })
    const kind = classifyReserve(res)
    check(res, {
      "seating rpc answered": (r) => Boolean(r) && r.status !== 0,
      "seating not hung": (r) => Boolean(r) && r.timings.duration < 8000,
      "collision is ok or conflict": () =>
        scenario !== "collision" || kind === "ok" || kind === "conflict",
    })
    return
  }

  const gaRes = postRpc("reserve_tickets_tx", {
    p_event_id: eventId,
    p_owner_id: ownerId,
    p_items: [{ tier_id: tierId, quantity: 1 }],
    p_promoter_id: null,
  })
  classifyReserve(gaRes)
  check(gaRes, {
    "ga rpc answered": (r) => Boolean(r) && r.status !== 0,
  })
}

export function handleSummary(data) {
  const ok = (data.metrics.tokepass_reserve_ok || {}).values || {}
  const conflict = (data.metrics.tokepass_reserve_conflict || {}).values || {}
  const errors = (data.metrics.tokepass_reserve_error || {}).values || {}
  console.log(
    `\nTokePass reserve summary [${scenario}]\n` +
      `  ok=${ok.count || 0}  conflict=${conflict.count || 0}  error=${errors.count || 0}\n` +
      `  (collision: ok debe ser 0 o 1 si todos apuntan a la misma unidad)\n`,
  )
  return {}
}
