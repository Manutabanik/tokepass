import { NextResponse } from "next/server"
import { z } from "zod"

import { scanAndValidateTicket } from "@/app/actions/scanner"
import { NO_STORE_HEADERS } from "@/lib/checkout/no-store"
import { scanReplayHttpStatus } from "@/lib/scanner/scan-replay"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BodySchema = z.object({
  payload: z.string().trim().min(1),
  eventId: z.string().uuid(),
  gateId: z.string().trim().min(1).max(200).optional().nullable(),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: "invalid_payload",
        message: "Payload de escaneo inválido",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        status: "invalid_payload",
        message: "Payload de escaneo inválido",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const result = await scanAndValidateTicket(
    parsed.data.payload,
    parsed.data.eventId,
    parsed.data.gateId,
  )
  return NextResponse.json(result, {
    status: scanReplayHttpStatus(result),
    headers: NO_STORE_HEADERS,
  })
}
