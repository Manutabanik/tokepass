"use client"

import type { ReactNode } from "react"

import { FloatingBottomNav } from "@/components/layout/floating-bottom-nav"
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

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col bg-background text-foreground",
        checkoutTunnel && "relative h-[100dvh] overflow-hidden",
      )}
    >
      {checkoutTunnel ? null : navbar}
      <main
        className={cn(
          "relative z-20 flex-1",
          checkoutTunnel
            ? "min-h-0 overflow-hidden"
            : "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0",
        )}
      >
        {children}
      </main>
      {checkoutTunnel ? null : footer}
      {/* Portaled to document.body inside the component to avoid overflow/stacking traps. */}
      {checkoutTunnel ? null : <FloatingBottomNav />}
    </div>
  )
}
