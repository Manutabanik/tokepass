"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import {
  detectPwaPlatform,
  ensurePwaInstallCapture,
  isIosDevice,
  isPwaStandalone,
  PWA_INSTALL_DISMISS_KEY,
  wasPwaInstallDismissedRecently,
  type BeforeInstallPromptEvent,
  type PwaPlatform,
} from "@/lib/pwa/runtime"
import { usePwaRuntimeStore } from "@/lib/stores/pwa-runtime-store"

export type { BeforeInstallPromptEvent, PwaPlatform }

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

export {
  detectPwaPlatform,
  isIosDevice,
  isPwaStandalone,
} from "@/lib/pwa/runtime"

export function usePwaInstall() {
  const deferredPrompt = usePwaRuntimeStore((state) => state.deferredPrompt)
  const setDeferredPrompt = usePwaRuntimeStore(
    (state) => state.setDeferredPrompt,
  )
  const setIosGuideOpen = usePwaRuntimeStore((state) => state.setIosGuideOpen)

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
  const platform = useSyncExternalStore(
    () => () => {},
    detectPwaPlatform,
    () => "desktop" as PwaPlatform,
  )
  const [dismissed, setDismissed] = useState(true)
  const [clientReady, setClientReady] = useState(false)

  useEffect(() => {
    ensurePwaInstallCapture()
    const readyTimer = window.setTimeout(() => {
      setDismissed(wasPwaInstallDismissedRecently())
      setClientReady(true)
    }, 0)
    return () => window.clearTimeout(readyTimer)
  }, [])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore quota / private mode
    }
    setDismissed(true)
    setDeferredPrompt(null)
  }, [setDeferredPrompt])

  const openIosGuide = useCallback(() => {
    setIosGuideOpen(true)
  }, [setIosGuideOpen])

  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unavailable" | "ios"
  > => {
    if (isIos || platform === "ios") {
      openIosGuide()
      return "ios"
    }
    if (!deferredPrompt) return "unavailable"

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      return outcome
    } catch {
      return "unavailable"
    }
  }, [deferredPrompt, isIos, openIosGuide, platform, setDeferredPrompt])

  const canNativeInstall = Boolean(deferredPrompt) && !isIos
  const canShowInstallCta = !isStandalone && (canNativeInstall || isIos)
  const canShowBanner =
    clientReady && !dismissed && canShowInstallCta

  return {
    deferredPrompt,
    isStandalone,
    isIos,
    isAndroid: platform === "android",
    platform,
    dismissed,
    ready: clientReady,
    canNativeInstall,
    canShowInstallCta,
    canShowBanner,
    dismiss,
    promptInstall,
    openIosGuide,
  }
}
