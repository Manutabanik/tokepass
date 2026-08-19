import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  doorAccessWhatsAppText,
  doorAccessWhatsAppUrl,
} from "@/lib/scanner/door-whatsapp"

describe("door WhatsApp share", () => {
  it("builds the exact staff message with event and PIN", () => {
    const text = doorAccessWhatsAppText({
      eventTitle: "Fiesta Norte",
      pin: "482910",
    })
    assert.equal(
      text,
      "Acceso al escáner de TokePass para Fiesta Norte. Ingresa a tokepass.com.ar/puerta y utiliza este PIN de acceso: 482910. No cierres la pestaña.",
    )
    assert.match(doorAccessWhatsAppUrl({ eventTitle: "Fiesta Norte", pin: "482910" }), /^https:\/\/wa\.me\/\?text=/)
  })
})
