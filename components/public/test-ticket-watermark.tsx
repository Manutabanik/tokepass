import { AlertTriangle } from "lucide-react"

import { TEST_TICKET_WATERMARK } from "@/lib/preview/sandbox"
import { cn } from "@/lib/utils"

export function TestTicketWatermark({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center",
        className,
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "-rotate-12 rounded-xl border-2 border-amber-400/90 bg-amber-200/85 text-center font-black uppercase tracking-[0.12em] text-amber-950 shadow-[0_0_24px_rgba(245,158,11,0.35)]",
          compact
            ? "flex max-w-[90%] items-center gap-1.5 px-2 py-1 text-[9px]"
            : "flex max-w-[92%] flex-col items-center gap-1 px-4 py-2 text-[11px]",
        )}
      >
        <AlertTriangle
          className={cn(compact ? "size-3" : "size-4", "shrink-0")}
          aria-hidden="true"
        />
        <span>{TEST_TICKET_WATERMARK}</span>
      </div>
    </div>
  )
}
