"use client"

import { create } from "zustand"

type PublicSearchUiState = {
  openTick: number
  openSearch: () => void
  filterPending: boolean
  requestFilters: () => void
  consumeFilters: () => void
}

export const usePublicSearchUiStore = create<PublicSearchUiState>((set) => ({
  openTick: 0,
  openSearch: () => set((state) => ({ openTick: state.openTick + 1 })),
  filterPending: false,
  requestFilters: () => set({ filterPending: true }),
  consumeFilters: () => set({ filterPending: false }),
}))
