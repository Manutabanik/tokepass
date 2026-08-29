import { cn } from "@/lib/utils"

export function IncludesServiceFeeHint({
  price,
  className,
}: {
  price: number
  className?: string
}) {
  if (price <= 0) return null
  return (
    <p className={cn("text-xs text-muted-foreground italic", className)}>
      (Incluye cargo por servicio)
    </p>
  )
}
