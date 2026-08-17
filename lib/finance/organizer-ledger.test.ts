import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildOrganizerFinanceCsv,
  buildOrganizerFinancePdfHtml,
  filterPaidRecentSales,
  paidLedgerCentsFromOrders,
  paidLedgerFromOrders,
  paidLedgerFromRpc,
} from "@/lib/finance/organizer-ledger"

describe("organizer paid ledger", () => {
  it("ignora ordenes pending al calcular GMV, comision y neto", () => {
    const ledger = paidLedgerFromOrders([
      { status: "pending", total_amount: 20000, service_charge: 2000 },
      { status: "failed", total_amount: 8000, service_charge: 800 },
      { status: "paid", total_amount: 5500, service_charge: 500 },
      { status: "PAID", totalAmount: 4500, serviceCharge: 400 },
    ])
    assert.equal(ledger.grossRevenue, 10000)
    assert.equal(ledger.tokepassServiceCharge, 900)
    assert.equal(ledger.organizerNetPayout, 9100)
    const cents = paidLedgerCentsFromOrders([
      { status: "pending", total_amount: 20000, service_charge: 2000 },
      { status: "failed", total_amount: 8000, service_charge: 800 },
      { status: "paid", total_amount: 5500, service_charge: 500 },
      { status: "PAID", totalAmount: 4500, serviceCharge: 400 },
    ])
    assert.equal(cents.grossRevenueCents, 1000000n)
    assert.equal(cents.tokepassServiceChargeCents, 90000n)
    assert.equal(cents.organizerNetPayoutCents, 910000n)
  })

  it("no usa precio de lista: sin ordenes paid el libro queda en cero", () => {
    const ledger = paidLedgerFromOrders([
      { status: "pending", total_amount: 99999, service_charge: 1 },
    ])
    assert.deepEqual(ledger, {
      grossRevenue: 0,
      tokepassServiceCharge: 0,
      organizerNetPayout: 0,
    })
  })

  it("lee el desglose canonico del RPC y filtra ventas recientes pending", () => {
    const ledger = paidLedgerFromRpc({
      gross_revenue: "1500.50",
      tokepass_service_charge: "150.25",
      organizer_net_payout: "1350.25",
      total_revenue: 999999,
    })
    assert.deepEqual(ledger, {
      grossRevenue: 1500.5,
      tokepassServiceCharge: 150.25,
      organizerNetPayout: 1350.25,
    })
    const recent = filterPaidRecentSales([
      { id: "a", status: "pending", amount: 100 },
      { id: "b", status: "paid", amount: 50 },
    ])
    assert.equal(recent.length, 1)
    assert.equal(recent[0]?.id, "b")
  })

  it("unifica panel de inicio y finanzas sobre las mismas claves paid-only", () => {
    const shared = {
      gross_revenue: 20000,
      tokepass_service_charge: 2400,
      organizer_net_payout: 17600,
    }
    const fromMetrics = paidLedgerFromRpc({
      ...shared,
      total_revenue: 20000,
      tickets_sold: 4,
    })
    const fromFinance = paidLedgerFromRpc({
      ...shared,
      grossRevenue: 20000,
      platformFees: 2400,
      netRevenue: 17600,
    })
    assert.deepEqual(fromMetrics, fromFinance)
    assert.equal(fromFinance?.grossRevenue, 20000)
    assert.equal(fromFinance?.tokepassServiceCharge, 2400)
    assert.equal(fromFinance?.organizerNetPayout, 17600)
  })

  it("exporta CSV y HTML PDF desde la misma fuente paid-only", () => {
    const ledger = {
      grossRevenue: 10000,
      tokepassServiceCharge: 1200,
      organizerNetPayout: 8800,
    }
    const csv = buildOrganizerFinanceCsv({ ledger })
    assert.match(csv, /gross_revenue/)
    assert.match(csv, /10000,00/)
    assert.match(csv, /tokepass_service_charge/)
    assert.match(csv, /organizer_net_payout/)
    assert.match(csv, /orders\.status=paid/)
    const html = buildOrganizerFinancePdfHtml({
      ledger,
      organizerLabel: "Productora Test",
    })
    assert.match(html, /status = paid/)
    assert.match(html, /Productora Test/)
    assert.match(html, /organizer_net_payout/)
    assert.match(html, /Solo ordenes liquidadas/)
  })
})
