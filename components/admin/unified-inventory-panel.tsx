"use client"

import {
  Armchair,
  Car,
  Copy,
  Gift,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  PlusCircle,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

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
import {
  AddTicketTypeButton,
  TicketWalletCard,
} from "@/components/admin/events/ticket-tier-form"
import { AforoBalanceAssistant } from "@/components/admin/aforo-balance-assistant"
import { CapacityBudgetBar } from "@/components/admin/capacity-budget-bar"
import { MasterManifestTable } from "@/components/admin/master-manifest-table"
import { useEventCapacity } from "@/hooks/use-event-capacity"
import {
  assignRemainingToGeneral,
  computeAforoBalance,
  findPrimaryGeneralIndex,
  scaleTicketStockToLimit,
} from "@/lib/inventory/aforo-balance"
import {
  asPositiveInt,
  ticketInventorySignature,
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
  listEventFormJornadas,
} from "@/lib/event-schedule"
import {
  duplicateTicketsFromDay,
  scheduleDaysMissingTicketsMessage,
} from "@/lib/inventory/day-ticket-coverage"
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
  return {
    isNew: true,
    name: "",
    price: undefined as unknown as number,
    basePrice: undefined,
    feeStrategy: "absorb_in_price",
    calculationMode: "public_price",
    capacity: undefined as unknown as number,
    timeLimit: "",
    bonusReward: "",
    dayId: options?.dayId ?? null,
    visibility: "public",
    layoutType: layoutTypeForInventory(tierType),
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
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
    saleStartsAt: "",
    saleEndsAt: "",
  }
}

