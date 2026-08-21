import { POST as handleMercadoPagoWebhook } from "@/app/api/webhooks/mercadopago/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = handleMercadoPagoWebhook
