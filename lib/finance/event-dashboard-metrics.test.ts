import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeEventDashboardMetrics,
  eventDashboardMetricsFromRpc,
} from "./event-dashboard-metrics"

describe("computeEventDashboardMetrics", () => {
  it("ignores sandbox tickets and test_sandbox orders", () => {
    const metrics = computeEventDashboardMetrics({
      capacity: 100,
      tickets: [
        { order_id: "live", status: "valid", is_test: false },
        { order_id: "live", status: "valid", is_test: false },
        { order_id: "sandbox", status: "valid", is_test: true },
        { order_id: "sandbox-order", status: "valid", is_test: false },
        { order_id: "pending", status: "pending_payment", is_test: false },
      ],
      orders: [
        {
          id: "live",
          status: "paid",
          total_amount: 22000,
          is_test: false,
          payment_method: "mercadopago",
        },
        {
          id: "sandbox",
          status: "paid",
          total_amount: 11000,
          is_test: true,
        },
        {
          id: "sandbox-order",
          status: "paid",
          total_amount: 11000,
          payment_method: "test_sandbox",
        },
        { id: "pending", status: "pending", total_amount: 11000 },
      ],
    })

    assert.equal(metrics.ticketsSold, 2)
    assert.equal(metrics.revenue, 22000)
    assert.equal(metrics.capacity, 100)
    assert.equal(metrics.available, 98)
  })
})

describe("eventDashboardMetricsFromRpc", () => {
  it("reads the production payload", () => {
    assert.deepEqual(
      eventDashboardMetricsFromRpc({
        tickets_sold: 3,
        revenue: 33000,
        capacity: 200,
      }),
      {
        ticketsSold: 3,
        revenue: 33000,
        capacity: 200,
        available: 197,
      },
    )
  })
})
