import { isOnlineDelivery } from "@/lib/events/delivery-mode"
import { cn } from "@/lib/utils"

export function OnlineAccessButton({
  href,
  disabled,
}: {
  href: string | null
  disabled?: boolean
}) {
  const link = href?.trim() || ""
  const ready = Boolean(link) && !disabled

  if (!ready) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
        El organizador todavía no cargó el link de transmisión.
      </p>
    )
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "block w-full rounded-xl bg-emerald-500 py-3 text-center font-bold text-black",
        "hover:bg-emerald-400",
      )}
    >
      Acceder a la transmisión
    </a>
  )
}

export function shouldShowOnlineAccess(mode: unknown) {
  return isOnlineDelivery(mode)
}
