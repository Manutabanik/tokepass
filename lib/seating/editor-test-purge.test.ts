import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  editorTestTicketIdsToDelete,
  editorTestUnitIdsToRelease,
  eventStatusTreatsPurchasesAsDraft,
  isEditorTestOrder,
} from "./editor-test-purge"

describe("editor-test-purge", () => {
  it("trata sandbox y draft como compras de prueba", () => {
    assert.equal(eventStatusTreatsPurchasesAsDraft("draft"), true)
    assert.equal(eventStatusTreatsPurchasesAsDraft("published"), false)
    assert.equal(isEditorTestOrder({ is_test: true }), true)
    assert.equal(isEditorTestOrder({ environment: "test" }), true)
    assert.equal(
      isEditorTestOrder({ is_test: false, environment: "production" }),
      false,
    )
  })

  it("en borrador libera todas las mesas vendidas o reservadas", () => {
    assert.deepEqual(
      editorTestUnitIdsToRelease(
        [
          { id: "u1", status: "sold", soldOrderId: "live" },
          { id: "u2", status: "reserved" },
          { id: "u3", status: "available" },
        ],
        [],
        "draft",
      ),
      ["u1", "u2"],
    )
  })

  it("en publicado solo libera unidades de órdenes de prueba", () => {
    assert.deepEqual(
      editorTestUnitIdsToRelease(
        [
          { id: "u1", status: "sold", soldOrderId: "test-1" },
          { id: "u2", status: "sold", soldOrderId: "live-1" },
          { id: "u3", status: "reserved", reservedOrderId: "test-1" },
        ],
        ["test-1"],
        "published",
      ),
      ["u1", "u3"],
    )
  })

  it("borra tickets de prueba o de asiento en eventos no publicados", () => {
    assert.deepEqual(
      editorTestTicketIdsToDelete(
        [
          { id: "t1", isTest: true },
          { id: "t2", isTest: false, orderId: "test-1" },
          { id: "t3", isTest: false, seatingUnitId: "u1" },
          { id: "t4", isTest: false },
        ],
        ["test-1"],
        "draft",
      ),
      ["t1", "t2", "t3"],
    )
    assert.deepEqual(
      editorTestTicketIdsToDelete(
        [
          { id: "t1", isTest: true },
          { id: "t2", isTest: false, seatingUnitId: "u1" },
        ],
        [],
        "published",
      ),
      ["t1"],
    )
  })
})
