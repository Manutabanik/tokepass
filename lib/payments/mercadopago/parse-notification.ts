export type MercadoPagoNotificationKind = "payment" | "chargeback"

export type MercadoPagoNotificationRef = {
  kind: MercadoPagoNotificationKind
  id: string
}

const CHARGEBACK_TOPICS = new Set([
  "chargebacks",
  "chargeback",
  "topic_chargebacks_wh",
  "topic_chargeback_created_wh",
  "topic_chargeback_updated_wh",
])

export function isMercadoPagoChargebackTopic(
  topic: string | null | undefined,
): boolean {
  if (!topic) return false
  const normalized = topic.trim().toLowerCase()
  if (CHARGEBACK_TOPICS.has(normalized)) return true
  return normalized.includes("chargeback")
}

function firstId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

export function parseMercadoPagoNotification(
  url: string,
  rawBody: string,
): MercadoPagoNotificationRef | null {
  const parsed = new URL(url)
  const queryDataId = parsed.searchParams.get("data.id")
  const queryId = parsed.searchParams.get("id")
  const queryTopic =
    parsed.searchParams.get("topic") ?? parsed.searchParams.get("type")

  let bodyTopic: string | null = null
  let bodyDataId: string | null = null
  let bodyId: string | null = null

  try {
    if (rawBody.trim()) {
      const body = JSON.parse(rawBody) as {
        data?: { id?: string | number }
        id?: string | number
        type?: string
        action?: string
        topic?: string
      }
      bodyDataId = firstId(body?.data?.id)
      bodyId = firstId(body?.id)
      bodyTopic = body?.type ?? body?.action ?? body?.topic ?? null
    }
  } catch {
    bodyTopic = null
  }

  const topic = queryTopic ?? bodyTopic
  const id = firstId(queryDataId) ?? bodyDataId ?? firstId(queryId) ?? bodyId

  if (!id) return null

  if (isMercadoPagoChargebackTopic(topic)) {
    return { kind: "chargeback", id }
  }

  return { kind: "payment", id }
}

export function extractMercadoPagoPaymentId(
  url: string,
  rawBody: string,
): string | null {
  const notification = parseMercadoPagoNotification(url, rawBody)
  if (!notification || notification.kind !== "payment") return null
  return notification.id
}
