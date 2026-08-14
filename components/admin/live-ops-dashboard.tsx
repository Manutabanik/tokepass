"use client"

import {
  Activity,
  Clock3,
  DoorOpen,
  Gauge,
  Loader2,
  Radio,
  Ticket,
  Timer,
  UserRoundCheck,
  Users,
  WifiOff,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"

import type { LiveOpsSnapshot } from "@/lib/live-ops"
import { LiveOpsFlowChart } from "@/components/admin/live-ops-flow-chart"
import { useLiveMetrics } from "@/hooks/use-live-metrics"
import { formatNumber } from "@/lib/format"

type Props = {
  eventId: string
  initial: LiveOpsSnapshot
}

function formatRelativeEs(iso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000))
  if (diffSec < 5) return "Ahora"
  if (diffSec < 60) return `Hace ${diffSec} seg`
  const mins = Math.floor(diffSec / 60)
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} h`
  return `Hace ${Math.floor(hours / 24)} d`
}

function formatRpm(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.0"
  return value >= 10 ? value.toFixed(0) : value.toFixed(1)
}

function OccupancyRing({
  percent,
  checkedIn,
  capacity,
}: {
  percent: number
  checkedIn: number
  capacity: number
}) {
  const size = 220
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, percent))
  const offset = c - (clamped / 100) * c
  const accent =
    clamped >= 95
      ? "stroke-amber-500 dark:stroke-amber-400"
      : clamped >= 70
        ? "stroke-emerald-500 dark:stroke-emerald-400"
        : "stroke-sky-500 dark:stroke-sky-400"

  return (
    <div className="relative mx-auto flex size-[220px] items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`${accent} transition-[stroke-dashoffset] duration-500 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-5xl font-black tabular-nums tracking-tight text-foreground">
          {clamped.toFixed(0)}
          <span className="text-2xl text-muted-foreground">%</span>
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Ocupación
        </p>
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          {formatNumber(checkedIn)} / {formatNumber(capacity)}
        </p>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  live,
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Ticket
  accent: string
  live?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
              <Radio className="size-3" aria-hidden />
              Live
            </span>
          ) : null}
          <Icon className={`size-4 ${accent}`} aria-hidden />
        </div>
      </div>
      <p className="mt-4 text-4xl font-black tabular-nums tracking-tight text-foreground sm:text-5xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function LiveOpsDashboard({ eventId, initial }: Props) {
  const metrics = useLiveMetrics(eventId, initial)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {metrics.connection === "live" ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              En vivo
            </>
          ) : metrics.connection === "error" ? (
            <>
              <WifiOff className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              Sin señal Realtime
            </>
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
              Conectando
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void metrics.refresh()}
          disabled={metrics.refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-50"
        >
          {metrics.refreshing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Activity className="size-3.5" aria-hidden />
          )}
          Sincronizar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="space-y-4">
          {/* Sección A — KPIs */}
          <section className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Users className="size-4 text-sky-600 dark:text-sky-300" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Aforo total
                </h2>
              </div>
              <OccupancyRing
                percent={metrics.occupancyPercent}
                checkedIn={metrics.checkedIn}
                capacity={metrics.capacity}
              />
              <div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-500 ease-out"
                  style={{ width: `${metrics.occupancyPercent}%` }}
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Ingresados / Capacidad máxima
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <KpiCard
                label="Ritmo de acceso"
                value={`${formatRpm(metrics.rpm5)}/min`}
                hint={`Últimos 5 min · 15 min: ${formatRpm(metrics.rpm15)}/min`}
                icon={Gauge}
                accent="text-sky-600 dark:text-sky-300"
                live
              />
              <KpiCard
                label="Pendientes de ingreso"
                value={formatNumber(metrics.remaining)}
                hint={`${formatNumber(metrics.sold)} vendidas · ${formatNumber(metrics.checkedIn)} ingresados`}
                icon={DoorOpen}
                accent="text-amber-600 dark:text-amber-400"
                live
              />
              <KpiCard
                label="Pico de puerta"
                value={metrics.peakLabel}
                hint="Franja de 30 min con más escaneos"
                icon={Clock3}
                accent="text-violet-600 dark:text-violet-300"
              />
              <KpiCard
                label="Ingresados"
                value={formatNumber(metrics.checkedIn)}
                hint={`Capacidad ${formatNumber(metrics.capacity)}`}
                icon={UserRoundCheck}
                accent="text-emerald-600 dark:text-emerald-200"
                live
              />
            </div>
          </section>

          {/* Sección B — Flujo horario */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Picos y flujo horario
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Intervalos de 1 hora
              </p>
            </div>
            <LiveOpsFlowChart buckets={metrics.flowBuckets} />
          </section>

          {/* Sección D — Tiers / sectores */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Ticket className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Desglose por sector
              </h2>
            </div>
            {(metrics.sectorBreakdown.length > 0
              ? metrics.sectorBreakdown
              : metrics.tierBreakdown
            ).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Todavía no hay entradas emitidas por sector.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(metrics.sectorBreakdown.length > 0
                  ? metrics.sectorBreakdown.map((sector) => ({
                      key: sector.sectorKey,
                      name: sector.sectorName,
                      sold: sector.sold,
                      checkedIn: sector.checkedIn,
                    }))
                  : metrics.tierBreakdown.map((tier) => ({
                      key: tier.tierId,
                      name: tier.name,
                      sold: tier.sold,
                      checkedIn: tier.checkedIn,
                    }))
                ).map((row) => {
                  const pct =
                    row.sold > 0
                      ? Math.min(100, (row.checkedIn / row.sold) * 100)
                      : 0
                  return (
                    <div
                      key={row.key}
                      className="rounded-xl border border-border bg-muted/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {row.name}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {formatNumber(row.checkedIn)} / {formatNumber(row.sold)}{" "}
                            ingresados
                          </p>
                        </div>
                        <p className="shrink-0 text-lg font-black tabular-nums text-foreground">
                          {pct.toFixed(0)}%
                        </p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-500 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sección C — Feed */}
        <aside className="rounded-2xl border border-border bg-card p-5 xl:sticky xl:top-4 xl:self-start">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-emerald-600 dark:text-emerald-200" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Actividad en vivo
              </h2>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos 20
            </span>
          </div>
          {metrics.feed.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Todavía no hay ingresos registrados.
            </p>
          ) : (
            <ul className="max-h-[min(42rem,70vh)] space-y-2 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {metrics.feed.map((entry) => (
                  <motion.li
                    key={`${entry.ticketId}-${entry.at}`}
                    layout
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3"
                  >
                    <UserRoundCheck
                      className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-200"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {entry.holderName}{" "}
                        <span className="font-normal text-muted-foreground">ingresó</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.tierName} · {formatRelativeEs(entry.at, nowMs)}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
