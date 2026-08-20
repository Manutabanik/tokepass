import { NextResponse } from "next/server"

import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProbeStatus = "ok" | "error" | "skipped" | "degraded"

type ProbeResult = {
  status: ProbeStatus
  latencyMs: number
  detail?: string
}

function publicProbe(probe: ProbeResult): ProbeResult {
  return { status: probe.status, latencyMs: probe.latencyMs }
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout_${ms}ms`)),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function checkSupabase(): Promise<ProbeResult> {
  const started = Date.now()
  try {
    const admin = createAdminClient()
    // Lightweight round-trip equivalent to SELECT 1 via PostgREST head request.
    const { error } = await withTimeout(
      admin.from("profiles").select("id", { head: true, count: "exact" }).limit(1),
      1500,
      "supabase",
    )

    if (error) {
      return {
        status: "error",
        latencyMs: Date.now() - started,
        detail: error.message,
      }
    }

    return { status: "ok", latencyMs: Date.now() - started }
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : "supabase_unreachable",
    }
  }
}

async function checkUpstashRedis(): Promise<ProbeResult> {
  const started = Date.now()
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()

  if (!url || !token) {
    return {
      status: "skipped",
      latencyMs: 0,
      detail: "not_configured",
    }
  }

  try {
    const endpoint = `${url.replace(/\/$/, "")}/ping`
    const response = await withTimeout(
      fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }),
      1500,
      "redis",
    )

    if (!response.ok) {
      return {
        status: "degraded",
        latencyMs: Date.now() - started,
        detail: `http_${response.status}`,
      }
    }

    const body = (await response.json().catch(() => null)) as {
      result?: string
    } | null

    if (body?.result && String(body.result).toUpperCase() !== "PONG") {
      return {
        status: "degraded",
        latencyMs: Date.now() - started,
        detail: `unexpected_ping:${String(body.result)}`,
      }
    }

    return { status: "ok", latencyMs: Date.now() - started }
  } catch (error) {
    return {
      status: "degraded",
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : "redis_unreachable",
    }
  }
}

export async function GET() {
  const started = Date.now()

  const [supabase, redis] = await Promise.all([
    checkSupabase(),
    checkUpstashRedis(),
  ])

  const supabaseFailed = supabase.status === "error"
  const redisDegraded = redis.status === "degraded"

  const probes = [supabase, redis].filter((p) => p.status !== "skipped")
  const avgLatencyMs =
    probes.length > 0
      ? Math.round(
          probes.reduce((sum, probe) => sum + probe.latencyMs, 0) / probes.length,
        )
      : Date.now() - started

  const body = {
    status: supabaseFailed ? "unhealthy" : redisDegraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    latencyMs: {
      total: Date.now() - started,
      average: avgLatencyMs,
      supabase: supabase.latencyMs,
      redis: redis.latencyMs,
    },
    checks: {
      supabase: publicProbe(supabase),
      redis: publicProbe(redis),
    },
  }

  if (supabaseFailed) {
    logger.error({
      context: "api/health",
      message: "healthcheck_failed",
      checks: { supabase, redis },
    })
    return NextResponse.json(body, { status: 503 })
  }

  if (redisDegraded) {
    logger.warn({
      context: "api/health",
      message: "redis_degraded",
      checks: { redis },
    })
  }

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
