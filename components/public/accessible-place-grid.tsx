"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  chunkSeatMatrixGroups,
  compactSeatToken,
  groupSeatsForMatrix,
} from "@/lib/seating/accessible-seat-matrix"
import type {
  AccessibleRowNode,
  AccessibleSeatNode,
} from "@/lib/seating/accessible-seat-tree"
import { cn } from "@/lib/utils"

const SELECTED_GLOW =
  "shadow-[0_0_15px_color-mix(in_srgb,var(--primary)_40%,transparent)]"

export function AccessiblePlaceGrid({
  rows,
  pending = false,
  onToggle,
}: {
  rows: AccessibleRowNode[]
  pending?: boolean
  onToggle: (seat: AccessibleSeatNode) => void
}) {
  const chunks = chunkSeatMatrixGroups(groupSeatsForMatrix(rows))

  if (chunks.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">
        No hay lugares disponibles en este sector.
      </p>
    )
  }

  if (chunks.length === 1) {
    const chunk = chunks[0]!
    return (
      <section aria-labelledby={`place-chunk-${chunk.title}`}>
        <h3
          id={`place-chunk-${chunk.title}`}
          className="mb-3 text-sm font-semibold text-foreground"
        >
          {chunk.title}
        </h3>
        <PlaceButtonGrid
          chunkTitle={chunk.title}
          pending={pending}
          seats={chunk.seats}
          onToggle={onToggle}
        />
      </section>
    )
  }

  return (
    <Accordion
      multiple
      defaultValue={[`${chunks[0]?.title ?? ""}-0`]}
      className="flex flex-col gap-2"
    >
      {chunks.map((chunk, index) => (
        <AccordionItem
          key={`${chunk.title}-${index}`}
          value={`${chunk.title}-${index}`}
          className="overflow-hidden rounded-2xl border border-border bg-card px-2"
        >
          <AccordionTrigger className="min-h-12 px-3 py-3 hover:no-underline">
            <span className="text-left text-sm font-semibold text-foreground">
              {chunk.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4">
            <PlaceButtonGrid
              chunkTitle={chunk.title}
              pending={pending}
              seats={chunk.seats}
              onToggle={onToggle}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function PlaceButtonGrid({
  chunkTitle,
  seats,
  pending,
  onToggle,
}: {
  chunkTitle: string
  seats: AccessibleSeatNode[]
  pending: boolean
  onToggle: (seat: AccessibleSeatNode) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {seats.map((seat) => (
        <ChunkyPlaceButton
          key={seat.id}
          chunkTitle={chunkTitle}
          pending={pending}
          seat={seat}
          onToggle={() => onToggle(seat)}
        />
      ))}
    </div>
  )
}

function ChunkyPlaceButton({
  seat,
  chunkTitle,
  pending,
  onToggle,
}: {
  seat: AccessibleSeatNode
  chunkTitle: string
  pending: boolean
  onToggle: () => void
}) {
  const token = compactSeatToken(seat.label, seat.number).replace(
    /^0+(?=\d)/,
    "",
  )
  const selected = seat.status === "selected"

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={selected}
      aria-label={
        selected
          ? `${chunkTitle} ${token}, seleccionado`
          : `${chunkTitle} ${token}`
      }
      onClick={onToggle}
      className={cn(
        "flex min-h-12 items-center justify-center rounded-xl border-2 p-3 font-semibold select-none touch-manipulation transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        !selected &&
          "border-border bg-card text-foreground hover:border-primary",
        selected &&
          `border-primary bg-primary text-primary-foreground ${SELECTED_GLOW}`,
        pending && "pointer-events-none opacity-60",
      )}
    >
      <span className="tabular-nums">{token}</span>
    </button>
  )
}
