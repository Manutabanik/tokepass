"use client"

import {
  Activity,
  CheckCircle2,
  Loader2,
  Radio,
  Ticket,
  UserRoundCheck,
  Users,
  WifiOff,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  getLiveOpsSnapshot,
  type LiveOpsAccessEntry,
  type LiveOpsSnapshot,
} from "@/app/actions/live-ops"
import { createClient } from "@/lib/supabase/client"
import { formatNumber } from "@/lib/format"
import type { Ticket as TicketRow } from "@/types/database"

type ConnectionState = "connecting" | "live" | "error"

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

function OccupancyRing({
  percent,
  checkedIn,
  sold,
}: {
  percent: number
  checkedIn: number
  sold: number
}) {
  const size = 220
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, percent))
  const offset = c - (clamped / 100) * c
  const accent =
    clamped >= 95
      ? "stroke-amber-400"
      : clamped >= 70
        ? "stroke-emerald-400"
        : "stroke-sky-400"

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
          className="stroke-zinc-800"
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
        <p className="text-5xl font-black tabular-nums tracking-tight text-white">
          {clamped.toFixed(0)}
          <span className="text-2xl text-zinc-400">%</span>
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          Ocupación
        </p>
        <p className="mt-2 text-sm tabular-nums text-zinc-400">
          {formatNumber(checkedIn)} / {formatNumber(sold)}
        </p>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  live,
}: {
  label: string
  value: number
  icon: typeof Ticket
  accent: string
  live?: boolean
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-inner">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </p>
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Radio className="size-3" aria-hidden />
              Live
            </span>
          ) : null}
          <Icon className={`size-4 ${accent}`} aria-hidden />
        </div>
      </div>
      <p className="mt-4 text-5xl font-black tabular-nums tracking-tight text-white sm:text-6xl">
        {formatNumber(value)}
      </p>
    </div>
  )
}

export function LiveOpsDashboard({ eventId, initial }: Props) {
  const [sold, setSold] = useState(initial.sold)
  const [checkedIn, setCheckedIn] = useState(initial.checkedIn)
  const [remaining, setRemaining] = useState(initial.remaining)
  const [feed, setFeed] = useState<LiveOpsAccessEntry[]>(initial.recentAccess)
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)

  const checkedInIdsRef = useRef(new Set(initial.checkedInTicketIds))
  const tierNamesRef = useRef({ ...initial.tierNamesById })

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const applyTicketUpdate = (row: TicketRow) => {
      if (row.event_id !== eventId || row.is_test) return

      const soldStatus =
        row.status === "valid" ||
        row.status === "used" ||
        row.status === "scanned"

      if (!soldStatus) return

      const admitted =
        row.status === "used" ||
        row.status === "scanned" ||
        row.admissions_used > 0 ||
        Boolean(row.scanned_at)

      if (!admitted) return
      if (checkedInIdsRef.current.has(row.id)) return

      checkedInIdsRef.current.add(row.id)

      const at =
        row.validated_at ?? row.scanned_at ?? row.updated_at ?? new Date().toISOString()
      const entry: LiveOpsAccessEntry = {
        ticketId: row.id,
        holderName: (row.holder_name ?? "").trim() || "Titular sin nombre",
        tierName: tierNamesRef.current[row.tier_id] ?? "General",
        at,
      }

      setCheckedIn((n) => n + 1)
      setRemaining((n) => Math.max(0, n - 1))
      setFeed((prev) => [entry, ...prev.filter((e) => e.ticketId !== row.id)].slice(0, 10))
    }

    const channel = supabase
      .channel(`live-ops:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const next = payload.new as TicketRow | null
          if (next) applyTicketUpdate(next)
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as TicketRow | null
          if (!row || row.is_test) return
          if (
            row.status === "valid" ||
            row.status === "used" ||
            row.status === "scanned"
          ) {
            setSold((n) => n + 1)
            setRemaining((n) => n + 1)
            if (
              row.status === "used" ||
              row.status === "scanned" ||
              row.admissions_used > 0 ||
              Boolean(row.scanned_at)
            ) {
              applyTicketUpdate(row)
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live")
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("error")
        } else if (status === "CLOSED") {
          setConnection("connecting")
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [eventId])

  async function refreshSnapshot() {
    setRefreshing(true)
    try {
      const result = await getLiveOpsSnapshot(eventId)
      if (!result.ok) return
      const data = result.data
      setSold(data.sold)
      setCheckedIn(data.checkedIn)
      setRemaining(data.remaining)
      setFeed(data.recentAccess)
      checkedInIdsRef.current = new Set(data.checkedInTicketIds)
      tierNamesRef.current = { ...data.tierNamesById }
    } finally {
      setRefreshing(false)
    }
  }

  const occupancy =
    sold > 0 ? Math.min(100, (checkedIn / sold) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
          {connection === "live" ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              En vivo
            </>
          ) : connection === "error" ? (
            <>
              <WifiOff className="size-3.5 text-amber-400" aria-hidden />
              Sin señal Realtime
            </>
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin text-zinc-400" aria-hidden />
              Conectando
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refreshSnapshot()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Activity className="size-3.5" aria-hidden />
          )}
          Sincronizar
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-2">
              <Users className="size-4 text-sky-400" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Aforo actual
              </h2>
            </div>
            <OccupancyRing
              percent={occupancy}
              checkedIn={checkedIn}
              sold={sold}
            />
            <div className="mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-500 ease-out"
                style={{ width: `${occupancy}%` }}
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label="Entradas vendidas"
              value={sold}
              icon={Ticket}
              accent="text-zinc-400"
            />
            <KpiCard
              label="Ya ingresaron"
              value={checkedIn}
              icon={UserRoundCheck}
              accent="text-emerald-400"
              live
            />
            <KpiCard
              label="Faltan ingresar"
              value={remaining}
              icon={Users}
              accent="text-amber-400"
              live
            />
          </section>
        </div>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Log de accesos
            </h2>
          </div>
          {feed.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
              Todavía no hay ingresos registrados.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {feed.map((entry) => (
                <li
                  key={`${entry.ticketId}-${entry.at}`}
                  className="flex gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3 py-3"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {entry.holderName}{" "}
                      <span className="font-normal text-zinc-400">ingresó</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {entry.tierName} · {formatRelativeEs(entry.at, nowMs)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
