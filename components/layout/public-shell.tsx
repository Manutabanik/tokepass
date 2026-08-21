"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { FloatingBottomNav } from "@/components/layout/floating-bottom-nav"
import { isPublicEventStorefrontPath } from "@/lib/navigation/focused-flows"
import { useStorefrontChromeStore } from "@/lib/stores/storefront-chrome-store"
import { cn } from "@/lib/utils"

export function StorefrontChromeGate({
  children,
}: {
  children: ReactNode
}) {
  const checkoutTunnel = useStorefrontChromeStore(
    (state) => state.checkoutTunnel,
  )
  if (checkoutTunnel) return null
  return children
}

export function PublicShell({
  navbar,
  footer,
  children,
}: {
  navbar: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const checkoutTunnel = useStorefrontChromeStore(
    (state) => state.checkoutTunnel,
  )
  const pathname = usePathname()
  const eventStorefront = isPublicEventStorefrontPath(pathname)

  return (
    <div
      className={cn(
        "flex min-h-dvh w-full max-w-full flex-col bg-background text-foreground",
        !eventStorefront && !checkoutTunnel && "overflow-x-hidden",
        checkoutTunnel && "relative h-[100dvh] overflow-hidden",
      )}
    >
      {checkoutTunnel ? null : navbar}
      <main
        className={cn(
          "flex w-full max-w-full flex-1 flex-col",
          checkoutTunnel
            ? "min-h-0 overflow-hidden"
            : cn(
                "pt-[calc(4rem+env(safe-area-inset-top)+1rem)]",
                eventStorefront
                  ? "overflow-visible pb-24"
                  : "min-h-0 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0",
              ),
        )}
      >
        {children}
      </main>
      {checkoutTunnel ? null : footer}
      {/* Hidden on event storefront so it never collides with Adquirir Entradas. */}
      {checkoutTunnel || eventStorefront ? null : <FloatingBottomNav />}
    </div>
  )
}
