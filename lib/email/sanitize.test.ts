import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  escapeHtml,
  sanitizeEmailSubject,
  sanitizeEmailText,
} from "@/lib/email/sanitize"

describe("email sanitize", () => {
  it("escapa markup en HTML", () => {
    assert.equal(
      escapeHtml(`</p><img src=x onerror="alert(1)">`),
      `&lt;/p&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;`,
    )
  })

  it("saca CR/LF del subject y recorta a 120", () => {
    assert.equal(sanitizeEmailSubject("Hola\r\nBcc: evil@x.com"), "Hola Bcc: evil@x.com")
    assert.equal(sanitizeEmailText("a".repeat(200)).length, 120)
  })
})
