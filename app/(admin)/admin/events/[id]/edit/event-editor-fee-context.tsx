"use client"

import { createContext, useContext, type ReactNode } from "react"

import {
  defaultEventFeeConfig,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"

const EventEditorFeeContext = createContext<EventFeeConfig>(
  defaultEventFeeConfig(),
)

export function EventEditorFeeProvider({
  fee,
  children,
}: {
  fee: EventFeeConfig
  children: ReactNode
}) {
  return (
    <EventEditorFeeContext.Provider value={fee}>
      {children}
    </EventEditorFeeContext.Provider>
  )
}

export function useEventEditorFee(): EventFeeConfig {
  return useContext(EventEditorFeeContext)
}
