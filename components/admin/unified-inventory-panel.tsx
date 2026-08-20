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
import { useEffect, useMemo, useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  listEventGeneralSectors,
  type EventGeneralSector,
} from "@/app/actions/events"

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
  inferPromoRule,
  bundleIncludesSeating,
} from "@/lib/inventory/flexible-bundles"
import {
  inferInventoryTierType,
  layoutTypeForInventory,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { CapacityBudgetBar } from "@/components/admin/capacity-budget-bar"
import { MasterManifestTable } from "@/components/admin/master-manifest-table"
import { useEventCapacity } from "@/hooks/use-event-capacity"
import {
  asPositiveInt,
  createBlankPhase,
  generalRemainingForTicket,
  parseStrictInt,
  phaseLimitSum,
  ticketPhasesExceedParent,
} from "@/lib/inventory/capacity-budget"
import { formatCurrency } from "@/lib/format"
import {
  defaultInventoryDayId,
  formatInventoryDayOption,
} from "@/lib/event-schedule"
import { cn } from "@/lib/utils"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import {
  collectVenueMapSectorKeys,
  isMapOwnedLogicalSector,
  listAssignableGeneralSectors,
  listGeneralLogicalSectors,
  normalizeLogicalSectors,
  UNASSIGNED_SECTOR_LABEL,
  UNASSIGNED_SECTOR_VALUE,
} from "@/lib/inventory/logical-sectors"
import {
  buildMasterManifestRows,
  excludeMapOwnedSectors,
} from "@/lib/inventory/master-manifest"
import { TICKET_DAY_ALL } from "@/types/tickets"
import type { EventFormValues } from "@/lib/validations/event-form"

export function createInventoryTicket(
  tierType: InventoryTierType,
  options?: { dayId?: string | null },
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
    dayId: options?.dayId ?? null,
    visibility: "public",
    layoutType: layoutTypeForInventory(tierType),
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType,
    listPrice: tierType === "bundle" ? 0 : null,
    bundleItems: [],
    bundleType: tierType === "bundle" ? "cross_sell_pack" : null,
    promoDiscountType: tierType === "bundle" ? "PORCENTAJE" : null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    description: "",
    highlightBadge: null,
    phases: [],
  }
}

type Props = {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
}

function mergeEventSectors(
  draft: ReturnType<typeof listGeneralLogicalSectors>,
  persisted: EventGeneralSector[],
) {
  const merged = new Map<string, (typeof draft)[number]>()
  for (const sector of persisted) {
    merged.set(sector.id, {
      id: sector.id,
      name: sector.name,
      type: "general_admission",
      capacity: sector.capacity,
    })
  }
  for (const sector of draft) {
    const duplicate = [...merged.values()].some(
      (item) =>
        item.id === sector.id ||
        item.name.trim().toLocaleLowerCase("es") ===
          sector.name.trim().toLocaleLowerCase("es"),
    )
    if (!duplicate) merged.set(sector.id, sector)
  }
  return [...merged.values()]
}

