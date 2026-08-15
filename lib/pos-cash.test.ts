import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cashChangeDue,
  cashTenderSuggestions,
  POS_EXPRESS_DNI,
  POS_EXPRESS_NAME,
  resolvePosBuyer,
} from "@/lib/pos-cash"

describe("POS cash suggestions and express buyer", () => {
  it("rounds cash tenders to common Argentine bills", () => {
    assert.deepEqual(cashTenderSuggestions(115_000).slice(0, 3), [
      120_000, 150_000, 200_000,
    ])
    assert.equal(cashTenderSuggestions(0).length, 0)
  })

  it("computes change without going negative", () => {
    assert.equal(cashChangeDue(115_000, 150_000), 35_000)
    assert.equal(cashChangeDue(115_000, 100_000), 0)
  })

  it("fills Consumidor Final when express or DNI is missing", () => {
    assert.deepEqual(resolvePosBuyer({ express: true, dni: "", name: "" }), {
      dni: POS_EXPRESS_DNI,
      name: POS_EXPRESS_NAME,
    })
    assert.deepEqual(
      resolvePosBuyer({ express: false, dni: "30111222", name: "Ana" }),
      { dni: "30111222", name: "Ana" },
    )
  })
})
