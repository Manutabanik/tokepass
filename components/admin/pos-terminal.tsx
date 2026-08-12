"use client"

import {
  Banknote,
  LoaderCircle,
  Minus,
  Plus,
  Smartphone,
  Ticket,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import {
  createPosSale,
  type PosEventOption,
  type PosSaleResult,
} from "@/app/actions/pos"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export function PosTerminal({ events }: { events: PosEventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "")
  const [tierId, setTierId] = useState(events[0]?.tiers[0]?.id ?? "")
  const [quantity, setQuantity] = useState(1)
  const [phone, setPhone] = useState("")
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Extract<
    PosSaleResult,
    { success: true }
  > | null>(null)

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId],
  )

  const selectedTier = selectedEvent?.tiers ?? []
  const selectedTierSafe = selectedTier
  const selectedTierId =
    selectedTierSafe.find((tier) => tier.id === tierId)?.id ??
    selectedTierSafe[0]?.id ??
    ""

  const selectedTierItem =
    selectedTierSafe.find((tier) => tier.id === selectedTierId) ?? null

  const total = selectedTierItem
    ? selectedTierItem.price * quantity
    : 0

  function onEventChange(nextEventId: string) {
    setEventId(nextEventId)
    const next = events.find((event) => event.id === nextEventId)
    setTierId(next?.tiers[0]?.id ?? "")
    setQuantity(1)
  }

  function sell(method: "cash_pos" | "transfer_pos") {
    if (!eventId || !selectedTierId || isPending) return

    startTransition(async () => {
      const sale = await createPosSale({
        eventId,
        tierId: selectedTierId,
        quantity,
        paymentMethod: method,
        customerPhone: phone,
      })

      if (!sale.success) {
        toast.error(sale.error)
        return
      }

      toast.success(
        method === "cash_pos" ? "Cobrado en efectivo" : "Cobrado por transferencia",
      )
      setResult(sale)
      setQuantity(1)
      setPhone("")
    })
  }

  if (events.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/60 px-5 py-12 text-center">
        <Ticket className="mx-auto size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-500">
          No hay eventos disponibles para cobrar en puerta.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-2">
        <Label className="text-zinc-400">Evento</Label>
        <Select value={eventId} onValueChange={(v) => v && onEventChange(v)}>
          <SelectTrigger className="h-14 rounded-2xl border-zinc-800 bg-zinc-950 text-base text-white">
            <SelectValue placeholder="Elegí evento" />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400">Tipo de entrada</Label>
        <Select
          value={selectedTierId}
          onValueChange={(v) => v && setTierId(v)}
        >
          <SelectTrigger className="h-14 rounded-2xl border-zinc-800 bg-zinc-950 text-base text-white">
            <SelectValue placeholder="Elegí tipo" />
          </SelectTrigger>
          <SelectContent>
            {selectedTierSafe.map((tier) => (
              <SelectItem key={tier.id} value={tier.id}>
                {tier.name} · {formatCurrency(tier.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTierItem ? (
          <p className="text-xs text-zinc-500">
            {selectedTierItem.available} disponibles
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <span className="text-sm font-medium text-zinc-400">Cantidad</span>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-12 rounded-full border-zinc-700"
            disabled={quantity <= 1 || isPending}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Minus />
          </Button>
          <span className="w-8 text-center text-2xl font-black tabular-nums text-white">
            {quantity}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-12 rounded-full border-zinc-700"
            disabled={
              isPending ||
              !selectedTierItem ||
              quantity >= Math.min(10, selectedTierItem.available)
            }
            onClick={() =>
              setQuantity((q) =>
                Math.min(10, selectedTierItem?.available ?? 10, q + 1),
              )
            }
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pos-phone" className="text-zinc-400">
          Teléfono / WhatsApp (opcional)
        </Label>
        <Input
          id="pos-phone"
          inputMode="tel"
          placeholder="+54 9 11 ..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-14 rounded-2xl border-zinc-800 bg-zinc-950 text-base text-white"
        />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">Total</span>
          <span className="text-3xl font-black tabular-nums text-white">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        <Button
          type="button"
          disabled={isPending || !selectedTierItem || total <= 0}
          onClick={() => sell("cash_pos")}
          className={cn(
            "h-16 rounded-2xl text-lg font-bold",
            "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
          )}
        >
          {isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Banknote className="size-6" />
          )}
          Efectivo $
        </Button>
        <Button
          type="button"
          disabled={isPending || !selectedTierItem || total <= 0}
          onClick={() => sell("transfer_pos")}
          className="h-16 rounded-2xl border border-sky-500/40 bg-sky-500/15 text-lg font-bold text-sky-100 hover:bg-sky-500/25"
        >
          {isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Smartphone className="size-6" />
          )}
          Mercado Pago / Transferencia
        </Button>
      </div>

      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setResult(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Venta registrada</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Mostrá el QR en pantalla o enviá el link al cliente.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Total cobrado:{" "}
                <span className="font-semibold text-white">
                  {formatCurrency(result.totalAmount)}
                </span>
              </p>
              {result.tickets.map((ticket, index) => (
                <div
                  key={ticket.id}
                  className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-4 text-center"
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Entrada {index + 1}
                  </p>
                  <div className="mx-auto inline-block rounded-xl bg-white p-3">
                    <QRCodeSVG
                      value={ticket.totpSecret}
                      size={200}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#09090b"
                    />
                  </div>
                  <a
                    href={ticket.printPath}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm text-emerald-400 underline"
                  >
                    Abrir vista imprimible
                  </a>
                </div>
              ))}
              <Button
                type="button"
                className="h-12 w-full rounded-full"
                onClick={() => setResult(null)}
              >
                Nueva venta
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
