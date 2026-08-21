import { CalendarOff, TicketX } from "lucide-react"

import { cn } from "@/lib/utils"

export function EventSaleStatusNotice({
  state,
}: {
  state: "finished" | "sold_out"
}) {
  const finished = state === "finished"

  return (
    <div
      role="status"
      className={cn(
        "rounded-3xl border px-5 py-8 text-center shadow-sm",
        finished
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
          : "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40",
      )}
    >
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-2xl",
          finished
            ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            : "bg-red-600 text-white",
        )}
      >
        {finished ? (
          <CalendarOff className="size-6" aria-hidden />
        ) : (
          <TicketX className="size-6" aria-hidden />
        )}
      </span>
      <p
        className={cn(
          "mt-4 text-xs font-bold uppercase tracking-[0.16em]",
          finished
            ? "text-zinc-600 dark:text-zinc-400"
            : "text-red-700 dark:text-red-300",
        )}
      >
        {finished ? "Este evento ya pasó" : "Entradas agotadas"}
      </p>
      <p className="mt-2 text-base font-semibold leading-6 text-zinc-900 dark:text-white">
        {finished
          ? "Este evento ya pasó. Gracias a todos los que participaron."
          : "Ya no quedan entradas disponibles para este evento."}
      </p>
    </div>
  )
}
