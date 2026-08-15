"use client"

import { create } from "zustand"

type PublicSearchUiState = {
  openTick: number
  openSearch: () => void
}

export const usePublicSearchUiStore = create<PublicSearchUiState>((set) => ({
  openTick: 0,
  openSearch: () => set((state) => ({ openTick: state.openTick + 1 })),
}))
