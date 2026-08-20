"use client"

import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Gift,
  LoaderCircle,
  Printer,
  Trash2,
  Upload,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import type { ComplimentaryTierOption } from "@/app/actions/complimentary"
import {
  createPrintBatch,
  type PrintBatchGuest,
  type TicketTemplateRow,
} from "@/app/actions/print-studio-core"
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
  ACCREDITATION_ROLES,
  formatPrintSerialLabel,
  parseAccreditationCsv,
  PRINT_BATCH_MAX_TICKETS,
  printTemplateMediumLabel,
  type PrintBatchChannel,
} from "@/lib/print-studio"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: 1, label: "Canal" },
  { id: 2, label: "Tarifa y plantilla" },
  { id: 3, label: "Serie y cantidad" },
  { id: 4, label: "Personal" },
] as const

type GuestDraft = {
  nombre: string
  dni: string
  staffRole: string
  staffCompany: string
}

const EMPTY_GUEST: GuestDraft = {
  nombre: "",
  dni: "",
  staffRole: "Técnica",
  staffCompany: "",
}

export function NewBatchModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  tiers,
  templates,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
  tiers: ComplimentaryTierOption[]
  templates: TicketTemplateRow[]
  onCreated: () => void
}) {
  const [step, setStep] = useState(1)
  const [channel, setChannel] = useState<PrintBatchChannel>("batch_print")
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "")
  const [templateId, setTemplateId] = useState<string>("none")
  const [name, setName] = useState("")
  const [seriesCode, setSeriesCode] = useState("A")
  const [seqStart, setSeqStart] = useState("1")
  const [count, setCount] = useState("100")
  const [defaultStaffRole, setDefaultStaffRole] = useState("Técnica")
  const [defaultStaffCompany, setDefaultStaffCompany] = useState("")
  const [guests, setGuests] = useState<GuestDraft[]>([])
  const [pending, startTransition] = useTransition()

  const maxStep = channel === "accreditation" ? 4 : 3
  const selectedTier = tiers.find((tier) => tier.id === tierId) ?? null
  const startNum = Math.max(1, Math.floor(Number(seqStart) || 1))
  const countNum = Math.max(0, Math.floor(Number(count) || 0))
  const guestRows = guests.filter((guest) => guest.nombre.trim())
  const units = channel === "accreditation" && guestRows.length > 0
    ? guestRows.length
    : countNum
  const lastFolio = units > 0 ? formatPrintSerialLabel(seriesCode || "A", startNum + units - 1) : "—"

  const channelHint = useMemo(() => {
    if (channel === "accreditation") return "Staff, prensa y técnica. QR estático TPS."
    if (channel === "complimentary") return "Cortesías impresas. Consumen el tope de free del evento."
    return "Entradas físicas para boletería o venta offline."
  }, [channel])

  function resetForm() {
    setStep(1)
    setChannel("batch_print")
    setTierId(tiers[0]?.id ?? "")
    setTemplateId("none")
    setName("")
    setSeriesCode("A")
    setSeqStart("1")
    setCount("100")
    setDefaultStaffRole("Técnica")
    setDefaultStaffCompany("")
    setGuests([])
  }

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) resetForm()
  }

  function nextStep() {
    if (step === 1 && !channel) return
    if (step === 2 && !tierId) {
      toast.error("Elegí una tarifa / sector.")
      return
    }
    if (step === 3) {
      if (!seriesCode.trim()) {
        toast.error("Definí el código de serie.")
        return
      }
      if (units < 1) {
        toast.error("Indicá cuántas entradas generar.")
        return
      }
      if (units > PRINT_BATCH_MAX_TICKETS) {
        toast.error(`Máximo ${PRINT_BATCH_MAX_TICKETS} entradas por lote.`)
        return
      }
      if (channel !== "accreditation") {
        confirmIssue()
        return
      }
    }
    setStep((prev) => Math.min(maxStep, prev + 1))
  }

  function confirmIssue() {
    const batchName =
      name.trim() ||
      (channel === "accreditation"
        ? `Acreditaciones ${seriesCode}`
        : channel === "complimentary"
          ? `Cortesías ${seriesCode}`
          : `Imprenta ${seriesCode}`)

    const payloadGuests: PrintBatchGuest[] = guestRows.map((guest) => ({
      nombre: guest.nombre,
      dni: guest.dni,
      staffRole: guest.staffRole || defaultStaffRole,
      staffCompany: guest.staffCompany || defaultStaffCompany,
    }))

    startTransition(async () => {
      const result = await createPrintBatch({
        eventId,
        tierId,
        templateId: templateId === "none" ? null : templateId,
        name: batchName,
        mode: channel === "accreditation"
          ? payloadGuests.length > 0
            ? "accreditation"
            : "unnamed"
          : "unnamed",
        channel,
        seriesCode,
        seqStart: startNum,
        count: payloadGuests.length > 0 ? 0 : countNum,
        guests: payloadGuests,
        defaultStaffRole: channel === "accreditation" ? defaultStaffRole : null,
        defaultStaffCompany: channel === "accreditation" ? defaultStaffCompany : null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Lote ${result.seriesCode} emitido: ${result.issuedCount} tickets (${formatPrintSerialLabel(result.seriesCode, result.seqStart)} a ${formatPrintSerialLabel(result.seriesCode, result.seqEnd)}).`,
      )
      onCreated()
      close(false)
    })
  }

  function handleCsv(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseAccreditationCsv(String(reader.result ?? ""))
      if (rows.length === 0) {
        toast.error("El CSV no tiene filas válidas. Usá nombre, dni, rol, empresa.")
        return
      }
      setGuests(
        rows.map((row) => ({
          nombre: [row.nombre, row.apellido].filter(Boolean).join(" ").trim(),
          dni: row.dni ?? "",
          staffRole: row.staffRole || defaultStaffRole,
          staffCompany: row.staffCompany ?? "",
        })),
      )
      toast.success(`${rows.length} personas cargadas.`)
    }
    reader.readAsText(file, "UTF-8")
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo lote</DialogTitle>
          <DialogDescription>
            {eventTitle}. Paso {step} de {maxStep}. {channelHint}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex gap-2 text-xs font-medium">
          {STEPS.filter((item) => item.id <= maxStep).map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex-1 rounded-full px-2 py-1 text-center",
                item.id === step
                  ? "bg-emerald-600 text-white"
                  : item.id < step
                    ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {item.id}. {item.label}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <ChannelCard
              active={channel === "batch_print"}
              icon={Printer}
              title="Imprenta"
              description="Lote pagado o de boletería física."
              onClick={() => setChannel("batch_print")}
            />
            <ChannelCard
              active={channel === "complimentary"}
              icon={Gift}
              title="Cortesías impresas"
              description="Free pass con folio y QR estático."
              onClick={() => setChannel("complimentary")}
            />
            <ChannelCard
              active={channel === "accreditation"}
              icon={BadgeCheck}
              title="Acreditación"
              description="Staff, prensa, técnica o VIP."
              onClick={() => setChannel("accreditation")}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sector / tarifa</Label>
              <Select value={tierId} onValueChange={(value) => value && setTierId(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí una tarifa" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} · {tier.available} disponibles
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTier ? (
                <p className="text-xs text-muted-foreground">
                  Cupo {selectedTier.sold}/{selectedTier.capacity}. El lote consume
                  inventario de esta tarifa.
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  Este evento no tiene tarifas. Creá una antes de emitir.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Plantilla de diseño</Label>
              <Select
                value={templateId}
                onValueChange={(value) => value && setTemplateId(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plantilla (solo emisión)</SelectItem>
                  {templates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.pageWidthMm}x{item.pageHeightMm} mm ·{" "}
                      {printTemplateMediumLabel(item.medium)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Nombre del lote</Label>
              <Input
                id="batch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  channel === "accreditation" ? "Acreditaciones STAFF" : "Lote imprenta A"
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="series">Serie</Label>
                <Input
                  id="series"
                  value={seriesCode}
                  onChange={(event) => setSeriesCode(event.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seq-start">Número inicial</Label>
                <Input
                  id="seq-start"
                  type="number"
                  min={1}
                  value={seqStart}
                  onChange={(event) => setSeqStart(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">Cantidad</Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={PRINT_BATCH_MAX_TICKETS}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Folios {formatPrintSerialLabel(seriesCode || "A", startNum)} a {lastFolio}.
              Tope {PRINT_BATCH_MAX_TICKETS} tickets por transacción.
              {channel === "accreditation"
                ? " Si cargás personal en el paso siguiente, esa lista pisa la cantidad."
                : ""}
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rol por defecto</Label>
                <Select
                  value={defaultStaffRole}
                  onValueChange={(value) => value && setDefaultStaffRole(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCREDITATION_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-company">Empresa / medio por defecto</Label>
                <Input
                  id="staff-company"
                  value={defaultStaffCompany}
                  onChange={(event) => setDefaultStaffCompany(event.target.value)}
                  placeholder="Sonido XYZ"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGuests((prev) => [...prev, { ...EMPTY_GUEST }])}
              >
                Agregar persona
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium">
                <Upload className="size-4" aria-hidden="true" />
                Subir CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => handleCsv(event.target.files?.[0] ?? null)}
                />
              </label>
              <span className="text-xs text-muted-foreground">
                Columnas: nombre, dni, rol, empresa
              </span>
            </div>

            {guests.length > 0 ? (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {guests.map((guest, index) => (
                  <div key={`${guest.nombre}-${index}`} className="grid grid-cols-[1fr_6rem_7rem_1fr_auto] gap-1.5">
                    <Input
                      value={guest.nombre}
                      placeholder="Nombre"
                      onChange={(event) =>
                        setGuests((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, nombre: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      value={guest.dni}
                      placeholder="DNI"
                      onChange={(event) =>
                        setGuests((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, dni: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Select
                      value={guest.staffRole}
                      onValueChange={(value) =>
                        value &&
                        setGuests((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, staffRole: value } : row,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCREDITATION_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={guest.staffCompany}
                      placeholder="Empresa"
                      onChange={(event) =>
                        setGuests((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, staffCompany: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setGuests((prev) => prev.filter((_, i) => i !== index))
                      }
                      aria-label="Quitar persona"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin lista nominada se emiten {countNum || 0} acreditaciones
                innombradas con el rol {defaultStaffRole}.
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => (step === 1 ? close(false) : setStep((prev) => prev - 1))}
            disabled={pending}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {step === 1 ? "Cancelar" : "Atrás"}
          </Button>
          <Button
            type="button"
            onClick={step === maxStep ? confirmIssue : nextStep}
            disabled={pending || (step === 2 && !tierId)}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
            {step === maxStep || (step === 3 && channel !== "accreditation")
              ? "Emitir lote"
              : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChannelCard({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: typeof Printer
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-border bg-muted/30 hover:border-emerald-500/40",
      )}
    >
      <Icon className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
      <p className="mt-3 font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  )
}
