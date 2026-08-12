"use client"

import { toast } from "sonner"

import { UniversalSeatSelectionFlow } from "@/components/b2c/universal-seat-selection"
import { formatCurrency } from "@/lib/format"
import {
  selectionSummary,
  selectionTotal,
  type UniversalSeatSelection,
} from "@/lib/seating/universal-seat-types"

export default function SeatSelectionDemoClient() {
  function handleContinue(selection: UniversalSeatSelection) {
    toast.success("Selección lista", {
      description: `${selectionSummary(selection)} · ${formatCurrency(selectionTotal(selection))}`,
    })
  }

  return (
    <UniversalSeatSelectionFlow
      eventTitle="Demo · Estadio / Teatro / Mesa VIP"
      onContinue={handleContinue}
    />
  )
}
