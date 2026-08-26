import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isMissingIsDeletedColumn, withActiveEvents } from "./soft-delete"

describe("soft-delete catalog fallback", () => {
  it("detects a missing is_deleted column", () => {
    assert.equal(
      isMissingIsDeletedColumn(
        '{"code":"42703","message":"column events.is_deleted does not exist"}',
      ),
      true,
    )
    assert.equal(isMissingIsDeletedColumn("PGRST204 schema cache"), false)
    assert.equal(isMissingIsDeletedColumn(null), false)
  })

  it("only applies the filter when the column exists", () => {
    const calls: Array<[string, boolean]> = []
    const query = {
      eq(column: "is_deleted", value: false) {
        calls.push([column, value])
        return this
      },
    }
    assert.equal(withActiveEvents(query, false), query)
    assert.equal(calls.length, 0)
    withActiveEvents(query, true)
    assert.deepEqual(calls, [["is_deleted", false]])
  })
})
