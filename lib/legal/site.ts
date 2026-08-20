/** Sociedad administradora de la plataforma TokePass. */
export const LEGAL_ENTITY_NAME = "EMPREID S.R.L."
export const LEGAL_ENTITY_LEGAJO = "6467"
export const LEGAL_ENTITY_ADDRESS =
  "calle Mendoza 1750 Sur, Rawson, San Juan, Argentina"
export const LEGAL_ENTITY_CUIT = "[CUIT a completar]"
export const LEGAL_JURISDICTION =
  "Provincia de San Juan, República Argentina"

/** URL del QR Data Fiscal (qr.afip.gob.ar/?qr=…). Hasta tener el hash, apunta a AFIP. */
export const AFIP_DATA_FISCAL_HREF =
  process.env.NEXT_PUBLIC_AFIP_QR_URL?.trim() || "https://www.afip.gob.ar/"

export const LEGAL_TERMS_HREF = "/terminos-y-condiciones"
export const LEGAL_PRIVACY_HREF = "/politica-de-privacidad"
/** Anexo de privacidad de Cloudflare Turnstile (modo invisible). */
export const TURNSTILE_PRIVACY_HREF =
  "https://www.cloudflare.com/en-gb/turnstile-privacy-policy/"
export const TURNSTILE_PRIVACY_LOCAL_HREF = "/legal/turnstile-privacy"

export const LEGAL_NAV = [
  { href: LEGAL_TERMS_HREF, label: "Términos y condiciones" },
  { href: LEGAL_PRIVACY_HREF, label: "Privacidad" },
  { href: "/arrepentimiento", label: "Botón de Arrepentimiento" },
] as const
