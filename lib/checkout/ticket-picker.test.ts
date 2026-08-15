import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  generalAdmissionTabLabel,
  parseDefaultTicketTab,
  resolveDefaultTicketPickerTab,
  resolveTicketHighlightBadge,
  ticketPickerTabLabel,
} from "@/lib/checkout/ticket-picker"

describe("ticket picker taxonomy", () => {
  it("renames seated to Ubicaciones and extras to Combos/Extras", () => {
    assert.equal(ticketPickerTabLabel("seated", []), "Ubicaciones")
    assert.equal(ticketPickerTabLabel("bundle", []), "Combos")
    assert.equal(ticketPickerTabLabel("addon", []), "Extras")
  })

  it("labels general as Campo when a tier uses that word", () => {
    assert.equal(
      generalAdmissionTabLabel([{ name: "Campo" }, { name: "VIP" }]),
      "Campo",
    )
    assert.equal(
      generalAdmissionTabLabel([{ name: "Acceso al predio" }]),
      "Entrada General",
    )
  })

  it("opens the tab with the most remaining stock, not seated by default", () => {
    const tabs = ["seated", "general", "addon"] as const
    const grouped = {
      seated: [{ available: 200 }],
      general: [{ available: 8000 }, { available: 400 }],
      addon: [{ available: 80 }],
      bundle: [],
    }
    assert.equal(
      resolveDefaultTicketPickerTab({ tabs: [...tabs], grouped }),
      "general",
    )
  })

  it("honors the organizer default tab when that tab exists", () => {
    const tabs = ["seated", "general"] as const
    const grouped = {
      seated: [{ available: 40 }],
      general: [{ available: 9000 }],
      addon: [],
      bundle: [],
    }
    assert.equal(
      resolveDefaultTicketPickerTab({
        tabs: [...tabs],
        grouped,
        configured: "seated",
      }),
      "seated",
    )
  })

  it("falls back to auto when the configured tab is missing", () => {
    assert.equal(parseDefaultTicketTab("campo"), "auto")
    const grouped = {
      seated: [],
      general: [{ available: 10 }],
      addon: [{ available: 50 }],
      bundle: [],
    }
    assert.equal(
      resolveDefaultTicketPickerTab({
        tabs: ["general", "addon"],
        grouped,
        configured: "seated",
      }),
      "addon",
    )
  })

  it("prefers Entrada General over Ubicaciones when remaining stock ties", () => {
    const grouped = {
      seated: [{ available: 100 }],
      general: [{ available: 100 }],
      addon: [],
      bundle: [],
    }
    assert.equal(
      resolveDefaultTicketPickerTab({
        tabs: ["seated", "general"],
        grouped,
      }),
      "general",
    )
  })

  it("marks the unique top-sold general as más vendida", () => {
    const peers = [
      { id: "campo", sold: 1200 },
      { id: "vip", sold: 80 },
    ]
    assert.equal(
      resolveTicketHighlightBadge({ id: "campo", sold: 1200 }, peers),
      "bestseller",
    )
    assert.equal(
      resolveTicketHighlightBadge({ id: "vip", sold: 80 }, peers),
      null,
    )
  })

  it("does not auto-badge a sold tie, but keeps an organizer badge", () => {
    const peers = [
      { id: "a", sold: 10, highlightBadge: "bestseller" as const },
      { id: "b", sold: 40 },
    ]
    assert.equal(
      resolveTicketHighlightBadge(peers[0], peers),
      "bestseller",
    )
    assert.equal(resolveTicketHighlightBadge(peers[1], peers), null)
  })
})
