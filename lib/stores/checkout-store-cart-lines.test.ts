import assert from "node:assert/strict"
import { before, describe, it } from "node:test"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const general = "550e8400-e29b-41d4-a716-446655440099"

function installLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return
  const memory = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key) => memory.get(String(key)) ?? null,
    setItem: (key, value) => {
      memory.set(String(key), String(value))
    },
    removeItem: (key) => {
      memory.delete(String(key))
    },
    clear: () => {
      memory.clear()
    },
    key: (index) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size
    },
  }
}

describe("setCartLines", () => {
  before(installLocalStorage)

  it("does not write again when the tunnel resyncs unstamped lines", async () => {
    const { useCheckoutStore } = await import("./checkout-store")
    const store = useCheckoutStore.getState()
    store.clearCart()
    store.setServiceChargeRule({ rate: 0.15, absorbFees: false })

    const incoming = [
      {
        id: `${general}_${friday}`,
        ticketTierId: general,
        name: "General",
        detail: "2 entradas",
        dateId: friday,
        dateLabel: "Viernes",
        scheduleId: friday,
        dateString: "Viernes",
        sectorName: "General",
        quantity: 2,
        price: 10000,
      },
    ]

    store.setCartLines(incoming, { replaceGeneralDays: [friday, null] })
    const afterFirst = useCheckoutStore.getState()
    assert.equal(afterFirst.lines.length, 1)
    assert.ok((afterFirst.lines[0]?.basePrice ?? 0) > 0)

    const linesRef = afterFirst.lines
    const quantitiesRef = afterFirst.quantities

    store.setCartLines(incoming, { replaceGeneralDays: [friday, null] })
    const afterSecond = useCheckoutStore.getState()
    assert.equal(afterSecond.lines, linesRef)
    assert.equal(afterSecond.quantities, quantitiesRef)
  })
})
