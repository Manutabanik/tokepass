import { ShieldCheck } from "lucide-react"

import { BrandMark } from "@/components/shared/brand-logo"
import { cn } from "@/lib/utils"

const PRESENCIAL_COPY =
  "Entrada nominada vinculada al DNI. Acceso 100% seguro sin intermediarios."
const ONLINE_COPY = "Acceso nominado. El link llega a tu mail."

export function TokepassGuaranteeBadge({
  variant = "full",
  className,
  isOnline = false,
}: {
  variant?: "full" | "compact"
  className?: string
  isOnline?: boolean
}) {
  const detail = isOnline ? ONLINE_COPY : PRESENCIAL_COPY
  const fullCopy = `Garantía TokePass: ${detail}`
  if (variant === "compact") {
    return (
      <p
        className={cn(
          "flex items-start gap-1.5 text-[11px] leading-4 text-zinc-600 dark:text-zinc-400",
          className,
        )}
      >
        <BrandMark size="sm" className="mt-0.5 size-4 rounded-[0.3rem] ring-0" />
        <span className="min-w-0">
          <ShieldCheck className="mr-1 inline size-3 align-[-2px] text-emerald-600 dark:text-emerald-400" />
          {fullCopy}
        </span>
      </p>
    )
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5",
        className,
      )}
    >
      <BrandMark size="sm" className="size-8 rounded-[0.55rem] ring-0" />
      <p className="min-w-0 text-xs leading-5 text-foreground">
        <span className="inline-flex items-center gap-1 font-semibold">
          <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          Garantía TokePass:
        </span>{" "}
        {detail}
      </p>
    </div>
  )
}