type Props = {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
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

export function UnifiedInventoryPanel({
  form,
  eventId = null,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
}: Props) {
  const watchedTickets = form.watch("tickets")
  const ticketStockKey = ticketInventorySignature(watchedTickets)
  const tickets = form.getValues("tickets") ?? watchedTickets ?? []
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
  const identityDate = form.watch("basics.date")
  const eventDates = listEventFormJornadas({
    scheduleDays,
    date: identityDate,
  })
  const isMultiDay =
    Boolean(form.watch("basics.isMultiDay")) || eventDates.length >= 2
  const capacity = useEventCapacity(form)
  const manifestRows = useMemo(
    () =>
      buildMasterManifestRows({
        tickets,
        venueMap,
      }),
    [ticketStockKey, tickets, venueMap],
  )
  const dropdownSectors = useMemo(
    () => excludeMapOwnedSectors(logicalSectors, venueMap),
    [logicalSectors, venueMap],
  )
  const [bundleOpen, setBundleOpen] = useState(false)
  const [editingBundleIndex, setEditingBundleIndex] = useState<number | null>(
    null,
  )
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
  const venueCapacity = form.watch("venue.capacity")
  const venueZones = form.watch("venue.zones")
  const aforo = useMemo(
    () =>
      computeAforoBalance({
        tickets,
        venueMap,
        zones: venueZones,
        venueCapacity,
      }),
    [ticketStockKey, tickets, venueCapacity, venueMap, venueZones],
  )

  function append(ticket: EventFormValues["tickets"][number]) {
    const nextIndex = tickets.length
    form.setValue("tickets", [...tickets, ticket], { shouldDirty: true })
    setExpandedIndex(nextIndex)
  }

  function remove(index: number) {
    form.setValue(
      "tickets",
      tickets.filter((_, current) => current !== index),
      { shouldDirty: true },
    )
    setExpandedIndex((current) => {
      if (current == null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
  }

  function duplicate(index: number) {
    const source = tickets[index]
    if (!source) return
    const copyName = source.name.trim()
      ? `${source.name.trim()} copia`
      : ""
    append({
      ...source,
      id: undefined,
      isNew: true,
      name: copyName,
      sold: 0,
      phases: (source.phases ?? []).map((phase) => ({
        ...phase,
        id: undefined,
        sold: 0,
      })),
    })
  }

  function duplicateDayTickets(sourceDayId: string, targetDayId: string) {
    const result = duplicateTicketsFromDay(tickets, sourceDayId, targetDayId)
    if (result.error || result.added === 0) {
      toast.error(result.error ?? "No se pudieron copiar las tarifas.")
      return
    }
    form.setValue("tickets", result.tickets, { shouldDirty: true })
    const target = eventDates.find((day) => day.id === targetDayId)
    const targetLabel = target
      ? formatInventoryDayOption(target, eventDates.indexOf(target))
      : "el día elegido"
    toast.success(
      `Se copiaron ${result.added} tarifa${result.added === 1 ? "" : "s"} a ${targetLabel}.`,
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
      <AforoBalanceAssistant
        physicalCapacity={aforo.physicalCapacity}
        ticketStock={aforo.ticketStock}
        difference={aforo.difference}
        canAssignRemaining
        onAssignRemaining={() => {
          const primary = findPrimaryGeneralIndex(tickets)
          if (primary < 0) {
            append({
              ...createInventoryTicket("general", {
                dayId: defaultInventoryDayId(eventDates),
              }),
              name: "Entrada General",
              capacity: aforo.difference,
            })
            return
          }
          form.setValue(
            "tickets",
            assignRemainingToGeneral(tickets, aforo.difference),
            { shouldDirty: true },
          )
          setExpandedIndex(primary)
        }}
        onScaleToLimit={() => {
          form.setValue(
            "tickets",
            scaleTicketStockToLimit(tickets, aforo.physicalCapacity),
            { shouldDirty: true },
          )
        }}
      />
      <CapacityBudgetBar form={form} />
      {typeof form.formState.errors.tickets?.message === "string" ? (
        <FormMessage>{form.formState.errors.tickets.message}</FormMessage>
      ) : null}
      {isMultiDay ? (
        <DayTicketCopyBar
          days={eventDates}
          tickets={tickets}
          onDuplicate={duplicateDayTickets}
        />
      ) : null}
      <div>
        <p className="text-sm font-semibold text-foreground">
          Entradas a la venta
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {hasSeatingPlan
            ? "Campo, extras y combos. El mapa ya reservó su cupo; una general puede quedar libre o ligarse a un sector que no sea del mapa."
            : "Nombre, capacidad y precio. Esta entrada es inventario libre: no depende de un sector."}
        </p>
      </div>

      <FormField
        control={form.control}
        name="ticketsDefaultTab"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              Tab inicial en la compra
            </FormLabel>
            <Select
              value={field.value ?? "auto"}
              onValueChange={field.onChange}
              items={defaultTabItems}
            >
              <SelectTrigger className="h-12 rounded-xl text-base w-full max-w-md overflow-hidden">
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
        actionLabel="Agregar Nuevo Tipo de Entrada"
        prominentAdd
        onAdd={() =>
          append({
            ...createInventoryTicket("general", {
              dayId: defaultInventoryDayId(eventDates),
            }),
            seatingSectorId: null,
          })
        }
      >
        {generals.length === 0 ? (
          <EmptyHint
            text={
              hasSeatingPlan
                ? "Opcional. Sumá una general de predio si no alcanza con las zonas del mapa."
                : "Sumá una entrada con nombre, stock y precio."
            }
          />
        ) : (
          generals.map((item) => (
            <InventoryTicketCard
              key={item.key}
              form={form}
              index={item.index}
              expanded={expandedIndex === item.index}
              onToggle={() =>
                setExpandedIndex((current) =>
                  current === item.index ? null : item.index,
                )
              }
              onDuplicate={() => duplicate(item.index)}
              onRemove={() => remove(item.index)}
              capacityLabel="¿Cuántas entradas ponés a la venta?"
              scheduleDays={isMultiDay ? eventDates : []}
              showJornada={isMultiDay}
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
              feePercentage={feePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
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
              dayId: defaultInventoryDayId(eventDates),
            }),
          })
        }
      >
        {addons.length === 0 ? (
          <EmptyHint text="Los adicionales aparecen como upsell antes del pago." />
        ) : (
          addons.map((item) => (
            <InventoryTicketCard
              key={item.key}
              form={form}
              index={item.index}
              expanded={expandedIndex === item.index}
              onToggle={() =>
                setExpandedIndex((current) =>
                  current === item.index ? null : item.index,
                )
              }
              onDuplicate={() => duplicate(item.index)}
              onRemove={() => remove(item.index)}
              capacityLabel="¿Cuántas entradas ponés a la venta?"
              scheduleDays={isMultiDay ? eventDates : []}
              showJornada={isMultiDay}
              feePercentage={feePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
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
          <EmptyHint text="Ejemplo: Pack 4x3, 2x1 o Pack Amigos con cupo propio." />
        ) : (
          bundles.map((item) => (
            <InventoryTicketCard
              key={item.key}
              form={form}
              index={item.index}
              expanded={expandedIndex === item.index}
              onToggle={() =>
                setExpandedIndex((current) =>
                  current === item.index ? null : item.index,
                )
              }
              onEdit={() => {
                setEditingBundleIndex(item.index)
                setBundleOpen(true)
              }}
              onDuplicate={() => duplicate(item.index)}
              onRemove={() => remove(item.index)}
              capacityLabel="Cupo promocional"
              scheduleDays={isMultiDay ? eventDates : []}
              showJornada={isMultiDay}
              feePercentage={feePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
            />
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
        scheduleDays={eventDates}
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
                capacity: tickets[editingBundleIndex]?.capacity,
                admitCount: tickets[editingBundleIndex]?.admitCount ?? 1,
                stockSource:
                  (tickets[editingBundleIndex]?.bundleItems?.length ?? 0) > 0
                    ? "linked"
                    : "own",
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
            admitCount: value.admitCount,
            bundleItems: value.items,
            bundleType: value.bundleType,
            promoDiscountType: value.promoRule.tipoDescuento,
            promoDiscountValue: value.promoRule.valorDescuento,
            promoRequiredQty: value.promoRule.cantidadRequerida,
            promoPayQty: value.promoRule.cantidadPaga,
            dayId:
              value.bundleType === "multi_day_pass"
                ? null
                : defaultInventoryDayId(eventDates),
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
  prominentAdd = false,
  children,
}: {
  title: string
  description: string
  icon: typeof Ticket
  actionLabel: string
  onAdd: () => void
  prominentAdd?: boolean
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-y-4 rounded-2xl bg-muted/20 p-6">
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
      <div className="space-y-3">{children}</div>
      {prominentAdd ? (
        <AddTicketTypeButton onClick={onAdd} label={actionLabel} />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          className="h-12 w-full rounded-xl text-base"
        >
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      )}
    </section>
  )
}

function DayTicketCopyBar({
  days,
  tickets,
  onDuplicate,
}: {
  days: EventFormValues["basics"]["scheduleDays"]
  tickets: EventFormValues["tickets"]
  onDuplicate: (sourceDayId: string, targetDayId: string) => void
}) {
  const [sourceId, setSourceId] = useState(days[0]?.id ?? "")
  const [targetId, setTargetId] = useState(days[1]?.id ?? days[0]?.id ?? "")
  const uncoveredMessage = scheduleDaysMissingTicketsMessage(days, tickets)

  useEffect(() => {
    const ids = new Set(days.map((day) => day.id))
    if (!ids.has(sourceId) && days[0]?.id) setSourceId(days[0].id)
    if (!ids.has(targetId)) {
      setTargetId(days.find((day) => day.id !== sourceId)?.id ?? days[0]?.id ?? "")
    }
  }, [days, sourceId, targetId])

  const dayItems = days.map((day, index) => ({
    value: day.id,
    label: formatInventoryDayOption(day, index),
  }))
  const targetItems = dayItems.filter((item) => item.value !== sourceId)
  const sourceLabel =
    dayItems.find((item) => item.value === sourceId)?.label ?? "este día"

  if (days.length < 2) return null

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Duplicar tickets entre días
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Copiá las tarifas de un día a otro para no cargarlas de nuevo. Los
          abonos y combos no se duplican.
        </p>
      </div>
      {uncoveredMessage ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {uncoveredMessage}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Desde</p>
          <Select
            value={sourceId}
            onValueChange={(value) => {
              if (value) setSourceId(value)
            }}
            items={dayItems}
          >
            <SelectTrigger className="h-12 rounded-xl text-base w-full">
              <SelectValue placeholder="Día de origen">
                {dayItems.find((item) => item.value === sourceId)?.label}
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
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Hacia</p>
          <Select
            value={targetId}
            onValueChange={(value) => {
              if (value) setTargetId(value)
            }}
            items={targetItems}
          >
            <SelectTrigger className="h-12 rounded-xl text-base w-full">
              <SelectValue placeholder="Día de destino">
                {targetItems.find((item) => item.value === targetId)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {targetItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl"
          disabled={!sourceId || !targetId || sourceId === targetId}
          onClick={() => onDuplicate(sourceId, targetId)}
        >
          <Copy className="size-4" aria-hidden="true" />
          Duplicar tickets de {sourceLabel}
        </Button>
      </div>
    </div>
  )
}

function InventoryTicketCard({
  form,
  index,
  expanded,
  onToggle,
  onEdit,
  onDuplicate,
  onRemove,
  capacityLabel,
  scheduleDays = [],
  showJornada = scheduleDays.length >= 2,
  venueRemaining,
  logicalSectors = [],
  showSectorSelect = false,
  showPhases = false,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  expanded: boolean
  onToggle: () => void
  onEdit?: () => void
  onDuplicate: () => void
  onRemove: () => void
  capacityLabel: string
  scheduleDays?: EventFormValues["basics"]["scheduleDays"]
  showJornada?: boolean
  venueRemaining?: number
  logicalSectors?: ReturnType<typeof listGeneralLogicalSectors>
  showSectorSelect?: boolean
  showPhases?: boolean
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
}) {
  return (
    <TicketWalletCard
      form={form}
      index={index}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
      capacityLabel={capacityLabel}
      venueRemaining={venueRemaining}
      feePercentage={feePercentage}
      fixedFee={fixedFee}
      isSponsored={isSponsored}
    >
      <div className="flex flex-wrap items-center gap-2">
        {onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="text-base md:text-sm"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar combo
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="text-base md:text-sm"
        >
          {expanded ? "Ocultar opciones" : "Mas opciones"}
        </Button>
      </div>
      {expanded ? (
        <InventoryRow
          form={form}
          index={index}
          capacityLabel={capacityLabel}
          scheduleDays={scheduleDays}
          showJornada={showJornada}
          venueRemaining={venueRemaining}
          logicalSectors={logicalSectors}
          showSectorSelect={showSectorSelect}
          showPhases={showPhases}
          hidePrimaryFields
        />
      ) : null}
    </TicketWalletCard>
  )
}

function InventoryRow({
  form,
  index,
  capacityLabel,
  showListPrice = false,
  showPhases = false,
  scheduleDays = [],
  showJornada = scheduleDays.length >= 2,
  venueRemaining,
  capacityExceeded = false,
  logicalSectors = [],
  showSectorSelect = true,
  hidePrimaryFields = false,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  capacityLabel: string
  showListPrice?: boolean
  showPhases?: boolean
  scheduleDays?: EventFormValues["basics"]["scheduleDays"]
  showJornada?: boolean
  venueRemaining?: number
  capacityExceeded?: boolean
  logicalSectors?: ReturnType<typeof listGeneralLogicalSectors>
  showSectorSelect?: boolean
  hidePrimaryFields?: boolean
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
      label:
        scheduleDays.length > 0
          ? "Pase Completo / Todos los dias"
          : "Pase para todos los días (Evento completo)",
    },
    ...scheduleDays.map((day, dayIndex) => ({
      value: day.id,
      label: formatInventoryDayOption(day, dayIndex),
    })),
  ]

  const isFree = Number(form.watch(`tickets.${index}.price`)) === 0 &&
    form.watch(`tickets.${index}.price`) != null

  return (
    <div className="space-y-3">
      {isBundle ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={!isFree ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (isFree) {
                form.setValue(`tickets.${index}.price`, undefined as unknown as number, {
                  shouldDirty: true,
                })
                form.setValue(`tickets.${index}.basePrice`, undefined, {
                  shouldDirty: true,
                })
              }
            }}
          >
            De pago
          </Button>
          <Button
            type="button"
            variant={isFree ? "default" : "outline"}
            size="sm"
            onClick={() => {
              form.setValue(`tickets.${index}.price`, 0, { shouldDirty: true })
              form.setValue(`tickets.${index}.basePrice`, 0, { shouldDirty: true })
            }}
          >
            Gratuita / Cortesía
          </Button>
        </div>
      )}
      {hidePrimaryFields ? null : (
      <div className="grid min-w-0 grid-cols-1 items-end gap-4 md:grid-cols-12">
        <FormField
          control={form.control}
          name={`tickets.${index}.name`}
          render={({ field, fieldState }) => (
            <FormItem className="min-w-0 md:col-span-6">
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Nombre</FormLabel>
              <Input
                {...field}
                className="h-12 rounded-xl min-w-0"
                placeholder="Ej: Entrada General"
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
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">{capacityLabel}</FormLabel>
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
                placeholder="Ej: 100"
                aria-invalid={overflow || undefined}
                className={cn("h-12 rounded-xl", overflow && "border-destructive")}
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
        <FormField
          control={form.control}
          name={`tickets.${index}.minPurchaseLimit`}
          render={({ field, fieldState }) => (
            <FormItem className="md:col-span-3">
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Límite mínimo por compra</FormLabel>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={
                  field.value == null || Number.isNaN(Number(field.value))
                    ? "1"
                    : String(field.value)
                }
                onChange={(event) => {
                  const parsed = parseStrictInt(event.target.value)
                  if (parsed === "") {
                    field.onChange(1)
                    return
                  }
                  if (typeof parsed === "number" && Number.isNaN(parsed)) return
                  field.onChange(typeof parsed === "number" ? Math.max(1, parsed) : 1)
                }}
                className="h-12 rounded-xl text-base md:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Unidades mínimas de esta tarifa por transacción.
              </p>
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.maxPurchaseLimit`}
          render={({ field, fieldState }) => (
            <FormItem className="md:col-span-3">
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Límite máximo por compra</FormLabel>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Sin límite propio"
                value={
                  field.value == null || Number.isNaN(Number(field.value))
                    ? ""
                    : String(field.value)
                }
                onChange={(event) => {
                  const parsed = parseStrictInt(event.target.value)
                  if (parsed === "") {
                    field.onChange(null)
                    return
                  }
                  if (typeof parsed === "number" && Number.isNaN(parsed)) return
                  field.onChange(typeof parsed === "number" ? parsed : null)
                }}
                className="h-12 rounded-xl text-base md:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Tope de unidades de esta tarifa por transacción. Para entradas
                mide tickets; para mesas o combos mide unidades de mesas. Dejar
                en blanco para sin límite.
              </p>
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        {isBundle ? (
          <div className="md:col-span-3">
            <p className="mb-1.5 text-sm font-medium">Precio promocional</p>
            <div className="flex h-12 items-baseline gap-2 rounded-xl border border-border bg-muted/40 px-3">
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
                <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Precio ($ ARS)</FormLabel>
                <PriceInput
                  name={`tickets.${index}.price`}
                  aria-invalid={Boolean(fieldState.error)}
                  value={isFree ? 0 : field.value}
                  onValueChange={(value) => field.onChange(value ?? undefined)}
                  placeholder="0"
                  allowEmpty
                  disabled={isFree}
                  className="h-12 rounded-xl"
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />
        )}
      </div>
      )}
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
                <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Elegí el sector</FormLabel>
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
                  <SelectTrigger className="h-12 rounded-xl text-base w-full max-w-md">
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
      {showJornada ? (
        <FormField
          control={form.control}
          name={`tickets.${index}.dayId`}
          render={({ field, fieldState }) => {
            const selected = field.value?.trim() || TICKET_DAY_ALL
            return (
              <FormItem>
                <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Jornada</FormLabel>
                <Select
                  value={selected}
                  onValueChange={(value) =>
                    field.onChange(value === TICKET_DAY_ALL ? null : value)
                  }
                  items={dayItems}
                >
                  <SelectTrigger className="h-12 rounded-xl text-base w-full max-w-md">
                    <SelectValue placeholder="Seleccionar jornada">
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
            <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Qué incluye (opcional)</FormLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              maxLength={TICKET_DESCRIPTION_MAX}
              className="h-12 rounded-xl"
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
            <FormLabel className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
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
              <FormLabel className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Precio de lista (para mostrar ahorro)
              </FormLabel>
              <PriceInput
                name={`tickets.${index}.listPrice`}
                aria-invalid={Boolean(fieldState.error)}
                value={field.value ?? undefined}
                onValueChange={(value) => field.onChange(value ?? null)}
                className="h-12 rounded-xl max-w-xs"
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
                      <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Nombre del lote</FormLabel>
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
                      <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Precio</FormLabel>
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
                      <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">Límite</FormLabel>
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
