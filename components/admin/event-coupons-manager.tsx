"use client"

import { Loader2, Plus, Tag } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createPromoCode,
  setPromoCodeActive,
  type PromoCodeRow,
} from "@/app/actions/coupons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { PromoDiscountType } from "@/types/database"
import { cn } from "@/lib/utils"

function discountLabel(row: PromoCodeRow) {
  if (row.discount_type === "percentage") {
    return `${Number(row.discount_value)}%`
  }
  return formatCurrency(Number(row.discount_value))
}

export function EventCouponsManager({
  eventId,
  eventTitle,
  initialCoupons,
}: {
  eventId: string
  eventTitle: string
  initialCoupons: PromoCodeRow[]
}) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [code, setCode] = useState("")
  const [discountType, setDiscountType] =
    useState<PromoDiscountType>("percentage")
  const [discountValue, setDiscountValue] = useState("10")
  const [maxUses, setMaxUses] = useState("")
  const [validUntil, setValidUntil] = useState("")

  const activeCount = useMemo(
    () => coupons.filter((item) => item.is_active).length,
    [coupons],
  )

  function resetForm() {
    setCode("")
    setDiscountType("percentage")
    setDiscountValue("10")
    setMaxUses("")
    setValidUntil("")
  }

  function submitCreate() {
    startTransition(async () => {
      const result = await createPromoCode({
        eventId,
        code,
        discountType,
        discountValue: Number(discountValue),
        maxUses: maxUses.trim() ? Number(maxUses) : null,
        validUntil: validUntil.trim()
          ? new Date(validUntil).toISOString()
          : null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setCoupons((current) => [result.data, ...current])
      toast.success(`Cupón ${result.data.code} creado.`)
      resetForm()
      setOpen(false)
    })
  }

  function toggleActive(row: PromoCodeRow) {
    startTransition(async () => {
      const result = await setPromoCodeActive({
        eventId,
        promoCodeId: row.id,
        isActive: !row.is_active,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setCoupons((current) =>
        current.map((item) => (item.id === row.id ? result.data : item)),
      )
      toast.success(
        result.data.is_active ? "Cupón activado." : "Cupón desactivado.",
      )
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{eventTitle}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {activeCount} activo{activeCount === 1 ? "" : "s"} · {coupons.length}{" "}
            total
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full"
        >
          <Plus className="size-4" aria-hidden />
          Crear cupón
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-zinc-500"
                >
                  Todavía no hay cupones. Creá el primero para campañas B2C.
                </TableCell>
              </TableRow>
            ) : (
              coupons.map((row) => {
                const exhausted =
                  row.max_uses != null && row.current_uses >= row.max_uses
                const expired =
                  row.valid_until != null &&
                  new Date(row.valid_until).getTime() < Date.now()
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono font-semibold tracking-wide">
                      <span className="inline-flex items-center gap-1.5">
                        <Tag className="size-3.5 text-violet-500" aria-hidden />
                        {row.code}
                      </span>
                    </TableCell>
                    <TableCell>{discountLabel(row)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.current_uses}
                      {row.max_uses != null ? ` / ${row.max_uses}` : " · ilimitado"}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {row.valid_until
                        ? formatDateTime(row.valid_until)
                        : "Sin vencimiento"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          !row.is_active
                            ? "border-zinc-300 text-zinc-500"
                            : exhausted || expired
                              ? "border-amber-400/40 text-amber-700 dark:text-amber-300"
                              : "border-emerald-400/40 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {!row.is_active
                          ? "Inactivo"
                          : exhausted
                            ? "Agotado"
                            : expired
                              ? "Vencido"
                              : "Activo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => toggleActive(row)}
                        className="rounded-full"
                      >
                        {row.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear cupón</DialogTitle>
            <DialogDescription>
              El código se normaliza en mayúsculas. El descuento se recalcula
              siempre en el servidor al pagar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código</Label>
              <Input
                id="coupon-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="MEGA20"
                className="font-mono uppercase"
                maxLength={40}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={discountType}
                  onValueChange={(value) =>
                    value && setDiscountType(value as PromoDiscountType)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje %</SelectItem>
                    <SelectItem value="fixed_amount">Monto fijo $</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-value">Valor</Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="coupon-max">Límite de usos</Label>
                <Input
                  id="coupon-max"
                  type="number"
                  min={1}
                  placeholder="Ilimitado"
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-until">Vencimiento</Label>
                <Input
                  id="coupon-until"
                  type="datetime-local"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submitCreate} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                "Crear cupón"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
