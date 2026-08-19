export const ORGANIZER_LANDING_PATH = "/organizar-eventos"
export const ORGANIZER_REGISTER_HREF = "/register-organizador"
export const ORGANIZER_LEAD_HREF = ORGANIZER_REGISTER_HREF

const COMMERCIAL_MESSAGE =
  "Hola TokePass, quiero hablar con el equipo comercial para organizar un evento."

export function commercialWhatsAppHref(message: string): string | null {
  const raw =
    process.env.NEXT_PUBLIC_TOKEPASS_COMMERCIAL_WHATSAPP?.trim() || ""
  const digits = raw.replace(/[^\d]/g, "")
  if (digits.length < 10) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function commercialContactHref(
  message: string = COMMERCIAL_MESSAGE,
): string {
  const whatsapp = commercialWhatsAppHref(message)
  if (whatsapp) return whatsapp
  const email =
    process.env.NEXT_PUBLIC_TOKEPASS_COMMERCIAL_EMAIL?.trim() ||
    "comercial@tokepass.com.ar"
  return `mailto:${email}?subject=${encodeURIComponent(
    "Consulta comercial TokePass",
  )}&body=${encodeURIComponent(message)}`
}
