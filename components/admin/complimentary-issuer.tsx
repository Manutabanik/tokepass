"use client"

import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  MessageCircle,
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
  issueComplimentaryBatch,
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
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const split = (line: string) => {
    const cols: string[] = []
    let cur = ""
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        quoted = !quoted
        continue
      }
      if ((ch === "," || ch === ";") && !quoted) {
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
      rows.push({
        nombre: cols[0] ?? "",
        apellido: cols[1] ?? "",
        dni: cols[2] ?? "",
        email: cols[3] ?? "",
        telefono: cols[4] ?? "",
      })
    }
  }
  return rows.filter((row) => row.nombre.trim().length >= 2)
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
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dni, setDni] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [sendEmail, setSendEmail] = useState(true)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)

  const selected = useMemo(
    () => tiers.find((tier) => tier.id === tierId) ?? null,
    [tiers, tierId],
  )

  const selectedStoreItem = useMemo(
    () => storeItems.find((item) => item.id === comboItemId) ?? null,
    [storeItems, comboItemId],
  )

  const tierSelectItems = useMemo(
    () =>
      tiers.map((tier) => ({
        value: tier.id,
        label: `${tier.name} (${tier.price === 0 ? "Gratis" : formatCurrency(tier.price)})`,
      })),
    [tiers],
  )

  const storeSelectItems = useMemo(
    () =>
      storeItems.map((item) => ({
        value: item.id,
        label: `${item.name} · ${formatCurrency(item.price)}`,
      })),
    [storeItems],
  )

  const admitCount = Math.max(1, Number(admitDraft) || 1)
  const holderName = [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ")
  const recipient = email.trim() || whatsapp.trim() || holderName || "Sin destinatario"

  useEffect(() => {
    if (!tierId) return
    startTransition(async () => {
      setComboRows(await getTierComboItems(tierId))
    })
  }, [tierId])

  function onTierChange(next: string) {
    setTierId(next)
    const tier = tiers.find((item) => item.id === next)
    setAdmitDraft(String(tier?.admitCount ?? 1))
    startTransition(async () => {
      setComboRows(await getTierComboItems(next))
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

  async function persistAdmitIfNeeded() {
    if (!tierId) return { ok: false as const, error: "Elegí un tipo de entrada." }
    if (Number(admitDraft) === (selected?.admitCount ?? 1)) {
      return { ok: true as const }
    }
    const res = await updateTierAdmitCount({
      eventId,
      tierId,
      admitCount,
    })
    if (!res.success) return { ok: false as const, error: res.error }
    return { ok: true as const }
  }

  async function loadBatch(batchId: string) {
    setLastBatchId(batchId)
    setBatchTickets(
      await getComplimentaryBatchTickets({
        eventId,
        batchId,
      }),
    )
  }

  function saveAdmit() {
    if (!tierId || isPending) return
    startTransition(async () => {
      const res = await updateTierAdmitCount({
        eventId,
        tierId,
        admitCount,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        admitCount > 1
          ? `Mesa configurada: ${admitCount} QRs por unidad`
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

  function emitIndividual() {
    if (!tierId || isPending) return
    if (firstName.trim().length < 2) {
      toast.error("Ingresá el nombre del asistente.")
      return
    }
    const dniDigits = dni.replace(/\D/g, "")
    if (dniDigits && (dniDigits.length < 7 || dniDigits.length > 11)) {
      toast.error("El DNI, si lo cargás, debe tener 7 a 11 dígitos.")
      return
    }
    if (sendEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim().toLowerCase())) {
      toast.error("Ingresá un email válido para enviar la cortesía.")
      return
    }
    if (sendWhatsApp && whatsapp.replace(/\D/g, "").length < 8) {
      toast.error("Ingresá un WhatsApp válido para enviar la cortesía.")
      return
    }

    startTransition(async () => {
      const admit = await persistAdmitIfNeeded()
      if (!admit.ok) {
        toast.error(admit.error)
        return
      }

      const res = await issueComplimentaryBatch({
        eventId,
        tierId,
        guests: [
          {
            nombre: firstName.trim(),
            apellido: lastName.trim(),
            dni: dniDigits,
            email: email.trim().toLowerCase(),
            telefono: whatsapp.trim(),
          },
        ],
        sendEmail,
        sendWhatsApp,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }

      const sent: string[] = []
      if (res.sentEmail) sent.push("email")
      if (res.sentWhatsApp) sent.push("WhatsApp")
      toast.success(
        sent.length > 0
          ? `Cortesía emitida y enviada por ${sent.join(" y ")} (${res.ticketsIssued} pases).`
          : `Cortesía emitida: ${res.ticketsIssued} pases.`,
      )
      if (res.notifyError) toast.error(res.notifyError)
      await loadBatch(res.batchId)
    })
  }

  function emitNamed() {
    if (!tierId || isPending) return
    if (csvRows.length === 0) {
      toast.error("Subí un CSV con al menos un nombre válido")
      return
    }
    startTransition(async () => {
      const admit = await persistAdmitIfNeeded()
      if (!admit.ok) {
        toast.error(admit.error)
        return
      }
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
      await loadBatch(res.batchId)
    })
  }

  function emitUnnamed() {
    if (!tierId || isPending) return
    startTransition(async () => {
      const admit = await persistAdmitIfNeeded()
      if (!admit.ok) {
        toast.error(admit.error)
        return
      }
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
      await loadBatch(res.batchId)
    })
  }

  if (tiers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Creá al menos un tipo de entrada para emitir cortesías.
      </p>
    )
  }

  const projectedQrs =
    admitCount * (csvRows.length || Number(unnamedCount) || 0)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-2">
        <Label>Tipo de entrada / sector</Label>
        <Select
          value={tierId}
          onValueChange={(value) => value && onTierChange(value)}
          items={tierSelectItems}
        >
          <SelectTrigger className="min-h-12 w-full min-w-0 max-w-full overflow-hidden">
            <SelectValue placeholder="Seleccioná un tipo de entrada">
              {selected
                ? `${selected.name} (${selected.price === 0 ? "Gratis" : formatCurrency(selected.price)})`
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tiers.map((tier) => (
              <SelectItem
                key={tier.id}
                value={tier.id}
                className="h-auto items-start whitespace-normal"
              >
                <span className="min-w-0 break-words whitespace-normal">
                  {tier.name}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  ({tier.price === 0 ? "Gratis" : formatCurrency(tier.price)})
                  {tier.admitCount > 1
                    ? ` · Mesa x${tier.admitCount}`
                    : " · 1 QR"}{" "}
                  · {tier.available} disp.
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="individual">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="individual" className="min-h-11 px-3">
            Emisión Individual
          </TabsTrigger>
          <TabsTrigger value="bulk" className="min-h-11 px-3">
            Emisión Masiva (CSV y Lotes)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Datos del asistente
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  La cortesía queda nominada a este titular.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cpl-nombre">Nombre</Label>
                  <Input
                    id="cpl-nombre"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="h-11"
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpl-apellido">Apellido</Label>
                  <Input
                    id="cpl-apellido"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="h-11"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpl-dni">DNI (opcional)</Label>
                <Input
                  id="cpl-dni"
                  value={dni}
                  onChange={(event) =>
                    setDni(event.target.value.replace(/\D/g, "").slice(0, 11))
                  }
                  inputMode="numeric"
                  className="h-11"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cpl-email">Email</Label>
                  <Input
                    id="cpl-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpl-whatsapp">WhatsApp</Label>
                  <Input
                    id="cpl-whatsapp"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    inputMode="tel"
                    placeholder="2645067363"
                    className="h-11"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <GroupingAndCombos
                admitDraft={admitDraft}
                setAdmitDraft={setAdmitDraft}
                saveAdmit={saveAdmit}
                isPending={isPending}
                comboRows={comboRows}
                storeItems={storeItems}
                comboItemId={comboItemId}
                setComboItemId={setComboItemId}
                comboQty={comboQty}
                setComboQty={setComboQty}
                selectedStoreItem={selectedStoreItem}
                storeSelectItems={storeSelectItems}
                addCombo={addCombo}
                removeCombo={removeCombo}
              />
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Envío y resumen
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  El ticket se emite al instante y se dispara la notificación
                  marcada.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(event) => setSendEmail(event.target.checked)}
                  className="mt-0.5 size-4 accent-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <Mail className="size-4" />
                    Enviar ticket por Email
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Living QR al mail del titular.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(event) => setSendWhatsApp(event.target.checked)}
                  className="mt-0.5 size-4 accent-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <MessageCircle className="size-4" />
                    Enviar ticket por WhatsApp
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Enlace de acceso al número indicado.
                  </span>
                </span>
              </label>

              <div className="space-y-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">Resumen</p>
                <p className="text-muted-foreground">
                  Sector: {selected?.name ?? "—"}
                </p>
                <p className="text-muted-foreground">
                  Pases: {admitCount} QR{admitCount === 1 ? "" : "s"}
                </p>
                <p className="text-muted-foreground">
                  Destinatario: {recipient}
                </p>
                {comboRows.length > 0 ? (
                  <p className="text-muted-foreground">
                    Extras: {comboRows.map((row) => `${row.quantity}x ${row.itemName}`).join(", ")}
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                size="lg"
                disabled={isPending}
                onClick={emitIndividual}
                className="h-12 w-full rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  "Emitir y Enviar Cortesía"
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Subir CSV nominado
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Una fila por invitado. El DNI ayuda al ingreso en puerta.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/70 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Columna</th>
                      <th className="px-3 py-2 font-semibold">Ejemplo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["nombre", "Carlos"],
                      ["apellido", "Mendoza"],
                      ["dni", "30111222"],
                      ["email", "carlos@mail.com"],
                      ["telefono", "2645067363"],
                    ].map(([col, example]) => (
                      <tr key={col} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-foreground">{col}</td>
                        <td className="px-3 py-2 text-muted-foreground">{example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleCsvFile(event.target.files?.[0] ?? null)}
                className="min-h-12 cursor-pointer"
              />
              {csvRows.length > 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-200">
                  {csvRows.length} invitados · ~
                  {csvRows.length * admitCount} QRs
                </p>
              ) : null}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Vista previa CSV</summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-muted p-3">
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
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Lote innombrado
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generá N unidades sin titular para imprimir en boletería.
                </p>
              </div>
              <GroupingAndCombos
                admitDraft={admitDraft}
                setAdmitDraft={setAdmitDraft}
                saveAdmit={saveAdmit}
                isPending={isPending}
                comboRows={comboRows}
                storeItems={storeItems}
                comboItemId={comboItemId}
                setComboItemId={setComboItemId}
                comboQty={comboQty}
                setComboQty={setComboQty}
                selectedStoreItem={selectedStoreItem}
                storeSelectItems={storeSelectItems}
                addCombo={addCombo}
                removeCombo={removeCombo}
              />
              <div className="space-y-2">
                <Label htmlFor="unnamed">Cantidad de unidades</Label>
                <Input
                  id="unnamed"
                  inputMode="numeric"
                  value={unnamedCount}
                  onChange={(event) =>
                    setUnnamedCount(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="min-h-12"
                />
                <p className="text-xs text-muted-foreground">
                  Estimado: {(Number(unnamedCount) || 0) * admitCount} QRs
                  (máx. 3.000)
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
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {lastBatchId && batchTickets.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-200">
                Lote emitido
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                batch {lastBatchId}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => {
                const header = "id,nombre,dni,email,tier,slot,print_url\n"
                const body = batchTickets
                  .map(
                    (ticket) =>
                      `${ticket.id},"${ticket.holderName}",${ticket.holderDni ?? ""},${ticket.holderEmail ?? ""},${ticket.tierName},${ticket.groupSlot ?? 1},${typeof window !== "undefined" ? window.location.origin : ""}${ticket.printPath}`,
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
            {batchTickets.slice(0, 40).map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {ticket.holderName}
                  {ticket.holderDni ? ` · DNI ${ticket.holderDni}` : ""}
                  {ticket.groupSlot ? ` · #${ticket.groupSlot}` : ""}
                </span>
                <Link
                  href={ticket.printPath}
                  target="_blank"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background",
                  )}
                >
                  <Printer className="size-3.5" />
                  Imprimir
                </Link>
              </li>
            ))}
          </ul>
          {batchTickets.length > 40 ? (
            <p className="text-xs text-muted-foreground">
              Mostrando 40 de {batchTickets.length}. Usá el CSV para el resto.
            </p>
          ) : null}
        </div>
      ) : null}

      {projectedQrs > 3000 ? (
        <p className="text-sm text-red-500">
          Este lote superaría 3.000 QRs. Bajá la cantidad o las personas por mesa.
        </p>
      ) : null}
    </div>
  )
}

function GroupingAndCombos({
  admitDraft,
  setAdmitDraft,
  saveAdmit,
  isPending,
  comboRows,
  storeItems,
  comboItemId,
  setComboItemId,
  comboQty,
  setComboQty,
  selectedStoreItem,
  storeSelectItems,
  addCombo,
  removeCombo,
}: {
  admitDraft: string
  setAdmitDraft: (value: string) => void
  saveAdmit: () => void
  isPending: boolean
  comboRows: ComboRow[]
  storeItems: StoreItem[]
  comboItemId: string
  setComboItemId: (value: string) => void
  comboQty: string
  setComboQty: (value: string) => void
  selectedStoreItem: StoreItem | null
  storeSelectItems: Array<{ value: string; label: string }>
  addCombo: () => void
  removeCombo: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-semibold text-foreground">
          Agrupación / personas
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Mesa para 4 genera 4 QRs. Cada QR se valida por separado en puerta.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="admit">Personas / QRs</Label>
            <Input
              id="admit"
              inputMode="numeric"
              value={admitDraft}
              onChange={(event) =>
                setAdmitDraft(event.target.value.replace(/\D/g, "").slice(0, 2))
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

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-semibold text-foreground">
          Productos extras / combos
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Al emitir este tipo se generan canjes de gastronomía o merch.
        </p>
        {comboRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {comboRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                <span>
                  {row.quantity}x {row.itemName}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-500"
                  onClick={() => removeCombo(row.id)}
                  aria-label="Quitar"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Sin extras todavía.</p>
        )}
        {storeItems.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-[10rem] space-y-1">
              <Label>Producto</Label>
              <Select
                value={comboItemId}
                onValueChange={(value) => value && setComboItemId(value)}
                items={storeSelectItems}
              >
                <SelectTrigger className="min-h-11 w-full min-w-0 max-w-full overflow-hidden">
                  <SelectValue placeholder="Seleccioná un producto">
                    {selectedStoreItem
                      ? `${selectedStoreItem.name} · ${formatCurrency(selectedStoreItem.price)}`
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {storeItems.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="h-auto items-start whitespace-normal"
                    >
                      <span className="min-w-0 break-words whitespace-normal">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {formatCurrency(item.price)}
                      </span>
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
                onChange={(event) =>
                  setComboQty(event.target.value.replace(/\D/g, "").slice(0, 2))
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
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-200">
            Creá productos en la Tienda de Extras para armar combos.
          </p>
        )}
      </div>
    </div>
  )
}
