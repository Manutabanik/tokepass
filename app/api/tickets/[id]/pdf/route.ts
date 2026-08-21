import { NextResponse, type NextRequest } from "next/server"

import {
  loadAuthorizedTicketsForPdf,
  loadTicketPdfAudits,
} from "@/lib/pdf/ticket-pdf-access"
import { renderAdmissionTicketPdf } from "@/lib/pdf/render-ticket-pdf"
import {
  parseTicketPdfIds,
  parseTicketPdfSize,
  ticketPdfFilename,
} from "@/lib/pdf/ticket-pdf-model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(status: number, error: string, message: string, id: string) {
  return NextResponse.json(
    {
      error,
      message,
      fallback: `/tickets/${id}/print`,
    },
    { status },
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const query = request.nextUrl.searchParams
  const size = parseTicketPdfSize(query.get("size"))
  const ids = parseTicketPdfIds(id, query.get("ids"))
  const download =
    query.get("download") === "1" || query.get("download") === "true"

  try {
    const tickets = await loadAuthorizedTicketsForPdf(ids)
    if (tickets === "unauthorized") {
      return jsonError(
        401,
        "auth_required",
        "Iniciá sesión para descargar el ticket PDF.",
        id,
      )
    }
    if (tickets === "not_found") {
      return jsonError(404, "ticket_not_found", "No encontramos esa entrada.", id)
    }

    const audits = await loadTicketPdfAudits(tickets.map((ticket) => ticket.id))
    const pdf = await renderAdmissionTicketPdf({
      tickets,
      audits,
      format: size,
    })

    const filename = ticketPdfFilename(tickets[0]?.id ?? id)
    const disposition = download ? "attachment" : "inline"

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[ticket-pdf]", error)
    return jsonError(
      500,
      "ticket_pdf_failed",
      "No se pudo generar el ticket PDF.",
      id,
    )
  }
}
