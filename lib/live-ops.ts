export type LiveOpsAccessEntry = {
  ticketId: string
  holderName: string
  tierName: string
  at: string
}

export type LiveOpsTierStat = {
  tierId: string
  name: string
  sold: number
  checkedIn: number
}

export type LiveOpsSectorStat = {
  sectorKey: string
  sectorName: string
  sold: number
  checkedIn: number
}

export type LiveOpsHourBucket = {
  startIso: string
  count: number
}

export type LiveOpsSnapshot = {
  eventId: string
  eventTitle: string
  eventDate: string | null
  capacity: number
  sold: number
  checkedIn: number
  remaining: number
  rpm5: number
  rpm15: number
  /** Timestamps de check-in de los últimos 15 minutos (para RPM). */
  recentCheckInAt: string[]
  hourBuckets: LiveOpsHourBucket[]
  recentAccess: LiveOpsAccessEntry[]
  tierBreakdown: LiveOpsTierStat[]
  sectorBreakdown: LiveOpsSectorStat[]
  tierNamesById: Record<string, string>
}

export function isLiveOpsCheckedIn(row: {
  status: string
  admissions_used?: number | null
  scanned_at?: string | null
}): boolean {
  return (
    row.status === "used" ||
    row.status === "scanned" ||
    (row.admissions_used ?? 0) > 0 ||
    Boolean(row.scanned_at)
  )
}

export function liveOpsAccessAt(row: {
  validated_at?: string | null
  scanned_at?: string | null
  updated_at?: string | null
}): string {
  return row.validated_at ?? row.scanned_at ?? row.updated_at ?? new Date().toISOString()
}
