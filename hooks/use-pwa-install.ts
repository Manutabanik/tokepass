"use client"

import { useCallback, useEffect, useState } from "react"

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

  // iPadOS 13+ se reporta como MacIntel con touch.
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  )
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setIsStandalone(isPwaStandalone())
    setIsIos(isIosDevice())
    setDismissed(readDismissedRecently())
    setReady(true)

    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    function onDisplayModeChange() {
      setIsStandalone(isPwaStandalone())
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)

    const media = window.matchMedia("(display-mode: standalone)")
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onDisplayModeChange)
    } else {
      media.addListener(onDisplayModeChange)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onDisplayModeChange)
      } else {
        media.removeListener(onDisplayModeChange)
      }
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

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable" | "ios"> => {
    if (isIos) return "ios"
    if (!deferredPrompt) return "unavailable"

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      if (outcome === "accepted") {
        setIsStandalone(true)
      }
      return outcome
    } catch {
      return "unavailable"
    }
  }, [deferredPrompt, isIos])

  const canNativeInstall = Boolean(deferredPrompt) && !isIos
  const canShowBanner =
    ready &&
    !isStandalone &&
    !dismissed &&
    (canNativeInstall || isIos)

  return {
    deferredPrompt,
    isStandalone,
    isIos,
    dismissed,
    ready,
    canNativeInstall,
    canShowBanner,
    dismiss,
    promptInstall,
  }
}
