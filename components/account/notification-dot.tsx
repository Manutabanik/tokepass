import { cn } from "@/lib/utils"

/** Punto rojo de novedad (48px touch targets viven en el control padre). */
export function NotificationDot({
  show,
  className,
  label = "Tenés notificaciones sin leer",
}: {
  show: boolean
  className?: string
  label?: string
}) {
  if (!show) return null

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "absolute right-0.5 top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950",
        className,
      )}
    />
  )
}
