"use client"

import { ArrowLeft } from "lucide-react"
import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { AppTakeover } from "@/components/ui/app-takeover"
import { Button } from "@/components/ui/button"

export function TokepassStudioOverlay({
  open,
  onClose,
  closing = false,
  children,
}: {
  open: boolean
  onClose: () => void
  closing?: boolean
  children: ReactNode
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [open])

  if (!open || !mounted) return null

  return createPortal(
    <AppTakeover>
      <Button
        type="button"
        variant="destructive"
        disabled={closing}
        onClick={onClose}
        className="absolute top-4 left-4 z-10"
      >
        <ArrowLeft />
        Guardar y Cerrar Estudio
      </Button>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {children}
      </div>
    </AppTakeover>,
    document.body,
  )
}
