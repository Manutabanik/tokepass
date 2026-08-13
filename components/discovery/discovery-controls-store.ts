"use client"

import { useSyncExternalStore } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"

export type DiscoveryControlsState = {
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  events: CatalogEvent[]
}

let controls: DiscoveryControlsState | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function publishDiscoveryControls(next: DiscoveryControlsState | null) {
  controls = next
  emit()
}

export function subscribeDiscoveryControls(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDiscoveryControls() {
  return controls
}

export function useDiscoveryControls() {
  return useSyncExternalStore(
    subscribeDiscoveryControls,
    getDiscoveryControls,
    () => null,
  )
}
