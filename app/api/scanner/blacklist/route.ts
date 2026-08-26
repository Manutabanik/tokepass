import { NextResponse, type NextRequest } from "next/server"

import { NO_STORE_HEADERS } from "@/lib/checkout/no-store"
import { loadEventTicketBlacklistIds } from "@/lib/scanner/load-ticket-blacklist"
import { resolveScannerActor } from "@/lib/scanner/resolve-scanner-access"
import { asUuidOrNull } from "@/lib/validations/relation-id"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

function jsonIds(ids: string[], status = 200) {
  return NextResponse.json(ids, { status, headers: NO_STORE_HEADERS })
}

export async function GET(request: NextRequest) {
  const eventId = asUuidOrNull(
    request.nextUrl.searchParams.get("eventId") ??
      request.nextUrl.searchParams.get("event_id"),
    [],
  )
  if (!eventId) {
    return jsonIds([], 400)
  }

  const access = await resolveScannerActor(eventId)
  if (!access.ok) {
    return jsonIds([], access.reason === "auth_required" ? 401 : 403)
  }

  try {
    const ids = await loadEventTicketBlacklistIds(access.db, eventId)
    return jsonIds(ids)
  } catch {
    return jsonIds([], 500)
  }
}
