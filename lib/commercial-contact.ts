export function commercialWhatsAppHref(message: string): string | null {
  const raw =
    process.env.NEXT_PUBLIC_TOKEPASS_COMMERCIAL_WHATSAPP?.trim() || ""
  const digits = raw.replace(/[^\d]/g, "")
  if (digits.length < 10) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
