export const OPEN_CLAIM_RECEIVER_EMAIL = "share@tokepass.invalid"

export function isOpenClaimReceiverEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OPEN_CLAIM_RECEIVER_EMAIL
}

export function buildTicketClaimUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "")
  return `${base}/claim/${encodeURIComponent(token.trim())}`
}

export function buildWhatsAppTicketShareText(
  claimUrl: string,
  eventTitle: string,
): string {
  const title = eventTitle.trim() || "el evento"
  return `Hola! Aca tenes tu entrada oficial para ${title}. Toca este link de TokePass para guardarla en tu celular y generar tu codigo QR: ${claimUrl}. Tenes 24 horas para aceptarla.`
}

export function buildWhatsAppTicketShareUrl(claimUrl: string, eventTitle: string): string {
  return `https://wa.me/?text=${encodeURIComponent(
    buildWhatsAppTicketShareText(claimUrl, eventTitle),
  )}`
}

export function openWhatsAppTicketShare(claimUrl: string, eventTitle: string) {
  if (typeof window === "undefined") return
  const url = buildWhatsAppTicketShareUrl(claimUrl, eventTitle)
  const popup = window.open(url, "_blank", "noopener,noreferrer")
  if (!popup) {
    window.location.assign(url)
  }
}
