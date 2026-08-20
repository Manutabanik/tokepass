import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildTicketClaimUrl,
  buildWhatsAppTicketShareText,
  buildWhatsAppTicketShareUrl,
  isOpenClaimReceiverEmail,
} from "./ticket-share"

describe("ticket share links", () => {
  it("builds a path-based claim URL", () => {
    assert.equal(
      buildTicketClaimUrl("https://tokepass.com.ar/", "abc123"),
      "https://tokepass.com.ar/claim/abc123",
    )
  })

  it("opens WhatsApp with the claim URL and no emoji", () => {
    const url = buildWhatsAppTicketShareUrl(
      "https://tokepass.com.ar/claim/tok_1",
      "Noche Neon",
    )
    assert.equal(url.startsWith("https://wa.me/?text="), true)
    const text = decodeURIComponent(url.split("text=")[1] ?? "")
    assert.equal(
      text,
      buildWhatsAppTicketShareText(
        "https://tokepass.com.ar/claim/tok_1",
        "Noche Neon",
      ),
    )
    assert.equal(
      text,
      "Hola! Aca tenes tu entrada oficial para Noche Neon. Toca este link de TokePass para guardarla en tu celular y generar tu codigo QR: https://tokepass.com.ar/claim/tok_1. Tenes 24 horas para aceptarla.",
    )
    assert.equal(/\p{Extended_Pictographic}/u.test(text), false)
    assert.equal(/[áéíóúÁÉÍÓÚ]/.test(text), false)
  })

  it("detects the open-claim sentinel email", () => {
    assert.equal(isOpenClaimReceiverEmail("share@tokepass.invalid"), true)
    assert.equal(isOpenClaimReceiverEmail("amigo@mail.com"), false)
  })
})
