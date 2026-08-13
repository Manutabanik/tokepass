"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/60 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "left",
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: "left" | "right" | "bottom" | "top"
  showCloseButton?: boolean
}) {
  const isEdge = side === "left" || side === "right"

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col outline-none duration-200 data-open:animate-in data-closed:animate-out",
          isEdge &&
            "h-dvh w-[min(100%,20rem)] bg-[#09090b] text-zinc-100 shadow-none",
          side === "left" &&
            "inset-y-0 left-0 border-r border-white/8 data-open:slide-in-from-left data-closed:slide-out-to-left",
          side === "right" &&
            "inset-y-0 right-0 border-l border-white/8 data-open:slide-in-from-right data-closed:slide-out-to-right",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[min(92dvh,100%)] w-full rounded-t-3xl border border-zinc-200/80 bg-white text-zinc-900 shadow-2xl data-open:slide-in-from-bottom data-closed:slide-out-to-bottom dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100",
          side === "top" &&
            "inset-x-0 top-0 max-h-[min(92dvh,100%)] w-full rounded-b-3xl border border-zinc-200/80 bg-white text-zinc-900 shadow-2xl data-open:slide-in-from-top data-closed:slide-out-to-top dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "absolute top-3 right-3",
                  isEdge
                    ? "text-zinc-400 hover:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
                )}
              />
            }
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-1.5 border-b border-zinc-200/80 p-4 dark:border-white/8",
        className,
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto border-t border-zinc-200/80 p-4 dark:border-white/8",
        className,
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-base font-semibold text-zinc-900 dark:text-white",
        className,
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-zinc-500", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
