"use client"

import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Printer,
  Trash2,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  getComplimentaryBatchTickets,
  getTierComboItems,
  issueComplimentaryNamed,
  issueComplimentaryUnnamed,
  removeTierComboItem,
  setTierComboItem,
  updateTierAdmitCount,
  type ComplimentaryTierOption,
  type NamedGuestRow,
} from "@/app/actions/complimentary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

type StoreItem = {
  id: string
  name: string
  price: number
  stock: number
}

type ComboRow = {
  id: string
  eventItemId: string
  quantity: number
  itemName: string
}

function parseCsv(text: string): NamedGuestRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const split = (line: string) => {
    const cols: string[] = []
    let cur = ""
    let q = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        q = !q
        continue
      }
      if ((ch === "," || ch === ";") && !q) {
        cols.push(cur.trim())
        cur = ""
        continue
      }
      cur += ch
    }
    cols.push(cur.trim())
    return cols
  }

  const header = split(lines[0]).map((h) => h.toLowerCase())
  const hasHeader = header.some((h) =>
    ["nombre", "name", "dni", "email", "apellido"].includes(h),
  )
  const start = hasHeader ? 1 : 0
  const idx = (names: string[]) =>
    hasHeader ? names.reduce((acc, n) => (acc >= 0 ? acc : header.indexOf(n)), -1) : -1

  const iNombre = idx(["nombre", "name"])
  const iApellido = idx(["apellido", "last_name", "lastname"])
  const iDni = idx(["dni", "documento"])
  const iEmail = idx(["email", "mail"])
  const iTel = idx(["telefono", "teléfono", "phone", "whatsapp"])

  const rows: NamedGuestRow[] = []
  for (let i = start; i < lines.length; i += 1) {
    const cols = split(lines[i])
    if (hasHeader) {
      rows.push({
        nombre: cols[iNombre] ?? "",
        apellido: iApellido >= 0 ? cols[iApellido] : "",
        dni: cols[iDni] ?? "",
        email: iEmail >= 0 ? cols[iEmail] : "",
        telefono: iTel >= 0 ? cols[iTel] : "",
      })
    } else {
      // nombre, apellido, dni, email, telefono
      rows.push({
        nombre: cols[0] ?? "",
        apellido: cols[1] ?? "",
        dni: cols[2] ?? "",
        email: cols[3] ?? "",
        telefono: cols[4] ?? "",
      })
    }
  }
  return rows.filter((r) => r.dni.replace(/\D/g, "").length >= 7)
}

