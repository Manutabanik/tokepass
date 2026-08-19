"use client"

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { applyPwaUpdate } from "@/lib/pwa/runtime"
import { usePwaRuntimeStore } from "@/lib/stores/pwa-runtime-store"
import { useStorefrontChromeStore } from "@/lib/stores/storefront-chrome-store"
import { cn } from "@/lib/utils"

export function PwaUpdateBanner() {
  const updateReady = usePwaRuntimeStore((state) => state.updateReady)
  const applyingUpdate = usePwaRuntimeStore((state) => state.applyingUpdate)
  const checkoutTunnel = useStorefrontChromeStore(
    (state) => state.checkoutTunnel,
  )

  if (!updateReady || checkoutTunnel) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "no-print pointer-events-none fixed right-4 bottom-4 z-[70] max-w-sm",
        "left-4 sm:left-auto",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto rounded-2xl border border-border bg-card p-4 text-card-foreground",
          "shadow-lg shadow-black/10 ring-1 ring-border/60",
        )}
      >
        <p className="text-sm font-semibold leading-5 text-foreground">
          Hay una nueva versión disponible de TokePass.
        </p>
        <Button
          type="button"
          disabled={applyingUpdate}
          onClick={() => applyPwaUpdate()}
          className="mt-3 h-10 w-full rounded-xl"
        >
          <RefreshCw
            className={cn("size-4", applyingUpdate && "animate-spin")}
            aria-hidden="true"
          />
          Actualizar
        </Button>
      </div>
    </div>
  )
}
