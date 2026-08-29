"use client"

import { createContext, useContext, type ReactNode } from "react"

import {
  defaultEventFeeConfig,
  fallbackFeePercentagePoints,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"

const EventEditorFeeContext = createContext<EventFeeConfig>(
  defaultEventFeeConfig(),
)

function withFeeFallback(fee: EventFeeConfig): EventFeeConfig {
  return {
    ...fee,
    platformFeePercentage: fallbackFeePercentagePoints(
      fee.platformFeePercentage,
    ),
  }
}

export function EventEditorFeeProvider({
  fee,
  children,
}: {
  fee: EventFeeConfig
  children: ReactNode
}) {
  return (
    <EventEditorFeeContext.Provider value={withFeeFallback(fee)}>
      {children}
    </EventEditorFeeContext.Provider>
  )
}

export function useEventEditorFee(): EventFeeConfig {
  return useContext(EventEditorFeeContext)
}