export function ComplimentaryIssuer({
  eventId,
  tiers,
  storeItems,
}: {
  eventId: string
  tiers: ComplimentaryTierOption[]
  storeItems: StoreItem[]
}) {
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "")
  const [unnamedCount, setUnnamedCount] = useState("50")
  const [csvText, setCsvText] = useState("")
  const [csvRows, setCsvRows] = useState<NamedGuestRow[]>([])
  const [isPending, startTransition] = useTransition()
  const [lastBatchId, setLastBatchId] = useState<string | null>(null)
  const [batchTickets, setBatchTickets] = useState<
    Awaited<ReturnType<typeof getComplimentaryBatchTickets>>
  >([])
  const [comboRows, setComboRows] = useState<ComboRow[]>([])
  const [comboItemId, setComboItemId] = useState(storeItems[0]?.id ?? "")
  const [comboQty, setComboQty] = useState("1")
  const [admitDraft, setAdmitDraft] = useState(
    String(tiers[0]?.admitCount ?? 1),
  )

  const selected = useMemo(
    () => tiers.find((t) => t.id === tierId) ?? null,
    [tiers, tierId],
  )

  useEffect(() => {
    if (!tierId) return
    startTransition(async () => {
      setComboRows(await getTierComboItems(tierId))
    })
  }, [tierId])

  function onTierChange(next: string) {
    setTierId(next)
    const t = tiers.find((x) => x.id === next)
    setAdmitDraft(String(t?.admitCount ?? 1))
    startTransition(async () => {
      const rows = await getTierComboItems(next)
      setComboRows(rows)
    })
  }

  function handleCsvFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      setCsvText(text)
      const rows = parseCsv(text)
      setCsvRows(rows)
      toast.success(`${rows.length} filas listas para emitir`)
    }
    reader.readAsText(file, "UTF-8")
  }

  function saveAdmit() {
    if (!tierId || isPending) return
    startTransition(async () => {
      const res = await updateTierAdmitCount({
        eventId,
        tierId,
        admitCount: Number(admitDraft),
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        Number(admitDraft) > 1
          ? `Mesa configurada: ${admitDraft} QRs por unidad`
          : "1 QR por unidad",
      )
    })
  }

  function addCombo() {
    if (!tierId || !comboItemId || isPending) return
    startTransition(async () => {
      const res = await setTierComboItem({
        eventId,
        tierId,
        eventItemId: comboItemId,
        quantity: Number(comboQty),
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Extra agregado al combo")
      setComboRows(await getTierComboItems(tierId))
    })
  }

  function removeCombo(id: string) {
    startTransition(async () => {
      const res = await removeTierComboItem({ eventId, comboItemId: id })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setComboRows(await getTierComboItems(tierId))
    })
  }

  function emitNamed() {
    if (!tierId || isPending) return
    if (csvRows.length === 0) {
      toast.error("Subí un CSV con al menos un DNI válido")
      return
    }
    startTransition(async () => {
      const res = await issueComplimentaryNamed({
        eventId,
        tierId,
        guests: csvRows,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Emitidas ${res.ticketsIssued} entradas (${res.units} unidades)`,
      )
      setLastBatchId(res.batchId)
      setBatchTickets(
        await getComplimentaryBatchTickets({
          eventId,
          batchId: res.batchId,
        }),
      )
    })
  }

  function emitUnnamed() {
    if (!tierId || isPending) return
    startTransition(async () => {
      const res = await issueComplimentaryUnnamed({
        eventId,
        tierId,
        count: Number(unnamedCount),
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Lote listo: ${res.ticketsIssued} QRs · batch ${res.batchId.slice(0, 8)}`,
      )
      setLastBatchId(res.batchId)
      setBatchTickets(
        await getComplimentaryBatchTickets({
          eventId,
          batchId: res.batchId,
        }),
      )
    })
  }

  if (tiers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Creá al menos un tipo de entrada para emitir cortesías.
      </p>
    )
  }

  const projectedQrs =
    (selected?.admitCount ?? 1) *
    (csvRows.length || Number(unnamedCount) || 0)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Tipo de entrada</Label>
        <Select value={tierId} onValueChange={(v) => v && onTierChange(v)}>
          <SelectTrigger className="min-h-12">
            <SelectValue placeholder="Elegí tipo" />
          </SelectTrigger>
          <SelectContent>
            {tiers.map((tier) => (
              <SelectItem key={tier.id} value={tier.id}>
                {tier.name} · {formatCurrency(tier.price)} ·{" "}
                {tier.admitCount > 1
                  ? `Mesa x${tier.admitCount}`
                  : "1 QR"}{" "}
                · {tier.available} disp.
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Mesa / agrupación (QRs por unidad)
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Ej: “Mesa para 4” → 4. Cada QR se valida por separado en puerta.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="admit">Personas / QRs</Label>
            <Input
              id="admit"
              inputMode="numeric"
              value={admitDraft}
              onChange={(e) =>
                setAdmitDraft(e.target.value.replace(/\D/g, "").slice(0, 2))
              }
              className="h-11 w-24"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isPending}
            onClick={saveAdmit}
          >
            Guardar
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Combo (extras incluidos)
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Al emitir este tipo, se generan canjes de gastronomía/merch en la
          billetera.
        </p>
        {comboRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {comboRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span>
                  {row.quantity}× {row.itemName}
                </span>
                <button
                  type="button"
                  className="text-zinc-400 hover:text-red-500"
                  onClick={() => removeCombo(row.id)}
                  aria-label="Quitar"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">Sin extras todavía.</p>
        )}
        {storeItems.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1">
              <Label>Producto</Label>
              <Select
                value={comboItemId}
                onValueChange={(v) => v && setComboItemId(v)}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Extra" />
                </SelectTrigger>
                <SelectContent>
                  {storeItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cant.</Label>
              <Input
                inputMode="numeric"
                value={comboQty}
                onChange={(e) =>
                  setComboQty(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="h-11 w-16"
              />
            </div>
            <Button
              type="button"
              className="min-h-11"
              disabled={isPending}
              onClick={addCombo}
            >
              <Plus className="size-4" />
              Agregar
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">
            Creá productos en la Tienda de Extras para armar combos.
          </p>
        )}
      </div>

      <Tabs defaultValue="csv">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="csv">Emitir por CSV</TabsTrigger>
          <TabsTrigger value="unnamed">Lote innombrado</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-4 pt-4">
          <p className="text-sm text-zinc-500">
            Columnas: nombre, apellido, dni, email, telefono. El DNI es
            obligatorio para el ingreso por DNI en puerta.
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
            className="min-h-12 cursor-pointer"
          />
          {csvRows.length > 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
              {csvRows.length} invitados · ~{csvRows.length * (selected?.admitCount ?? 1)} QRs
            </p>
          ) : null}
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer">Vista previa CSV</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
              {csvText.slice(0, 2000) || "—"}
            </pre>
          </details>
          <Button
            type="button"
            disabled={isPending || csvRows.length === 0}
            onClick={emitNamed}
            className="min-h-12 w-full rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            Emitir cortesías por CSV
          </Button>
        </TabsContent>

        <TabsContent value="unnamed" className="space-y-4 pt-4">
          <p className="text-sm text-zinc-500">
            Generá N unidades (sin nombre) con un batch_id para imprimir en
            boletería.
          </p>
          <div className="space-y-2">
            <Label htmlFor="unnamed">Cantidad de unidades</Label>
            <Input
              id="unnamed"
              inputMode="numeric"
              value={unnamedCount}
              onChange={(e) =>
                setUnnamedCount(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="min-h-12"
            />
            <p className="text-xs text-zinc-500">
              Estimado: {(Number(unnamedCount) || 0) * (selected?.admitCount ?? 1)}{" "}
              QRs (máx. 3.000)
            </p>
          </div>
          <Button
            type="button"
            disabled={isPending}
            onClick={emitUnnamed}
            className="min-h-12 w-full rounded-xl font-bold"
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Users className="size-4" />
            )}
            Generar lote innombrado
          </Button>
        </TabsContent>
      </Tabs>

      {lastBatchId && batchTickets.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                Lote emitido
              </p>
              <p className="font-mono text-xs text-zinc-500">
                batch {lastBatchId}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => {
                const header =
                  "id,nombre,dni,email,tier,slot,print_url\n"
                const body = batchTickets
                  .map(
                    (t) =>
                      `${t.id},"${t.holderName}",${t.holderDni ?? ""},${t.holderEmail ?? ""},${t.tierName},${t.groupSlot ?? 1},${typeof window !== "undefined" ? window.location.origin : ""}${t.printPath}`,
                  )
                  .join("\n")
                const blob = new Blob([header + body], {
                  type: "text/csv;charset=utf-8",
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `cortesias-${lastBatchId.slice(0, 8)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="size-4" />
              Descargar CSV
            </Button>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {batchTickets.slice(0, 40).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm dark:bg-zinc-950/60"
              >
                <span className="min-w-0 truncate">
                  {t.holderName}
                  {t.holderDni ? ` · DNI ${t.holderDni}` : ""}
                  {t.groupSlot ? ` · #${t.groupSlot}` : ""}
                </span>
                <Link
                  href={t.printPath}
                  target="_blank"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white",
                  )}
                >
                  <Printer className="size-3.5" />
                  Imprimir
                </Link>
              </li>
            ))}
          </ul>
          {batchTickets.length > 40 ? (
            <p className="text-xs text-zinc-500">
              Mostrando 40 de {batchTickets.length}. Usá el CSV para el resto.
            </p>
          ) : null}
        </div>
      ) : null}

      {projectedQrs > 3000 ? (
        <p className="text-sm text-red-500">
          Este lote superaría 3.000 QRs. Bajá la cantidad o el admit_count.
        </p>
      ) : null}
    </div>
  )
}
