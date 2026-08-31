import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { isStrictEmail, normalizeEmail } from "@/lib/checkout/guest-input"
import { getEmailAppUrl, sendOrderTicketsEmail } from "@/lib/email/resend"
import { walletReceiptUrl } from "@/lib/email/receipt-copy"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

const ticketSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
})

const bodySchema = z.object({
  to: z
    .string()
    .trim()
    .transform((value) => normalizeEmail(value))
    .refine(isStrictEmail, "Escribí un correo válido (ej: nombre@gmail.com)"),
  customerName: z.string().trim().min(1),
  orderNumber: z.string().trim().min(1),
  eventName: z.string().trim().min(1),
  eventDate: z.string().trim().min(1),
  eventVenue: z.string().trim().min(1),
  eventBannerUrl: z.string().trim().url().optional(),
  totalAmount: z.union([z.number().finite(), z.string().trim().min(1)]),
  tickets: z.array(ticketSchema).min(1),
  accountUrl: z.string().trim().url().optional(),
})

function authorizeSendTickets(request: NextRequest): boolean {
  const secret = process.env.CHECKOUT_FULFILLMENT_SECRET?.trim()
  if (!secret) return false

  const auth = request.headers.get("authorization")
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const headerSecret = request.headers.get("x-tokepass-email-secret")?.trim()
  return secret === bearer || secret === headerSecret
}

export async function POST(request: NextRequest) {
  if (!authorizeSendTickets(request)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 },
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 },
    )
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Datos de orden inválidos" },
      { status: 400 },
    )
  }

  const order = parsed.data

  try {
    const { messageId } = await sendOrderTicketsEmail({
      to: order.to,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      eventName: order.eventName,
      eventDate: order.eventDate,
      eventVenue: order.eventVenue,
      eventBannerUrl: order.eventBannerUrl,
      totalAmount: order.totalAmount,
      tickets: order.tickets,
      accountUrl: order.accountUrl || walletReceiptUrl(getEmailAppUrl()),
    })
    return NextResponse.json({ success: true, messageId })
  } catch (error) {
    logger.error({
      context: "api/send-tickets",
      message: "unexpected_send_error",
      order_id: order.orderNumber,
      error,
    })
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron enviar las entradas.",
      },
      { status: 500 },
    )
  }
}
