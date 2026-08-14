"use client"

import { Copy, LoaderCircle, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addGuestsToList,
  type GuestListEntryRow,
  type GuestListSummary,
} from "@/app/actions/guest-lists"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const statusCopy: Record<
  GuestListEntryRow["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Enviado",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  claimed: {
    label: "Canjeado",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  checked_in: {
    label: "Ingresó",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
}

function parseBulkLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;|\t]/).map((part) => part.trim())
      return {
        fullName: parts[0] ?? "",
        phone: parts[1] || undefined,
        email: parts[2] || undefined,
      }
    })
    .filter((guest) => guest.fullName.length > 0)
}

export function GuestListDetailPanel({
  list,
  entries,
}: {
  list: GuestListSummary
  entries: GuestListEntryRow[]
}) {
  const router = useRouter()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [singleName, setSingleName] = useState("")
  const [singlePhone, setSinglePhone] = useState("")
  const [isPending, startTransition] = useTransition()

  const claimUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `/lists/claim/${list.id}`
    }
    return `${window.location.origin}/lists/claim/${list.id}`
  }, [list.id])

  async function handleCopyLink() {
    try {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/lists/claim/${list.id}`
          : claimUrl
      await navigator.clipboard.writeText(url)
      toast.success("Link de registro copiado")
    } catch {
      toast.error("No se pudo copiar el link")
    }
  }

  function handleAddSingle(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await addGuestsToList({
        listId: list.id,
        guests: [{ fullName: singleName, phone: singlePhone || undefined }],
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Invitado agregado")
      setSingleName("")
      setSinglePhone("")
      router.refresh()
    })
  }

  function handleBulkSubmit(event: React.FormEvent) {
    event.preventDefault()
    const guests = parseBulkLines(bulkText)
    if (guests.length === 0) {
      toast.error("Pegá al menos un nombre por línea")
      return
    }

    startTransition(async () => {
      const result = await addGuestsToList({ listId: list.id, guests })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.data.added} invitados agregados`)
      setBulkOpen(false)
      setBulkText("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5 rounded-[1.5rem] border border-zinc-200 dark:border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{list.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.usedGuests}/{list.maxGuests} cupos · límite{" "}
            {formatDateTime(list.validUntil)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/15 bg-transparent"
            onClick={handleCopyLink}
          >
            <Copy className="size-4" />
            Copiar link de registro
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/15 bg-transparent"
            onClick={() => setBulkOpen(true)}
          >
            <Upload className="size-4" />
            Carga masiva
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleAddSingle}
        className="grid gap-2 rounded-2xl border border-zinc-200 dark:border-white/8 bg-zinc-50 dark:bg-zinc-950/50 p-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <Input
          value={singleName}
          onChange={(e) => setSingleName(e.target.value)}
          placeholder="Nombre completo"
          required
          className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950"
        />
        <Input
          value={singlePhone}
          onChange={(e) => setSinglePhone(e.target.value)}
          placeholder="WhatsApp (opcional)"
          className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950"
        />
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-white text-zinc-950 hover:bg-zinc-200"
        >
          {isPending ? <LoaderCircle className="animate-spin" /> : "Agregar"}
        </Button>
      </form>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Todavía no hay invitados en esta lista.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-200 dark:border-white/8 hover:bg-transparent">
              <TableHead className="text-muted-foreground">Invitado</TableHead>
              <TableHead className="text-muted-foreground">Contacto</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const status = statusCopy[entry.status]
              return (
                <TableRow
                  key={entry.id}
                  className="border-zinc-200 dark:border-white/8 hover:bg-white/[0.02]"
                >
                  <TableCell className="font-medium text-foreground">
                    {entry.fullName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.phone || entry.email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("rounded-full", status.className)}
                    >
                      {status.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-lg">
          <form onSubmit={handleBulkSubmit}>
            <DialogHeader>
              <DialogTitle>Carga masiva</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Una persona por línea. Formato:{" "}
                <code className="text-foreground">Nombre, teléfono, email</code>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="bulk">Nómina</Label>
              <Textarea
                id="bulk"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                placeholder={"Tomás Pérez, +54911..., tomas@mail.com\nVIP Prensa"}
                className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 font-mono text-xs"
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-violet-600 text-white hover:bg-violet-500"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  "Importar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
