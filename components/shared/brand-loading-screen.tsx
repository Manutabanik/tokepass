import { Loader2 } from "lucide-react"

import { BrandLogo } from "@/components/shared/brand-logo"

export function BrandLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-4"
    >
      <div className="relative flex size-20 items-center justify-center">
        <Loader2
          className="absolute size-20 animate-spin text-violet-500/35"
          aria-hidden="true"
        />
        <div className="animate-pulse">
          <BrandLogo href={null} markOnly size="lg" />
        </div>
      </div>
      <p className="animate-pulse text-sm font-medium text-muted-foreground">
        Cargando...
      </p>
      <span className="sr-only">Cargando TokePass</span>
    </div>
  )
}