export function UnifiedInventoryPanel({ form, eventId = null }: Props) {
  const watchedTickets = form.watch("tickets")
  const tickets = useMemo(() => watchedTickets ?? [], [watchedTickets])
  const hasSeatingPlan = Boolean(form.watch("basics.hasSeatingPlan"))
  const venueMap = form.watch("venue.venueMap")
  const draftSectors = listAssignableGeneralSectors(
    form.watch("venue.zones"),
    venueMap,
  )
  const canLoadSectors = Boolean(eventId && hasSeatingPlan)
  const [loadedSectors, setLoadedSectors] = useState<EventGeneralSector[]>([])
  const [loadedSectorError, setLoadedSectorError] = useState<string | null>(
    null,
  )
  const sectorLoadError = canLoadSectors ? loadedSectorError : null
  const logicalSectors = useMemo(() => {
    const persisted = eventId && hasSeatingPlan ? loadedSectors : []
    const merged = eventId
      ? mergeEventSectors(draftSectors, persisted)
      : draftSectors
    return listAssignableGeneralSectors(merged, venueMap)
  }, [draftSectors, eventId, hasSeatingPlan, loadedSectors, venueMap])

  useEffect(() => {
    const current = form.getValues("tickets") ?? []
    if (!hasSeatingPlan) {
      if (current.some((tier) => tier.seatingSectorId)) {
        form.setValue(
          "tickets",
          current.map((tier) => ({ ...tier, seatingSectorId: null })),
          { shouldDirty: true },
        )
      }
      return
    }

    const mapKeys = collectVenueMapSectorKeys(form.getValues("venue.venueMap"))
    const draftZones = normalizeLogicalSectors(form.getValues("venue.zones"))
    let changed = false
    const next = current.map((tier) => {
      const sectorId = tier.seatingSectorId?.trim()
      const seated =
        tier.layoutType === "numbered_seat" ||
        tier.layoutType === "table_combo" ||
        tier.tierType === "seated"
      if (!sectorId || seated) return tier
      const zone = draftZones.find((item) => item.id === sectorId)
      const ownedByMap =
        mapKeys.ids.has(sectorId) ||
        (zone != null &&
          isMapOwnedLogicalSector(zone, form.getValues("venue.venueMap")))
      if (!ownedByMap) return tier
      changed = true
      return { ...tier, seatingSectorId: null }
    })
    if (changed) {
      form.setValue("tickets", next, { shouldDirty: true })
    }
  }, [form, hasSeatingPlan])

  useEffect(() => {
    if (!eventId || !hasSeatingPlan) return
    let cancelled = false
    void listEventGeneralSectors(eventId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadedSectors([])
        setLoadedSectorError("Error al cargar sectores. Intente nuevamente.")
        return
      }
      setLoadedSectors(result.sectors)
      setLoadedSectorError(null)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, hasSeatingPlan])
  const scheduleDays = form.watch("basics.scheduleDays") ?? []
  const isMultiDay = Boolean(form.watch("basics.isMultiDay")) || scheduleDays.length >= 2
  const capacity = useEventCapacity(form)
  const manifestRows = useMemo(
    () =>
      buildMasterManifestRows({
        tickets,
        venueMap,
      }),
    [tickets, venueMap],
  )
  const dropdownSectors = useMemo(
    () => excludeMapOwnedSectors(logicalSectors, venueMap),
    [logicalSectors, venueMap],
  )
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
    <div className="space-y-5" data-field="tickets">
      <MasterManifestTable rows={manifestRows} capacity={capacity} />
      <CapacityBudgetBar form={form} />
      {typeof form.formState.errors.tickets?.message === "string" ? (
        <FormMessage>{form.formState.errors.tickets.message}</FormMessage>
      ) : null}
      <div>
        <p className="text-sm font-semibold text-foreground">
          Inventario general (editable)
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {hasSeatingPlan
            ? "Campo, extras y combos. El mapa ya reservó su aforo; una general puede quedar libre o ligarse a un sector que no sea del mapa."
            : "Nombre, capacidad y precio. Esta entrada es inventario libre: no depende de un sector."}
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
              {hasSeatingPlan
                ? "Si el 80% vende Campo, abrí Campo aunque haya mapa de ubicaciones."
                : "Elegí qué tipo de entrada se ve primero en la compra."}
            </FormDescription>
          </FormItem>
        )}
      />

      {hasSeatingPlan && sectorLoadError ? (
        <p className="text-sm text-destructive" role="alert">
          {sectorLoadError}
        </p>
      ) : null}

      <InventoryBlock
        title="Entradas generales y capacidad de campo"
        description={
          hasSeatingPlan
            ? "Zonas sin asiento numerado: predio, campo de pie o platea libre."
            : "Entradas simples: nombre, cupo y precio. Sin sector ni mapa."
        }
        icon={Ticket}
        actionLabel={
          hasSeatingPlan ? "Agregar sector general" : "Agregar entrada general"
        }
        onAdd={() =>
          append({
            ...createInventoryTicket("general", {
              dayId: defaultInventoryDayId(scheduleDays),
            }),
            seatingSectorId: null,
            capacity: 100,
          })
        }
      >
        {generals.length === 0 ? (
          <EmptyHint
            text={
              hasSeatingPlan
                ? "Opcional. Sumá una general de predio si no alcanza con las zonas del mapa."
                : "Sumá una entrada con nombre, capacidad y precio."
            }
          />
        ) : (
          generals.map((item) => (
            <InventoryRow
              key={item.key}
              form={form}
              index={item.index}
              capacityLabel="Capacidad máxima"
              scheduleDays={isMultiDay ? scheduleDays : []}
              venueRemaining={(() => {
                const sectorId = tickets[item.index]?.seatingSectorId?.trim()
                const sector = sectorId
                  ? dropdownSectors.find((row) => row.id === sectorId)
                  : undefined
                if (!sector) return undefined
                return generalRemainingForTicket(
                  capacity,
                  tickets[item.index],
                  tickets,
                  sector.capacity,
                )
              })()}
              logicalSectors={hasSeatingPlan ? dropdownSectors : []}
              showSectorSelect={hasSeatingPlan}
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
        onAdd={() =>
          append({
            ...createInventoryTicket("addon", {
              dayId: defaultInventoryDayId(scheduleDays),
            }),
          })
        }
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
              scheduleDays={isMultiDay ? scheduleDays : []}
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
                scheduleDays={isMultiDay ? scheduleDays : []}
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
                promoRule: inferPromoRule({
                  rule: tickets[editingBundleIndex]?.promoDiscountType
                    ? {
                        tipoDescuento:
                          tickets[editingBundleIndex].promoDiscountType,
                        valorDescuento:
                          tickets[editingBundleIndex]?.promoDiscountValue ?? 0,
                        cantidadRequerida:
                          tickets[editingBundleIndex]?.promoRequiredQty ?? 1,
                        cantidadPaga:
                          tickets[editingBundleIndex]?.promoPayQty ?? 1,
                      }
                    : null,
                  bundleType: tickets[editingBundleIndex]?.bundleType,
                  items: tickets[editingBundleIndex]?.bundleItems,
                  salePrice: tickets[editingBundleIndex]?.price ?? 0,
                  regularPrice: tickets[editingBundleIndex]?.listPrice ?? 0,
                }),
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
            promoDiscountType: value.promoRule.tipoDescuento,
            promoDiscountValue: value.promoRule.valorDescuento,
            promoRequiredQty: value.promoRule.cantidadRequerida,
            promoPayQty: value.promoRule.cantidadPaga,
            dayId:
              value.bundleType === "multi_day_pass"
                ? null
                : defaultInventoryDayId(scheduleDays),
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
  scheduleDays = [],
  venueRemaining,
  capacityExceeded = false,
  logicalSectors = [],
  showSectorSelect = true,
  onRemove,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  capacityLabel: string
  showListPrice?: boolean
  showPhases?: boolean
  scheduleDays?: EventFormValues["basics"]["scheduleDays"]
  venueRemaining?: number
  capacityExceeded?: boolean
  logicalSectors?: ReturnType<typeof listGeneralLogicalSectors>
  showSectorSelect?: boolean
  onRemove: () => void
}) {
  const layoutType = form.watch(`tickets.${index}.layoutType`)
  const watchedTierType = form.watch(`tickets.${index}.tierType`)
  const watchedBundleItems = form.watch(`tickets.${index}.bundleItems`)
  const watchedListPrice = form.watch(`tickets.${index}.listPrice`)
  const isBundle =
    inferInventoryTierType({
      tierType: watchedTierType,
      layoutType,
      bundleItems: watchedBundleItems,
    }) === "bundle"
  const priceLabel =
    layoutType === "table_combo"
      ? "Precio total de la mesa"
      : layoutType === "numbered_seat"
        ? "Precio por butaca"
        : "Precio"
  const phases = form.watch(`tickets.${index}.phases`) ?? []
  const parentCapacity = asPositiveInt(form.watch(`tickets.${index}.capacity`))
  const parentPrice = Number(form.watch(`tickets.${index}.price`)) || 0
  const phaseCap = phaseLimitSum(phases)
  const phaseRemaining = Math.max(0, parentCapacity - phaseCap)
  const phasesOverflow = ticketPhasesExceedParent({
    capacity: parentCapacity,
    phases,
  })
  const dayItems = [
    {
      value: TICKET_DAY_ALL,
      label: "Pase Completo / Todos los dias",
    },
    ...scheduleDays.map((day, dayIndex) => ({
      value: day.id,
      label: formatInventoryDayOption(day, dayIndex),
    })),
  ]

  return (
    <div className="relative space-y-3 rounded-xl border border-border bg-card p-3 pr-12">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 size-9"
        onClick={onRemove}
        aria-label="Quitar ítem"
      >
        <Trash2 className="size-4" />
      </Button>
      <div className="grid min-w-0 grid-cols-1 items-end gap-4 md:grid-cols-12">
        <FormField
          control={form.control}
          name={`tickets.${index}.name`}
          render={({ field, fieldState }) => (
            <FormItem className="min-w-0 md:col-span-6">
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
            const typed = asPositiveInt(field.value)
            const overflow =
              Boolean(capacityExceeded) ||
              (venueRemaining != null && typed > venueRemaining)
            return (
            <FormItem className="md:col-span-3">
              <FormLabel>{capacityLabel}</FormLabel>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={
                  field.value === undefined ||
                  field.value === null ||
                  Number.isNaN(Number(field.value))
                    ? ""
                    : String(field.value)
                }
                onChange={(event) => {
                  const parsed = parseStrictInt(event.target.value)
                  if (parsed === "") {
                    field.onChange(undefined)
                    return
                  }
                  if (typeof parsed === "number" && Number.isNaN(parsed)) return
                  field.onChange(parsed)
                }}
                aria-invalid={overflow || undefined}
                className={cn("h-11", overflow && "border-destructive")}
              />
              {overflow ? (
                <p className="text-xs text-destructive" role="alert">
                  {showSectorSelect
                    ? "Superás la capacidad del sector. Bajá el stock o ampliá el sector en Mapa y Sectores."
                    : "El stock supera la capacidad disponible. Bajá la cantidad de esta entrada."}
                </p>
              ) : null}
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
            )
          }}
        />
        {isBundle ? (
          <div className="md:col-span-3">
            <p className="mb-1.5 text-sm font-medium">Precio promocional</p>
            <div className="flex h-11 items-baseline gap-2 rounded-md border border-border bg-muted/40 px-3">
              {Number(watchedListPrice) > 0 ? (
                <span className="text-xs text-muted-foreground line-through">
                  {formatCurrency(Number(watchedListPrice) || 0)}
                </span>
              ) : null}
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(parentPrice)}
              </span>
            </div>
          </div>
        ) : (
          <FormField
            control={form.control}
            name={`tickets.${index}.price`}
            render={({ field, fieldState }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>{priceLabel}</FormLabel>
                <PriceInput
                  name={`tickets.${index}.price`}
                  aria-invalid={Boolean(fieldState.error)}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? undefined)}
                  className="h-11"
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />
        )}
      </div>
      {showSectorSelect ? (
        <FormField
          control={form.control}
          name={`tickets.${index}.seatingSectorId`}
          render={({ field, fieldState }) => {
            const items = [
              {
                value: UNASSIGNED_SECTOR_VALUE,
                label: UNASSIGNED_SECTOR_LABEL,
              },
              ...logicalSectors.map((sector) => ({
                value: sector.id,
                label: `${sector.name} (${sector.capacity})`,
              })),
            ]
            const selected = field.value?.trim() || UNASSIGNED_SECTOR_VALUE
            return (
              <FormItem>
                <FormLabel>Elegí el sector</FormLabel>
                <Select
                  value={selected}
                  onValueChange={(value) => {
                    const next =
                      !value || value === UNASSIGNED_SECTOR_VALUE
                        ? null
                        : value.trim()
                    field.onChange(next)
                    if (!next) return
                    const sector = logicalSectors.find((item) => item.id === next)
                    if (!sector) return
                    const current = asPositiveInt(
                      form.getValues(`tickets.${index}.capacity`),
                    )
                    if (current > sector.capacity) {
                      form.setValue(`tickets.${index}.capacity`, sector.capacity, {
                        shouldDirty: true,
                      })
                    }
                  }}
                  items={items}
                >
                  <SelectTrigger className="h-11 w-full max-w-md">
                    <SelectValue placeholder={UNASSIGNED_SECTOR_LABEL}>
                      {items.find((item) => item.value === selected)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {selected === UNASSIGNED_SECTOR_VALUE
                    ? "Inventario libre: el cupo de esta entrada suma al aforo sin depender de un sector."
                    : "El stock y los lotes no pueden superar el cupo de este sector. No uses sectores del mapa."}
                </FormDescription>
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )
          }}
        />
      ) : null}
      {scheduleDays.length >= 2 ? (
        <FormField
          control={form.control}
          name={`tickets.${index}.dayId`}
          render={({ field, fieldState }) => {
            const selected = field.value?.trim() || TICKET_DAY_ALL
            return (
              <FormItem>
                <FormLabel>Jornada</FormLabel>
                <Select
                  value={selected}
                  onValueChange={(value) =>
                    field.onChange(value === TICKET_DAY_ALL ? null : value)
                  }
                  items={dayItems}
                >
                  <SelectTrigger className="h-11 w-full max-w-md">
                    <SelectValue placeholder="Elegi la jornada">
                      {dayItems.find((item) => item.value === selected)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {dayItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Obligatorio en eventos de varias jornadas. Pase completo vale
                  todos los dias; una jornada vende solo ese dia.
                </FormDescription>
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )
          }}
        />
      ) : null}
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
      {showListPrice && !isBundle ? (
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
                name={`tickets.${index}.listPrice`}
                aria-invalid={Boolean(fieldState.error)}
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
              {phasesOverflow ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  La suma de los lotes ({phaseCap}) supera la capacidad máxima
                  de este ticket ({parentCapacity}).
                </p>
              ) : null}
            </div>
          </div>

          {phases.map((phase, phaseIndex) => {
            const sold = phase.sold ?? 0
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
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={
                          field.value === undefined ||
                          field.value === null ||
                          Number.isNaN(Number(field.value))
                            ? ""
                            : String(field.value)
                        }
                        onChange={(event) => {
                          const parsed = parseStrictInt(event.target.value)
                          if (parsed === "") {
                            field.onChange(undefined)
                            return
                          }
                          if (typeof parsed === "number" && Number.isNaN(parsed)) {
                            return
                          }
                          field.onChange(parsed)
                        }}
                        aria-invalid={
                          phaseLimitSum(phases) > parentCapacity || undefined
                        }
                        className={cn(
                          "h-10",
                          phaseLimitSum(phases) > parentCapacity &&
                            "border-destructive",
                        )}
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
            disabled={phaseCap >= parentCapacity}
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
