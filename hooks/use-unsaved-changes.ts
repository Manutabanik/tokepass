"use client"

import { useEffect } from "react"

export const UNSAVED_MAP_CHANGES_MESSAGE =
  "Tenés cambios sin guardar en el mapa. ¿Seguro que querés salir?"

export function useUnsavedChanges(
  isDirty: boolean,
  message = UNSAVED_MAP_CHANGES_MESSAGE,
) {
  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
      return event.returnValue
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty, message])
}
