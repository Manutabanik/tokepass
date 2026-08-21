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
        El link de acceso se activa unos minutos antes del evento. Te avisamos
        por email.
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
      Entrar al vivo
    </a>
  )
}

export function shouldShowOnlineAccess(mode: unknown) {
  return isOnlineDelivery(mode)
}
