import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { AdmissionTicketPdf } from "@/lib/pdf/ticket-thermal-template"
import {
  mapPrintableTicketToPdfModel,
  type ThermalTicketPdfModel,
  type TicketPdfAudit,
  type TicketPdfSize,
  type TicketPdfSource,
} from "@/lib/pdf/ticket-pdf-model"

const QR_PX = 512
const FLYER_TIMEOUT_MS = 8000

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function sniffImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  return null
}

export async function ticketQrDataUri(payload: string): Promise<string> {
  const value = payload.trim()
  if (!value) {
    throw new Error("qr_payload_empty")
  }
  return QRCode.toDataURL(value, {
    margin: 1,
    width: QR_PX,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  })
}

export async function fetchTicketFlyerDataUri(
  flyerUrl: string | null | undefined,
): Promise<string | null> {
  const raw = flyerUrl?.trim()
  if (!raw || !isHttpUrl(raw)) return null
  try {
    const response = await fetch(raw, {
      signal: AbortSignal.timeout(FLYER_TIMEOUT_MS),
      headers: { Accept: "image/png,image/jpeg" },
    })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    const headerType = response.headers.get("content-type")?.split(";")[0]?.trim()
    const mime =
      headerType === "image/png" || headerType === "image/jpeg"
        ? headerType
        : sniffImageMime(bytes)
    if (!mime) return null
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
  } catch {
    return null
  }
}

export async function buildTicketPdfModel(
  ticket: TicketPdfSource,
  audit: TicketPdfAudit,
): Promise<ThermalTicketPdfModel> {
  const [qrDataUri, eventFlyerSrc] = await Promise.all([
    ticketQrDataUri(ticket.qrPayload),
    fetchTicketFlyerDataUri(ticket.flyerUrl),
  ])
  return mapPrintableTicketToPdfModel(ticket, audit, { qrDataUri, eventFlyerSrc })
}

export async function renderAdmissionTicketPdf(input: {
  tickets: TicketPdfSource[]
  audits?: Map<string, TicketPdfAudit>
  format: TicketPdfSize
}): Promise<Buffer> {
  if (input.tickets.length === 0) {
    throw new Error("ticket_pdf_empty")
  }
  const audits = input.audits ?? new Map<string, TicketPdfAudit>()
  const models = await Promise.all(
    input.tickets.map((ticket) =>
      buildTicketPdfModel(
        ticket,
        audits.get(ticket.id) ?? {
          orderId: null,
          paymentMethod: null,
          issuedAt: null,
        },
      ),
    ),
  )
  return renderToBuffer(
    <AdmissionTicketPdf tickets={models} format={input.format} />,
  )
}
