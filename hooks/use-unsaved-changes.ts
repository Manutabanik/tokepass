"use client"

import { useEffect, type RefObject } from "react"

import { isInAppLeaveNavigation } from "@/lib/events/editor-v2-ux"

export const UNSAVED_MAP_CHANGES_MESSAGE =
  "Tenés cambios sin guardar en el mapa. ¿Seguro que querés salir?"

export function useUnsavedChanges(
  isDirty: boolean,
  message = UNSAVED_MAP_CHANGES_MESSAGE,
  options?: {
    interceptLinks?: boolean
    isSubmitting?: boolean
    allowLeaveRef?: RefObject<boolean>
  },
) {
  const interceptLinks = options?.interceptLinks === true
  const isSubmitting = options?.isSubmitting === true
  const allowLeaveRef = options?.allowLeaveRef
  const shouldGuard = isDirty && !isSubmitting

  useEffect(() => {
    if (!shouldGuard) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeaveRef?.current) return
      event.preventDefault()
      event.returnValue = message
      return event.returnValue
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [allowLeaveRef, message, shouldGuard])

  useEffect(() => {
    if (!shouldGuard || !interceptLinks) return

    const handleClick = (event: MouseEvent) => {
      if (allowLeaveRef?.current) return
      if (event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      const nextHref = anchor.getAttribute("href")
      if (!nextHref) return
      if (
        !isInAppLeaveNavigation({
          currentHref: window.location.href,
          nextHref,
          button: event.button,
          modified:
            event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
          targetBlank: Boolean(anchor.target && anchor.target !== "_self"),
          download: anchor.hasAttribute("download"),
        })
      ) {
        return
      }
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [allowLeaveRef, interceptLinks, message, shouldGuard])
}
