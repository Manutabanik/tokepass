"use client"

import { Palette } from "lucide-react"
import { useMemo, useState } from "react"

import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { venueTicketTypeOptions } from "@/lib/seating/studio-bulk-edit"
import type { VenueMapSkuTicketRef } from "@/lib/seating/venue-map-sku-consistency"
import { venueUnitPriceLabel, type VenueMapElement } from "@/types/venue-map"

export function VenueTicketTypeSelect({
  tickets,
  value,
  onChange,
}: {
  tickets?: VenueMapSkuTicketRef[] | null
  value?: string
  onChange: (ticket: { id: string; name?: string; price?: number }) => void
}) {
  const ticketOptions = venueTicketTypeOptions(tickets)
  if (ticketOptions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Creá tipos de entrada en el inventario para asignarlos acá.
      </p>
    )
  }
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (!next) return
        const option = ticketOptions.find((item) => item.id === next)
        if (!option) return
        onChange(option)
      }}
      items={ticketOptions.map((item) => ({
        value: item.id,
        label: item.name,
      }))}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {ticketOptions.find((item) => item.id === value)?.name ??
            "Asignar tipo de entrada"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ticketOptions.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function VenueBulkEditPanel({
  elements,
  allElements,
  selectedIds,
  tickets,
  onPrice,
  onColor,
  onCapacity,
  onCustomLabel,
  onTicketType,
  onApplyElements,
  showNumbering = true,
}: {
  elements: VenueMapElement[]
  allElements: VenueMapElement[]
  selectedIds: string[]
  tickets?: VenueMapSkuTicketRef[] | null
  onPrice: (price: number) => void
  onColor: (color: string) => void
  onCapacity: (capacity: number) => void
  onCustomLabel: (label: string) => void
  onTicketType: (ticket: { id: string; name?: string; price?: number }) => void
  onApplyElements: (next: VenueMapElement[]) => void
  showNumbering?: boolean
}) {
  const sharedColor = elements.every((item) => item.color === elements[0]?.color)
    ? (elements[0]?.color ?? "#888888")
    : "#888888"
  const sharedCapacity = useMemo(() => {
    const values = elements.map((item) =>
      item.type === "standing_zone"
        ? item.capacity
        : item.type === "long_table"
          ? item.sideA + item.sideB
          : item.chairCount,
    )
    return values.every((value) => value === values[0]) ? values[0] : undefined
  }, [elements])
  const sharedCustomLabel = elements.every(
    (item) =>
      (item.customLabel || item.label) ===
      (elements[0]?.customLabel || elements[0]?.label),
  )
    ? (elements[0]?.customLabel || elements[0]?.label || "")
    : ""
  const selectionKey = selectedIds.join("|")
  const labelSyncKey = `${selectionKey}:${sharedCustomLabel}`
  const [appliedLabelKey, setAppliedLabelKey] = useState(labelSyncKey)
  const [labelDraft, setLabelDraft] = useState(sharedCustomLabel)
  if (appliedLabelKey !== labelSyncKey) {
    setAppliedLabelKey(labelSyncKey)
    setLabelDraft(sharedCustomLabel)
  }

  const sharedTicketTypeId = elements.every(
    (item) => item.ticketTypeId === elements[0]?.ticketTypeId,
  )
    ? (elements[0]?.ticketTypeId ?? "")
    : ""

  function commitLabel() {
    const next = labelDraft.trim()
    if (!next) return
    onCustomLabel(next)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-foreground">
        {elements.length} Elementos seleccionados
      </p>
      <p className="text-xs text-muted-foreground">
        Los cambios se aplican a todo el grupo en una sola operación. La etiqueta
        personalizada se imprime en el boleto.
      </p>

      <Field label="Etiqueta personalizada (boleto)">
        <Input
          value={labelDraft}
          placeholder="Ej. Mesa VIP Escenario 1"
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitLabel()
            }
          }}
        />
      </Field>

      <Field
        label={venueUnitPriceLabel({
          type: elements[0]?.type,
          sellMode: elements.every((item) => item.sellMode === elements[0]?.sellMode)
            ? elements[0]?.sellMode
            : undefined,
          priceMode: elements.every((item) => item.priceMode === elements[0]?.priceMode)
            ? elements[0]?.priceMode
            : undefined,
        })}
      >
        <PriceInput
          value={
            elements.every((item) => item.price === elements[0]?.price)
              ? elements[0]?.price
              : undefined
          }
          onValueChange={(value) => {
            if (value == null) return
            onPrice(value)
          }}
        />
      </Field>

      <Field label="Tipo de ticket">
        <VenueTicketTypeSelect
          tickets={tickets}
          value={sharedTicketTypeId}
          onChange={onTicketType}
        />
      </Field>

      <Field label="Color Global">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          <input
            type="color"
            value={sharedColor}
            onChange={(event) => onColor(event.target.value)}
            className="h-11 w-full cursor-pointer rounded border border-border bg-transparent"
          />
        </div>
      </Field>

      <Field label="Capacidad Global">
        <Input
          type="number"
          min={1}
          max={80}
          value={sharedCapacity ?? ""}
          placeholder="Ej. 10"
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!Number.isFinite(next) || next < 1) return
            onCapacity(next)
          }}
        />
      </Field>

      {showNumbering ? (
        <AutoNumberingPanel
          elements={allElements}
          selectedIds={selectedIds}
          onApply={onApplyElements}
        />
      ) : null}
    </div>
  )
}
