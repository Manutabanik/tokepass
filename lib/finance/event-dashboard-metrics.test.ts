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
    assert.equal(metrics.webSold, 2)
    assert.equal(metrics.paperIssued, 0)
    assert.equal(metrics.revenue, 22000)
    assert.equal(metrics.capacity, 100)
    assert.equal(metrics.available, 98)
  })

  it("splits web sales from paper prints and keeps digital remaining", () => {
    const metrics = computeEventDashboardMetrics({
      capacity: 100,
      tickets: [
        {
          order_id: "web",
          status: "valid",
          is_test: false,
          issuance_channel: "online",
        },
        {
          order_id: "web",
          status: "valid",
          is_test: false,
          issuance_channel: "online",
        },
        {
          order_id: "paper",
          status: "valid",
          is_test: false,
          issuance_channel: "batch_print",
        },
        {
          order_id: "paper",
          status: "valid",
          is_test: false,
          issuance_channel: "batch_print",
        },
        {
          order_id: "paper",
          status: "valid",
          is_test: false,
          issuance_channel: "batch_print",
        },
      ],
      orders: [
        {
          id: "web",
          status: "paid",
          total_amount: 22000,
          is_test: false,
          payment_method: "mercadopago",
        },
        {
          id: "paper",
          status: "paid",
          total_amount: 0,
          is_test: false,
          payment_method: "cash_pos",
        },
      ],
    })

    assert.equal(metrics.webSold, 2)
    assert.equal(metrics.paperIssued, 3)
    assert.equal(metrics.ticketsSold, 2)
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
        webSold: 3,
        paperIssued: 0,
        revenue: 33000,
        capacity: 200,
        available: 197,
      },
    )
  })

  it("reads the split web / paper payload", () => {
    assert.deepEqual(
      eventDashboardMetricsFromRpc({
        tickets_sold: 12,
        web_sold: 12,
        paper_issued: 40,
        revenue: 99000,
        capacity: 100,
        available: 80,
      }),
      {
        ticketsSold: 12,
        webSold: 12,
        paperIssued: 40,
        revenue: 99000,
        capacity: 100,
        available: 80,
      },
    )
  })
})
