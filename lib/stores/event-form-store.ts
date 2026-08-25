"use client"

import { create } from "zustand"

import {
  computeEventCapacityFromForm,
  type EventCapacitySnapshot,
  type TicketPhaseDraft,
} from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

export type { TicketPhaseDraft }

export const EVENT_WIZARD_STEP_COUNT = 5

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

export type ZoneTierPriceDraft = {
  id?: string
  sectorKey: string
  sectorName: string
  ticketTierId: string
  ticketTierName: string
  price: number
  tableNumberStart: number | null
  tableNumberEnd: number | null
}

type EventFormStore = {
  eventId: string | null
  autosaveStatus: AutosaveStatus
  autosaveError: string | null
  setEventId: (eventId: string | null) => void
  setAutosaveStatus: (status: AutosaveStatus, error?: string | null) => void
  clearSession: () => void
}

/**
 * Estado efímero de UI (indicador de autoguardado + id en memoria).
 * No persiste el formulario: la fuente de verdad es Postgres + RHF.
 */
export const useEventFormStore = create<EventFormStore>()((set) => ({
  eventId: null,
  autosaveStatus: "idle",
  autosaveError: null,

  setEventId: (eventId) => set({ eventId }),

  setAutosaveStatus: (status, error = null) =>
    set({ autosaveStatus: status, autosaveError: error }),

  clearSession: () =>
    set({
      eventId: null,
      autosaveStatus: "idle",
      autosaveError: null,
    }),
}))

/** Derivado: nunca persistir la suma, solo recalcular desde el formulario. */
export function selectEventCapacity(values: EventFormValues | null): EventCapacitySnapshot {
  return computeEventCapacityFromForm(values)
}
