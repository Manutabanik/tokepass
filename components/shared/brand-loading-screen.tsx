import { BrandLogo } from "@/components/shared/brand-logo"

export function BrandLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4"
    >
      <div className="relative flex h-16 w-16 animate-pulse items-center justify-center">
        <BrandLogo href={null} markOnly size="lg" />
      </div>
      <p className="animate-pulse text-sm font-medium text-muted-foreground">
        Cargando...
      </p>
      <span className="sr-only">Cargando Tokepass</span>
    </div>
  )
}
