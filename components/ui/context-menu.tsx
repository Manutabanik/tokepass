"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

function ContextMenu({
  open,
  x,
  y,
  onOpenChange,
  children,
  className,
}: {
  open: boolean
  x: number
  y: number
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return
      onOpenChange(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false)
    }

    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onOpenChange])

  if (!open || typeof document === "undefined") return null

  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.min(y, window.innerHeight - 320)

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-slot="context-menu"
      style={{ left, top }}
      className={cn(
        "fixed z-[80] min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none",
        "animate-in fade-in-0 zoom-in-95",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

const menuItemClassName =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none select-none hover:bg-muted focus:bg-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function ContextMenuItem({
  className,
  onSelect,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-slot="context-menu-item"
      className={cn(menuItemClassName, className)}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.()
      }}
      {...props}
    />
  )
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="context-menu-separator"
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export { ContextMenu, ContextMenuItem, ContextMenuSeparator }
