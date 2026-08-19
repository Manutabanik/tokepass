"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

import {
  computeEventCapacityFromForm,
  type EventCapacitySnapshot,
  type TicketPhaseDraft,
} from "@/lib/inventory/capacity-budget"
import { migrateLegacyWizardStep } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"

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

export type EventFormPersistedState = {
  draftKey: string
  eventId: string | null
  values: EventFormValues | null
  venuePricingMap: VenuePricingMap
  zoneTierPricing: ZoneTierPriceDraft[]
  wizardStep: number
  updatedAt: number
}

type EventFormStore = EventFormPersistedState & {
  autosaveStatus: AutosaveStatus
  autosaveError: string | null
  hydrateSession: (input: {
    draftKey: string
    eventId: string | null
    values: EventFormValues
    venuePricingMap?: VenuePricingMap
    zoneTierPricing?: ZoneTierPriceDraft[]
    serverUpdatedAt?: number | null
  }) => void
  setFormValues: (values: EventFormValues) => void
  setVenuePricingMap: (map: VenuePricingMap) => void
  setZoneTierPricing: (rows: ZoneTierPriceDraft[]) => void
  setEventId: (eventId: string) => void
  setWizardStep: (step: number) => void
  setAutosaveStatus: (status: AutosaveStatus, error?: string | null) => void
  clearDraft: (draftKey?: string) => void
}

const EMPTY_PRICING: VenuePricingMap = {}

export const useEventFormStore = create<EventFormStore>()(
  persist(
    (set, get) => ({
      draftKey: "create",
      eventId: null,
      values: null,
      venuePricingMap: EMPTY_PRICING,
      zoneTierPricing: [],
      wizardStep: 0,
      updatedAt: 0,
      autosaveStatus: "idle",
      autosaveError: null,

      hydrateSession: ({
        draftKey,
        eventId,
        values,
        venuePricingMap,
        zoneTierPricing,
        serverUpdatedAt,
      }) => {
        const current = get()
        const sameSession = current.draftKey === draftKey
        const serverMs =
          typeof serverUpdatedAt === "number" && Number.isFinite(serverUpdatedAt)
            ? serverUpdatedAt
            : 0
        const preferLocal =
          sameSession &&
          current.values != null &&
          current.updatedAt > 0 &&
          (serverMs <= 0 || current.updatedAt > serverMs)

        set({
          draftKey,
          eventId: eventId ?? (preferLocal ? current.eventId : eventId),
          values: preferLocal && current.values ? current.values : values,
          venuePricingMap:
            preferLocal && Object.keys(current.venuePricingMap).length > 0
              ? current.venuePricingMap
              : (venuePricingMap ?? EMPTY_PRICING),
          zoneTierPricing:
            preferLocal && current.zoneTierPricing.length > 0
              ? current.zoneTierPricing
              : (zoneTierPricing ?? []),
          updatedAt: preferLocal
            ? current.updatedAt
            : serverMs > 0
              ? serverMs
              : Date.now(),
          autosaveStatus: preferLocal ? "saved" : "idle",
          autosaveError: null,
        })
      },

      setFormValues: (values) =>
        set({
          values,
          updatedAt: Date.now(),
          autosaveStatus: "dirty",
          autosaveError: null,
        }),

      setVenuePricingMap: (map) =>
        set({
          venuePricingMap: map,
          updatedAt: Date.now(),
          autosaveStatus: "dirty",
        }),

      setZoneTierPricing: (rows) =>
        set({
          zoneTierPricing: rows,
          updatedAt: Date.now(),
          autosaveStatus: "dirty",
        }),

      setEventId: (eventId) => set({ eventId, draftKey: `edit:${eventId}` }),

      setWizardStep: (step) => {
        const wizardStep = Math.min(
          EVENT_WIZARD_STEP_COUNT - 1,
          Math.max(0, step),
        )
        if (get().wizardStep === wizardStep) return
        set({ wizardStep })
      },

      setAutosaveStatus: (status, error = null) =>
        set({ autosaveStatus: status, autosaveError: error }),

      clearDraft: (draftKey) => {
        const key = draftKey ?? get().draftKey
        if (get().draftKey !== key) return
        set({
          eventId: null,
          values: null,
          venuePricingMap: EMPTY_PRICING,
          zoneTierPricing: [],
          wizardStep: 0,
          updatedAt: 0,
          autosaveStatus: "idle",
          autosaveError: null,
          draftKey: "create",
        })
      },
    }),
    {
      name: "tokepass.event-form.v1",
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = persisted as EventFormPersistedState
        if (fromVersion >= 2) return state
        return {
          ...state,
          wizardStep: migrateLegacyWizardStep(state.wizardStep),
        }
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        draftKey: state.draftKey,
        eventId: state.eventId,
        values: state.values,
        venuePricingMap: state.venuePricingMap,
        zoneTierPricing: state.zoneTierPricing,
        wizardStep: state.wizardStep,
        updatedAt: state.updatedAt,
      }),
    },
  ),
)

/** Derivado: nunca persistir la suma, solo recalcular desde el formulario. */
export function selectEventCapacity(
  state: Pick<EventFormPersistedState, "values">,
): EventCapacitySnapshot {
  return computeEventCapacityFromForm(state.values)
}
