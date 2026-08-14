"use client"

import {
  Armchair,
  Car,
  Gift,
  Plus,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  inferBundleType,
  bundleIncludesSeating,
} from "@/lib/inventory/flexible-bundles"
import {
  inferInventoryTierType,
  layoutTypeForInventory,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
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
  }
}

type Props = {
  form: UseFormReturn<EventFormValues>
}

export function UnifiedInventoryPanel({ form }: Props) {
  const tickets = form.watch("tickets") ?? []
  const scheduleDays = form.watch("basics.scheduleDays") ?? []
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

  const grouped = tickets.map((tier, index) => {
    const tierType = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      bundleItems: tier.bundleItems,
    })
    return { index, tierType, key: tier.id ?? `ticket-${index}` }
  })

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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Gestión completa de inventario
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Combiná mapa numerado, generales de campo, adicionales y combos en el
          mismo evento. El stock se reserva junto en el checkout.
        </p>
      </div>

      <InventoryBlock
        title="Entradas generales y capacidad de campo"
        description="Zonas sin asiento numerado: predio, campo de pie o platea libre."
        icon={Ticket}
        actionLabel="Agregar sector general"
        onAdd={() => append(createInventoryTicket("general"))}
      >
        {generals.length === 0 ? (
          <EmptyHint text="Todavía no hay sectores generales. El mapa numerado puede convivir con esta lista." />
        ) : (
          generals.map((item) => (
            <InventoryRow
              key={item.key}
              form={form}
              index={item.index}
              capacityLabel="Capacidad máxima"
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
  onRemove,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  capacityLabel: string
  showListPrice?: boolean
  onRemove: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem_auto]">
        <FormField
          control={form.control}
          name={`tickets.${index}.name`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <Input
                {...field}
                className="h-11"
                placeholder="Nombre del ítem"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.capacity`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{capacityLabel}</FormLabel>
              <Input
                type="number"
                min={1}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                  )
                }
                className="h-11"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.price`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Precio</FormLabel>
              <Input
                type="number"
                min={0}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                  )
                }
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
              <Input
                type="number"
                min={0}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
                className="h-11 max-w-xs"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
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
