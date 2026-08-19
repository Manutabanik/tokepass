"use client"

import { usePwaRuntimeStore } from "@/lib/stores/pwa-runtime-store"

/** Chromium `beforeinstallprompt` (no tipado aún en lib.dom). */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt: () => Promise<void>
}

export type PwaPlatform = "ios" | "android" | "desktop"

type NavigatorStandalone = Navigator & { standalone?: boolean }

export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false

  const displayStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches
  const displayMinimal = window.matchMedia(
    "(display-mode: minimal-ui)",
  ).matches
  const iosStandalone = Boolean(
    (window.navigator as NavigatorStandalone).standalone,
  )

  return displayStandalone || displayMinimal || iosStandalone
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false

  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true

  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  )
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android/i.test(navigator.userAgent)
}

export function detectPwaPlatform(): PwaPlatform {
  if (isIosDevice()) return "ios"
  if (isAndroidDevice()) return "android"
  return "desktop"
}

let captureBound = false
let waitingWorker: ServiceWorker | null = null
let userRequestedReload = false

export function setPwaWaitingWorker(worker: ServiceWorker | null) {
  waitingWorker = worker
  usePwaRuntimeStore.getState().setUpdateReady(Boolean(worker))
}

export function applyPwaUpdate() {
  if (typeof window === "undefined") return
  if (userRequestedReload) return
  userRequestedReload = true
  usePwaRuntimeStore.getState().setApplyingUpdate(true)
  waitingWorker?.postMessage("SKIP_WAITING")
  window.setTimeout(() => {
    window.location.reload()
  }, 180)
}

export function ensurePwaInstallCapture() {
  if (captureBound || typeof window === "undefined") return
  captureBound = true

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    if (isPwaStandalone()) return
    usePwaRuntimeStore
      .getState()
      .setDeferredPrompt(event as BeforeInstallPromptEvent)
  })

  window.addEventListener("appinstalled", () => {
    usePwaRuntimeStore.getState().setDeferredPrompt(null)
  })
}

if (typeof window !== "undefined") {
  ensurePwaInstallCapture()
}
