"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

const DISMISS_KEY = "tokepass-pwa-install-dismissed-at"
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Chromium `beforeinstallprompt` (no tipado aún en lib.dom). */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt: () => Promise<void>
}

function readDismissedRecently(): boolean {
  if (typeof window === "undefined") return true
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false

  const displayStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches
  const displayMinimal = window.matchMedia(
    "(display-mode: minimal-ui)",
  ).matches
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
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

function subscribeStandalone(onStoreChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)")
  const onInstalled = () => onStoreChange()

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onStoreChange)
  } else {
    media.addListener(onStoreChange)
  }
  window.addEventListener("appinstalled", onInstalled)

  return () => {
    if (typeof media.removeEventListener === "function") {
      media.removeEventListener("change", onStoreChange)
    } else {
      media.removeListener(onStoreChange)
    }
    window.removeEventListener("appinstalled", onInstalled)
  }
}

export function usePwaInstall() {
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    isPwaStandalone,
    () => false,
  )
  const isIos = useSyncExternalStore(
    () => () => {},
    isIosDevice,
    () => false,
  )
  const [dismissed, setDismissed] = useState(true)
  const [clientReady, setClientReady] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const readyTimer = window.setTimeout(() => {
      setDismissed(readDismissedRecently())
      setClientReady(true)
    }, 0)

    function onBeforeInstall(event: Event) {
      const enableInDev = process.env.NEXT_PUBLIC_PWA === "1"
      if (process.env.NODE_ENV !== "production" && !enableInDev) {
        return
      }
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)

    return () => {
      window.clearTimeout(readyTimer)
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
    }
  }, [])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore quota / private mode
    }
    setDismissed(true)
  }, [])

  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unavailable" | "ios"
  > => {
    if (isIos) return "ios"
    if (!deferredPrompt) return "unavailable"

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      return outcome
    } catch {
      return "unavailable"
    }
  }, [deferredPrompt, isIos])

  const canNativeInstall = Boolean(deferredPrompt) && !isIos
  const canShowBanner =
    clientReady &&
    !isStandalone &&
    !dismissed &&
    (canNativeInstall || isIos)

  return {
    deferredPrompt,
    isStandalone,
    isIos,
    dismissed,
    ready: clientReady,
    canNativeInstall,
    canShowBanner,
    dismiss,
    promptInstall,
  }
}
