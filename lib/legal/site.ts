/** Datos societarios de placeholder. Reemplazar con la SRL inscripta. */
export const LEGAL_ENTITY_NAME = "Tokepass S.R.L."
export const LEGAL_ENTITY_CUIT = "[CUIT a completar]"
export const LEGAL_JURISDICTION = "República Argentina"

/** URL del QR Data Fiscal (qr.afip.gob.ar/?qr=…). Hasta tener el hash, apunta a AFIP. */
export const AFIP_DATA_FISCAL_HREF =
  process.env.NEXT_PUBLIC_AFIP_QR_URL?.trim() || "https://www.afip.gob.ar/"

export const LEGAL_NAV = [
  { href: "/terminos-y-condiciones", label: "Términos y condiciones" },
  { href: "/politica-de-privacidad", label: "Privacidad" },
  { href: "/arrepentimiento", label: "Botón de Arrepentimiento" },
] as const
