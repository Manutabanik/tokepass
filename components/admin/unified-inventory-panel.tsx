"use client"

import {
  Armchair,
  Car,
  Gift,
  Layers,
  LayoutGrid,
  Plus,
  PlusCircle,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  BundleCreatorModal,
  type BundleComponentOption,
} from "@/components/admin/bundle-creator-modal"

import { Button } from "@/components/ui/button"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PriceInput } from "@/components/ui/price-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_TICKET_TABS,
  TICKET_DESCRIPTION_MAX,
  generalAdmissionTabLabel,
  ticketPickerTabLabel,
} from "@/lib/checkout/ticket-picker"
import {
  inferBundleType,
  bundleIncludesSeating,
} from "@/lib/inventory/flexible-bundles"
import {
  inferInventoryTierType,
  layoutTypeForInventory,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { CapacityBudgetBar } from "@/components/admin/capacity-budget-bar"
import { useEventCapacity } from "@/hooks/use-event-capacity"
import {
  createBlankPhase,
  generalRemainingForTicket,
  phaseLimitSum,
} from "@/lib/inventory/capacity-budget"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"

export function createInventoryTicket(
  tierType: InventoryTierType,
): EventFormValues["tickets"][number] {
  const names: Record<InventoryTierType, string> = {
    seated: "Ubicación numerada",
    general: "Entrada General al Predio",
    addon: "Estacionamiento Auto",
    bundle: "Pack Familia",
  }
  return {
    isNew: true,
    name: names[tierType],
    price: 0,
    capacity: tierType === "bundle" ? 50 : 100,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: layoutTypeForInventory(tierType),
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType,
    listPrice: tierType === "bundle" ? 0 : null,
    bundleItems: [],
    bundleType: tierType === "bundle" ? "cross_sell_pack" : null,
    description: "",
    highlightBadge: null,
    phases: [],
  }
}

type Props = {
  form: UseFormReturn<EventFormValues>
}

export function UnifiedInventoryPanel({ form }: Props) {
  const tickets = form.watch("tickets") ?? []
  const scheduleDays = form.watch("basics.scheduleDays") ?? []
  const capacity = useEventCapacity(form)
  const [bundleOpen, setBundleOpen] = useState(false)
  const [editingBundleIndex, setEditingBundleIndex] = useState<number | null>(
    null,
  )

  function append(ticket: EventFormValues["tickets"][number]) {
    const sameType = tickets.filter(
      (current) =>
        inferInventoryTierType({
          tierType: current.tierType,
          layoutType: current.layoutType,
          bundleItems: current.bundleItems,
        }) === ticket.tierType,
    ).length
    form.setValue(
      "tickets",
      [
        ...tickets,
        {
          ...ticket,
          name: sameType === 0 ? ticket.name : `${ticket.name} ${sameType + 1}`,
        },
      ],
      { shouldDirty: true },
    )
  }

  function remove(index: number) {
    form.setValue(
      "tickets",
      tickets.filter((_, current) => current !== index),
      { shouldDirty: true },
    )
  }

  const grouped = tickets
    .map((tier, index) => {
      const tierType = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      return { index, tierType, key: tier.id ?? `ticket-${index}`, tier }
    })
    .filter((item) => !isMapBackedTicket(item.tier))

  const generals = grouped.filter((item) => item.tierType === "general")
  const addons = grouped.filter((item) => item.tierType === "addon")
  const bundles = grouped.filter((item) => item.tierType === "bundle")
  const componentOptions: BundleComponentOption[] = tickets
    .map((tier, index) => ({
      id: tier.id ?? `index:${index}`,
      name: tier.name || `Ítem ${index + 1}`,
      price: Number(tier.price) || 0,
      tierType: inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      }),
      dayId: tier.dayId,
    }))
    .filter((item) => item.tierType !== "bundle")

  const generalNames = tickets
    .filter(
      (tier) =>
        inferInventoryTierType({
          tierType: tier.tierType,
          layoutType: tier.layoutType,
          bundleItems: tier.bundleItems,
        }) === "general",
    )
    .map((tier) => ({ name: tier.name }))

  const defaultTabItems = DEFAULT_TICKET_TABS.map((value) => {
    if (value === "auto") {
      return {
        value,
        label: "Automático (la de más stock)",
      }
    }
    if (value === "general") {
      return { value, label: generalAdmissionTabLabel(generalNames) }
    }
    return { value, label: ticketPickerTabLabel(value, []) }
  })

  return (
    <div className="space-y-5">
      <CapacityBudgetBar form={form} />
      {typeof form.formState.errors.tickets?.message === "string" ? (
        <p className="text-sm text-destructive" role="alert">
          {form.formState.errors.tickets.message}
        </p>
      ) : null}
      <div>
        <p className="text-sm font-semibold text-foreground">
          Tickets generales, adicionales y combos
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Las zonas del mapa se cobran en el paso anterior. Acá solo van
          entradas sin asiento fijo, extras y promociones.
        </p>
      </div>

      <FormField
        control={form.control}
        name="ticketsDefaultTab"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-1.5">
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              Tab inicial en la compra
            </FormLabel>
            <Select
              value={field.value ?? "auto"}
              onValueChange={field.onChange}
              items={defaultTabItems}
            >
              <SelectTrigger className="h-11 w-full max-w-md overflow-hidden">
                <SelectValue placeholder="Automático">
                  {defaultTabItems.find(
                    (item) => item.value === (field.value ?? "auto"),
                  )?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {defaultTabItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              Si el 80% vende Campo, abrí Campo aunque haya mapa de ubicaciones.
            </FormDescription>
          </FormItem>
        )}
      />

      <InventoryBlock
        title="Entradas generales y capacidad de campo"
        description="Zonas sin asiento numerado: predio, campo de pie o platea libre."
        icon={Ticket}
        actionLabel="Agregar sector general"
        onAdd={() =>
          append({
            ...createInventoryTicket("general"),
            capacity: Math.max(1, Math.min(100, capacity.remaining || 1)),
          })
        }
      >
        {generals.length === 0 ? (
          <EmptyHint text="Opcional. Sumá una general de predio si no alcanza con las zonas del mapa." />
        ) : (
          generals.map((item) => (
            <InventoryRow
              key={item.key}
              form={form}
              index={item.index}
              capacityLabel="Capacidad máxima"
              venueRemaining={generalRemainingForTicket(
                capacity,
                tickets[item.index],
                tickets,
              )}
              showPhases
              onRemove={() => remove(item.index)}
            />
          ))
        )}
      </InventoryBlock>

      <InventoryBlock
        title="Adicionales y servicios"
        description="Estacionamiento, consumiciones, vaso oficial u otros extras con stock propio."
        icon={Car}
        actionLabel="Agregar adicional"
        onAdd={() => append(createInventoryTicket("addon"))}
      >
        {addons.length === 0 ? (
          <EmptyHint text="Los adicionales aparecen como upsell antes del pago." />
        ) : (
          addons.map((item) => (
            <InventoryRow
              key={item.key}
              form={form}
              index={item.index}
              capacityLabel="Stock disponible"
              onRemove={() => remove(item.index)}
            />
          ))
        )}
      </InventoryBlock>

      <InventoryBlock
        title="Combos y packs promocionales"
        description="Abonos, packs con extras y 2x1 / 4x3. El modal calcula el ahorro solo."
        icon={Gift}
        actionLabel="Crear combo / kit"
        onAdd={() => {
          setEditingBundleIndex(null)
          setBundleOpen(true)
        }}
      >
        {bundles.length === 0 ? (
          <EmptyHint text="Ejemplo: Pack Familia = 4 generales + 1 estacionamiento." />
        ) : (
          bundles.map((item) => (
            <div key={item.key} className="space-y-2">
              <InventoryRow
                form={form}
                index={item.index}
                capacityLabel="Stock del combo"
                showListPrice
                onRemove={() => remove(item.index)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingBundleIndex(item.index)
                  setBundleOpen(true)
                }}
              >
                Editar promoción
              </Button>
            </div>
          ))
        )}
      </InventoryBlock>

      <BundleCreatorModal
        open={bundleOpen}
        onOpenChange={setBundleOpen}
        title={
          editingBundleIndex == null
            ? "Crear combo / abono"
            : "Editar combo / abono"
        }
        scheduleDays={scheduleDays}
        options={componentOptions}
        initial={
          editingBundleIndex != null
            ? {
                name: tickets[editingBundleIndex]?.name,
                bundleType: inferBundleType({
                  bundleType: tickets[editingBundleIndex]?.bundleType,
                  dayId: tickets[editingBundleIndex]?.dayId,
                  items: tickets[editingBundleIndex]?.bundleItems,
                }),
                price: tickets[editingBundleIndex]?.price ?? 0,
                originalPrice: tickets[editingBundleIndex]?.listPrice ?? 0,
                capacity: tickets[editingBundleIndex]?.capacity ?? 50,
                items: tickets[editingBundleIndex]?.bundleItems ?? [],
                includesSeating: bundleIncludesSeating(
                  tickets[editingBundleIndex]?.bundleItems ?? [],
                  Object.fromEntries(
                    tickets.map((tier, index) => [
                      tier.id ?? `index:${index}`,
                      inferInventoryTierType({
                        tierType: tier.tierType,
                        layoutType: tier.layoutType,
                        bundleItems: tier.bundleItems,
                      }),
                    ]),
                  ),
                ),
              }
            : null
        }
        onSave={(value) => {
          const nextTicket = {
            ...createInventoryTicket("bundle"),
            name: value.name,
            price: value.price,
            listPrice: value.originalPrice,
            capacity: value.capacity,
            bundleItems: value.items,
            bundleType: value.bundleType,
            dayId: null,
          }
          if (editingBundleIndex == null) {
            form.setValue("tickets", [...tickets, nextTicket], {
              shouldDirty: true,
            })
          } else {
            const next = tickets.map((ticket, index) =>
              index === editingBundleIndex
                ? { ...ticket, ...nextTicket, id: ticket.id }
                : ticket,
            )
            form.setValue("tickets", next, { shouldDirty: true })
          }
          setBundleOpen(false)
          setEditingBundleIndex(null)
        }}
      />
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function InventoryBlock({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAdd,
  children,
}: {
  title: string
  description: string
  icon: typeof Ticket
  actionLabel: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="shrink-0"
        >
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function InventoryRow({
  form,
  index,
  capacityLabel,
  showListPrice = false,
  showPhases = false,
  venueRemaining,
  onRemove,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  capacityLabel: string
  showListPrice?: boolean
  showPhases?: boolean
  venueRemaining?: number
  onRemove: () => void
}) {
  const phases = form.watch(`tickets.${index}.phases`) ?? []
  const parentCapacity = Number(form.watch(`tickets.${index}.capacity`)) || 0
  const parentPrice = Number(form.watch(`tickets.${index}.price`)) || 0
  const phaseCap = phaseLimitSum(phases)
  const phaseRemaining = Math.max(1, parentCapacity - phaseCap)

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
        <FormField
          control={form.control}
          name={`tickets.${index}.name`}
          render={({ field, fieldState }) => (
            <FormItem className="min-w-0">
              <FormLabel>Nombre</FormLabel>
              <Input
                {...field}
                className="h-11 min-w-0"
                placeholder="Nombre del ítem"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.capacity`}
          render={({ field, fieldState }) => {
            const maxAllowed =
              venueRemaining != null ? Math.max(1, venueRemaining) : undefined
            const overflow =
              maxAllowed != null &&
              Number(field.value) > 0 &&
              Number(field.value) > maxAllowed
            return (
            <FormItem>
              <FormLabel>{capacityLabel}</FormLabel>
              <Input
                type="number"
                min={1}
                max={maxAllowed}
                value={field.value ?? ""}
                onChange={(event) => {
                  if (event.target.value === "") {
                    field.onChange(undefined)
                    return
                  }
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  if (maxAllowed != null && next > maxAllowed) {
                    field.onChange(maxAllowed)
                    return
                  }
                  field.onChange(next)
                }}
                className="h-11"
              />
              {overflow ? (
                <p className="text-xs text-red-500" role="alert">
                  Superás el saldo del recinto ({maxAllowed} disponibles).
                </p>
              ) : null}
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
            )
          }}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.price`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Precio</FormLabel>
              <PriceInput
                value={field.value}
                onValueChange={(value) => field.onChange(value ?? 0)}
                className="h-11"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Quitar ítem"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <FormField
        control={form.control}
        name={`tickets.${index}.description`}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Qué incluye (opcional)</FormLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              maxLength={TICKET_DESCRIPTION_MAX}
              className="h-11"
              placeholder="Incluye acceso al patio gastronómico"
            />
            <FormDescription>
              Texto corto debajo del nombre en la compra. Máx.{" "}
              {TICKET_DESCRIPTION_MAX} caracteres.
            </FormDescription>
            <FormMessage>{fieldState.error?.message}</FormMessage>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`tickets.${index}.highlightBadge`}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <FormLabel className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Destacar como más vendida
            </FormLabel>
            <Switch
              checked={field.value === "bestseller"}
              onCheckedChange={(checked) =>
                field.onChange(checked ? "bestseller" : null)
              }
              aria-label="Destacar como más vendida"
            />
          </FormItem>
        )}
      />
      {showListPrice ? (
        <FormField
          control={form.control}
          name={`tickets.${index}.listPrice`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Precio de lista (para mostrar ahorro)
              </FormLabel>
              <PriceInput
                value={field.value ?? undefined}
                onValueChange={(value) => field.onChange(value ?? null)}
                className="h-11 max-w-xs"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
      ) : null}

      {showPhases ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/40 p-3">
          <div className="flex items-start gap-2">
            <Layers
              className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Lotes de precio
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                El sistema cambiará al siguiente lote automáticamente cuando
                este se agote. La suma de los lotes no puede superar{" "}
                {parentCapacity || 0} entradas de este tipo.
              </p>
            </div>
          </div>

          {phases.map((phase, phaseIndex) => {
            const sold = phase.sold ?? 0
            const otherSum = phaseLimitSum(phases, phaseIndex)
            const maxLot = Math.max(sold || 1, parentCapacity - otherSum)
            return (
              <div
                key={phase.id ?? `phase-${phaseIndex}`}
                className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
              >
                <FormField
                  control={form.control}
                  name={`tickets.${index}.phases.${phaseIndex}.name`}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Nombre del lote</FormLabel>
                      <Input
                        {...field}
                        className="h-10"
                        placeholder="Preventa 1"
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`tickets.${index}.phases.${phaseIndex}.price`}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Precio</FormLabel>
                      <PriceInput
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value ?? 0)
                          if (phaseIndex === 0) {
                            form.setValue(`tickets.${index}.price`, value ?? 0, {
                              shouldDirty: true,
                            })
                          }
                        }}
                        className="h-10"
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`tickets.${index}.phases.${phaseIndex}.capacityLimit`}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Límite</FormLabel>
                      <Input
                        type="number"
                        min={Math.max(1, sold)}
                        max={maxLot}
                        value={field.value ?? ""}
                        onChange={(event) => {
                          if (event.target.value === "") {
                            field.onChange(undefined)
                            return
                          }
                          const next = Number(event.target.value)
                          if (!Number.isFinite(next)) return
                          if (next > maxLot) {
                            field.onChange(maxLot)
                            return
                          }
                          field.onChange(Math.max(sold || 1, next))
                        }}
                        className="h-10"
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={sold > 0}
                    onClick={() => {
                      form.setValue(
                        `tickets.${index}.phases`,
                        phases.filter((_, current) => current !== phaseIndex),
                        { shouldDirty: true },
                      )
                    }}
                    aria-label={`Quitar lote ${phase.name || phaseIndex + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={phaseCap >= parentCapacity && parentCapacity > 0}
            onClick={() => {
              form.setValue(
                `tickets.${index}.phases`,
                [
                  ...phases,
                  createBlankPhase(phases.length, phaseRemaining, parentPrice),
                ],
                { shouldDirty: true },
              )
            }}
          >
            <PlusCircle className="size-4" />
            Agregar Lote de Precio
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function InventoryTypeIcon({
  tierType,
  className,
}: {
  tierType: InventoryTierType
  className?: string
}) {
  const Icon =
    tierType === "seated"
      ? Armchair
      : tierType === "addon"
        ? Car
        : tierType === "bundle"
          ? Gift
          : Ticket
  return <Icon className={className} aria-hidden="true" />
}
