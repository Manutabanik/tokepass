"use client"

import { create } from "zustand"

import type { BeforeInstallPromptEvent } from "@/lib/pwa/runtime"

type PwaRuntimeState = {
  deferredPrompt: BeforeInstallPromptEvent | null
  iosGuideOpen: boolean
  updateReady: boolean
  applyingUpdate: boolean
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void
  setIosGuideOpen: (open: boolean) => void
  setUpdateReady: (ready: boolean) => void
  setApplyingUpdate: (applying: boolean) => void
}

export const usePwaRuntimeStore = create<PwaRuntimeState>((set) => ({
  deferredPrompt: null,
  iosGuideOpen: false,
  updateReady: false,
  applyingUpdate: false,
  setDeferredPrompt: (deferredPrompt) => set({ deferredPrompt }),
  setIosGuideOpen: (iosGuideOpen) => set({ iosGuideOpen }),
  setUpdateReady: (updateReady) => set({ updateReady }),
  setApplyingUpdate: (applyingUpdate) => set({ applyingUpdate }),
}))
