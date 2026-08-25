"use client"

import { ChevronDown, Trash2 } from "lucide-react"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DRAFT_TEXTAREA_CLASS,
  DraftFieldError,
  DraftHint,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  draftNumberValue,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function DraftInventoryAccordionCard({
  name,
  index,
  emptyTitle,
  initialName,
  onRemove,
}: {
  name: "tickets" | "extras"
  index: number
  emptyTitle: string
  initialName?: string
  onRemove: () => void
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const itemName = useWatch({ control, name: `${name}.${index}.name` })
  const price = useWatch({ control, name: `${name}.${index}.price` })
  const stock = useWatch({ control, name: `${name}.${index}.stock` })
  const [isExpanded, setIsExpanded] = useState(
    () => !String(initialName ?? "").trim(),
  )

  const itemErrors = errors[name]?.[index]
  const displayName = String(itemName ?? "").trim() || emptyTitle
  const priceValue = draftNumberValue(price)
  const stockValue = draftNumberValue(stock)
  const panelId = `event-v2-${name}-${index}-panel`

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white/80 transition-all duration-200 dark:border-gray-700/50 dark:bg-gray-800/50">
      <input type="hidden" {...register(`${name}.${index}.id`)} />
      <input type="hidden" {...register(`${name}.${index}.source`)} />
      <input type="hidden" {...register(`${name}.${index}.sectorId`)} />
      <input type="hidden" {...register(`${name}.${index}.layoutType`)} />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((open) => !open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100/80 dark:hover:bg-gray-800/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                isExpanded && "rotate-180",
              )}
              aria-hidden
            />
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">
              {displayName}
            </span>
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
            Precio: {formatCurrency(priceValue)} | Stock: {formatNumber(stockValue)}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mr-2 shrink-0 text-muted-foreground hover:text-red-500"
          aria-label={`Eliminar ${displayName}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        id={panelId}
        aria-hidden={!isExpanded}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded
            ? "grid-rows-[1fr] mt-0 opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-4 pt-1 pb-4">
            <p className="text-xs text-muted-foreground tabular-nums sm:hidden">
              Precio: {formatCurrency(priceValue)} | Stock: {formatNumber(stockValue)}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem]">
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`event-v2-${name}-${index}-name`}
                  className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  Nombre
                </Label>
                <Input
                  id={`event-v2-${name}-${index}-name`}
                  className={DRAFT_FIELD_CLASS}
                  placeholder={name === "tickets" ? "General" : "Cerveza"}
                  {...register(`${name}.${index}.name`)}
                />
                <DraftFieldError message={itemErrors?.name?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`event-v2-${name}-${index}-price`}
                  className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  Precio
                </Label>
                <Input
                  id={`event-v2-${name}-${index}-price`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.price`, {
                    setValueAs: draftNumberValue,
                  })}
                />
                <DraftFieldError message={itemErrors?.price?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`event-v2-${name}-${index}-stock`}
                  className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  Stock
                </Label>
                <Input
                  id={`event-v2-${name}-${index}-stock`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.stock`, {
                    setValueAs: draftNumberValue,
                  })}
                />
                <DraftFieldError message={itemErrors?.stock?.message} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor={`event-v2-${name}-${index}-description`}
                className="text-xs font-bold text-slate-800 dark:text-zinc-200"
              >
                Descripción breve
              </Label>
              <Textarea
                id={`event-v2-${name}-${index}-description`}
                rows={2}
                className={DRAFT_TEXTAREA_CLASS}
                placeholder="Qué incluye o cómo se usa."
                {...register(`${name}.${index}.description`)}
              />
              <DraftHint>Una línea alcanza. El comprador lo ve en el checkout.</DraftHint>
              <DraftFieldError message={itemErrors?.description?.message} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`event-v2-${name}-${index}-min`}
                  className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  Mínimo por persona
                </Label>
                <Input
                  id={`event-v2-${name}-${index}-min`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.minOrder`, {
                    setValueAs: (value) => draftNumberValue(value, 1),
                  })}
                />
                <DraftHint>Mínimo que puede llevar cada persona.</DraftHint>
                <DraftFieldError message={itemErrors?.minOrder?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor={`event-v2-${name}-${index}-max`}
                  className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  Máximo por persona
                </Label>
                <Input
                  id={`event-v2-${name}-${index}-max`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.maxOrder`, {
                    setValueAs: (value) => draftNumberValue(value, 10),
                  })}
                />
                <DraftHint>Tope por compra. Evita acaparamientos.</DraftHint>
                <DraftFieldError message={itemErrors?.maxOrder?.message} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
