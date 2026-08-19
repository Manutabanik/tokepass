import Link from "next/link"
import { PauseCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function EventUnavailableNotice({
  title,
  status,
}: {
  title: string
  status: string
}) {
  const isPaused = status === "paused"
  const isDraft =
    status === "draft" ||
    status === "pending_approval" ||
    status === "needs_revision" ||
    status === "rejected"

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30">
        <PauseCircle className="size-7" aria-hidden="true" />
      </span>
      <p className="mt-5 text-sm font-semibold text-amber-700 dark:text-amber-300">
        {isPaused ? "Evento pausado" : isDraft ? "Borrador" : "No disponible"}
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {isPaused
          ? "Este evento se encuentra pausado por el organizador."
          : isDraft
            ? "Este evento todavía no está publicado. Volvé más tarde."
            : "Este evento no está disponible para la venta en este momento."}
      </p>
      <Button
        className="mt-8 min-h-12 rounded-full bg-foreground text-background hover:opacity-90"
        nativeButton={false}
        render={<Link href="/events" />}
      >
        Volver al catálogo
      </Button>
    </section>
  )
}
