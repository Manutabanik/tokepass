"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  getLiveOpsSnapshot,
  isLiveOpsCheckedIn,
  liveOpsAccessAt,
  type LiveOpsAccessEntry,
  type LiveOpsHourBucket,
  type LiveOpsSectorStat,
  type LiveOpsSnapshot,
  type LiveOpsTierStat,
} from "@/app/actions/live-ops"
import { createClient } from "@/lib/supabase/client"
import type { Ticket as TicketRow } from "@/types/database"

export type ConnectionState = "connecting" | "live" | "error"

export type FlowBucket = {
  key: string
  label: string
  startMs: number
  count: number
}

export type LiveMetrics = {
  sold: number
  checkedIn: number
  remaining: number
  capacity: number
  occupancyPercent: number
  rpm5: number
  rpm15: number
  peakLabel: string
  flowBuckets: FlowBucket[]
  feed: LiveOpsAccessEntry[]
  tierBreakdown: LiveOpsTierStat[]
  sectorBreakdown: LiveOpsSectorStat[]
  connection: ConnectionState
  refreshing: boolean
  refresh: () => Promise<void>
}

const FEED_LIMIT = 20
const HOUR_MS = 60 * 60 * 1000

function floorToHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS
}

function formatHourLabel(startMs: number): string {
  const d = new Date(startMs)
  return `${String(d.getHours()).padStart(2, "0")}:00`
}

function bucketsFromHours(hours: LiveOpsHourBucket[], nowMs: number): FlowBucket[] {
  const counts = new Map<number, number>()
  for (const bucket of hours) {
    const t = new Date(bucket.startIso).getTime()
    if (!Number.isFinite(t)) continue
    counts.set(floorToHour(t), bucket.count)
  }
  const nowHour = floorToHour(nowMs)
  if (!counts.has(nowHour)) counts.set(nowHour, 0)

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({
      key: String(start),
      label: formatHourLabel(start),
      startMs: start,
      count,
    }))
}

function computePeakLabel(buckets: FlowBucket[]): string {
  if (buckets.length === 0) return "Sin datos"
  let best = buckets[0]!
  for (const b of buckets) {
    if (b.count > best.count) best = b
  }
  if (best.count === 0) return "Sin pico aún"
  const endHour = (best.startMs / HOUR_MS + 1) % 24
  const endLabel = `${String(Math.floor(endHour)).padStart(2, "0")}:00`
  return `${best.label}–${endLabel}`
}

function ratePerMinute(timestamps: string[], windowMin: number, nowMs: number): number {
  const windowMs = windowMin * 60 * 1000
  const count = timestamps.filter((iso) => {
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && nowMs - t <= windowMs && nowMs - t >= 0
  }).length
  return count / windowMin
}

function pruneWindow(timestamps: string[], nowMs: number): string[] {
  const maxAge = 15 * 60 * 1000
  return timestamps.filter((iso) => {
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && nowMs - t <= maxAge
  })
}

