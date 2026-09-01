import { NextResponse, type NextRequest } from "next/server"

import { NO_STORE_HEADERS } from "@/lib/checkout/no-store"
import { loadScannerGates } from "@/lib/scanner/load-scanner-catalog"
import {
  classifyScannerSetupError,
  isScannerSetupError,
} from "@/lib/scanner/scanner-setup-error"
import { asUuidOrNull } from "@/lib/validations/relation-id"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request: NextRequest) {
  const eventId = asUuidOrNull(
    request.nextUrl.searchParams.get("eventId") ??
      request.nextUrl.searchParams.get("event_id"),
    [],
  )
  if (!eventId) {
    return NextResponse.json(
      { ok: false, code: "unknown", error: "Falta el evento." },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const gates = await loadScannerGates(eventId)
    return NextResponse.json(
      { ok: true, gates },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    const classified = isScannerSetupError(error)
      ? { code: error.code, message: error.message }
      : classifyScannerSetupError(error)
    const status =
      classified.code === "auth_required"
        ? 401
        : classified.code === "forbidden"
          ? 403
          : 500
    return NextResponse.json(
      { ok: false, code: classified.code, error: classified.message },
      { status, headers: NO_STORE_HEADERS },
    )
  }
}
