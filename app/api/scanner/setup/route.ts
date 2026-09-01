import { NextResponse } from "next/server"

import { NO_STORE_HEADERS } from "@/lib/checkout/no-store"
import {
  loadScannerEvents,
  loadScannerOperatorLabel,
} from "@/lib/scanner/load-scanner-catalog"
import {
  classifyScannerSetupError,
  isScannerSetupError,
} from "@/lib/scanner/scanner-setup-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    const [events, operatorName] = await Promise.all([
      loadScannerEvents(),
      loadScannerOperatorLabel(),
    ])
    return NextResponse.json(
      { ok: true, events, operatorName },
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