export function useLiveMetrics(
  eventId: string,
  initial: LiveOpsSnapshot,
): LiveMetrics {
  const [sold, setSold] = useState(initial.sold)
  const [checkedIn, setCheckedIn] = useState(initial.checkedIn)
  const [remaining, setRemaining] = useState(initial.remaining)
  const [capacity, setCapacity] = useState(initial.capacity)
  const [checkInWindow, setCheckInWindow] = useState<string[]>(
    initial.recentCheckInAt,
  )
  const [hourBuckets, setHourBuckets] = useState<LiveOpsHourBucket[]>(
    initial.hourBuckets,
  )
  const [feed, setFeed] = useState<LiveOpsAccessEntry[]>(initial.recentAccess)
  const [tierBreakdown, setTierBreakdown] = useState<LiveOpsTierStat[]>(
    initial.tierBreakdown,
  )
  const [sectorBreakdown, setSectorBreakdown] = useState<LiveOpsSectorStat[]>(
    initial.sectorBreakdown,
  )
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [refreshing, setRefreshing] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const seenIdsRef = useRef(new Set(initial.recentAccess.map((e) => e.ticketId)))
  const tierNamesRef = useRef({ ...initial.tierNamesById })

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const applyCheckIn = useCallback((row: TicketRow) => {
    if (row.event_id !== eventId || row.is_test) return
    if (seenIdsRef.current.has(row.id)) return
    seenIdsRef.current.add(row.id)

    const at = liveOpsAccessAt({
      validated_at: row.validated_at,
      scanned_at: row.scanned_at,
      updated_at: row.updated_at ?? new Date().toISOString(),
    })

    const entry: LiveOpsAccessEntry = {
      ticketId: row.id,
      holderName: (row.holder_name ?? "").trim() || "Titular sin nombre",
      tierName: tierNamesRef.current[row.tier_id] ?? "General",
      at,
    }

    setCheckedIn((n) => n + 1)
    setRemaining((n) => Math.max(0, n - 1))
    setCheckInWindow((prev) => pruneWindow([...prev, at], Date.now()))
    setHourBuckets((prev) => {
      const hourIso = new Date(floorToHour(new Date(at).getTime())).toISOString()
      const idx = prev.findIndex(
        (b) => floorToHour(new Date(b.startIso).getTime()) === floorToHour(new Date(at).getTime()),
      )
      if (idx === -1) {
        return [...prev, { startIso: hourIso, count: 1 }]
      }
      const next = [...prev]
      next[idx] = { ...next[idx]!, count: next[idx]!.count + 1 }
      return next
    })
    setFeed((prev) =>
      [entry, ...prev.filter((e) => e.ticketId !== row.id)].slice(0, FEED_LIMIT),
    )
    setTierBreakdown((prev) => {
      const idx = prev.findIndex((t) => t.tierId === row.tier_id)
      if (idx === -1) {
        return [
          ...prev,
          {
            tierId: row.tier_id,
            name: tierNamesRef.current[row.tier_id] ?? "General",
            sold: 1,
            checkedIn: 1,
          },
        ]
      }
      const next = [...prev]
      const current = next[idx]!
      next[idx] = { ...current, checkedIn: current.checkedIn + 1 }
      return next
    })
  }, [eventId])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`realtime:tickets:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const prev = payload.old as TicketRow | null
          const next = payload.new as TicketRow | null
          if (!next || next.is_test) return
          const wasIn = prev ? isLiveOpsCheckedIn(prev) : false
          const nowIn = isLiveOpsCheckedIn(next)
          if (!wasIn && nowIn) applyCheckIn(next)
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
  }, [eventId, applyCheckIn])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await getLiveOpsSnapshot(eventId)
      if (!result.ok) return
      const data = result.data
      setSold(data.sold)
      setCheckedIn(data.checkedIn)
      setRemaining(data.remaining)
      setCapacity(data.capacity)
      setCheckInWindow(data.recentCheckInAt)
      setHourBuckets(data.hourBuckets)
      setFeed(data.recentAccess)
      setTierBreakdown(data.tierBreakdown)
      setSectorBreakdown(data.sectorBreakdown)
      seenIdsRef.current = new Set(data.recentAccess.map((e) => e.ticketId))
      tierNamesRef.current = { ...data.tierNamesById }
    } finally {
      setRefreshing(false)
    }
  }, [eventId])

  const flowBuckets = useMemo(
    () => bucketsFromHours(hourBuckets, nowMs),
    [hourBuckets, nowMs],
  )

  const occupancyPercent =
    capacity > 0 ? Math.min(100, (checkedIn / capacity) * 100) : 0

  return {
    sold,
    checkedIn,
    remaining,
    capacity,
    occupancyPercent,
    rpm5: ratePerMinute(checkInWindow, 5, nowMs),
    rpm15: ratePerMinute(checkInWindow, 15, nowMs),
    peakLabel: computePeakLabel(flowBuckets),
    flowBuckets,
    feed,
    tierBreakdown,
    sectorBreakdown,
    connection,
    refreshing,
    refresh,
  }
}
