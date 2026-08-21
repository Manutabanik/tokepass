"use client"

import { FileText, LayoutTemplate, Plus, Printer } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import type { ComplimentaryTierOption } from "@/app/actions/complimentary"
import type {
  TicketPrintBatchRow,
  TicketTemplateRow,
} from "@/app/actions/print-studio-core"
import { NewBatchModal } from "@/components/admin/print-studio/NewBatchModal"
import { TemplateDesigner } from "@/components/admin/print-studio/TemplateDesigner"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatPrintSerialRange,
  printBatchChannelLabel,
  printBatchStatusLabel,
  printTemplateMediumLabel,
} from "@/lib/print-studio"
import { formatEventDate } from "@/lib/format"

export function PrintStudioWorkspace({
  eventId,
  eventTitle,
  flyerUrl,
  tiers,
  templates,
  batches,
}: {
  eventId: string
  eventTitle: string
  flyerUrl?: string | null
  tiers: ComplimentaryTierOption[]
  templates: TicketTemplateRow[]
  batches: TicketPrintBatchRow[]
}) {
  const router = useRouter()
  const [batchOpen, setBatchOpen] = useState(false)
  const [editing, setEditing] = useState<TicketTemplateRow | "new" | null>(null)

  if (editing) {
    return (
      <TemplateDesigner
        eventId={eventId}
        eventTitle={eventTitle}
        flyerUrl={flyerUrl}
        template={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            Print Studio
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
            <Printer className="size-8" aria-hidden="true" />
            Lotes e impresión
          </h1>
          <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">
            {eventTitle}. Plantillas en milímetros reales y emisión de lotes
            físicos o acreditaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setEditing("new")}>
            <LayoutTemplate className="size-4" aria-hidden="true" />
            Nueva plantilla
          </Button>
          <Button type="button" onClick={() => setBatchOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo lote
          </Button>
        </div>
      </div>

      <Tabs defaultValue="batches" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-2">
          <TabsTrigger value="batches">Lotes de imprenta y acreditaciones</TabsTrigger>
          <TabsTrigger value="templates">Mis plantillas</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="pt-4">
          {batches.length === 0 ? (
            <EmptyState
              title="Todavía no hay lotes"
              description="Emití un lote de imprenta, cortesías impresas o acreditaciones para generar folios y QRs estáticos."
              actionLabel="Nuevo lote"
              onAction={() => setBatchOpen(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Serie</TableHead>
                    <TableHead>Rango</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="min-w-0 max-w-[150px] font-medium sm:max-w-[250px]">
                        <span className="block truncate">{batch.name}</span>
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          label={printBatchStatusLabel(batch.status, batch.issuedCount)}
                        />
                      </TableCell>
                      <TableCell>{printBatchChannelLabel(batch.channel)}</TableCell>
                      <TableCell className="font-mono">{batch.seriesCode}</TableCell>
                      <TableCell className="font-mono">
                        {formatPrintSerialRange(batch.seqStart, batch.seqEnd)}
                      </TableCell>
                      <TableCell>{batch.issuedCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatEventDate(batch.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <a
                            href={`/admin/events/${eventId}/tickets`}
                            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                          >
                            Ver tickets
                          </a>
                          {batch.artifactCsvUrl ? (
                            <a
                              href={batch.artifactCsvUrl}
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <FileText className="size-3.5" aria-hidden="true" />
                              CSV
                            </a>
                          ) : null}
                          {batch.artifactPdfUrl ? (
                            <a
                              href={batch.artifactPdfUrl}
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            >
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="pt-4">
          {templates.length === 0 ? (
            <EmptyState
              title="Sin plantillas"
              description="Diseñá un cartón, badge o ticket térmico en milímetros reales."
              actionLabel="Nueva plantilla"
              onAction={() => setEditing("new")}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5"
                >
                  <div
                    className="mb-4 overflow-hidden rounded-lg border border-border bg-muted"
                    style={{
                      aspectRatio: `${item.pageWidthMm} / ${item.pageHeightMm}`,
                      maxHeight: 140,
                    }}
                  >
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      {item.pageWidthMm} x {item.pageHeightMm} mm
                    </div>
                  </div>
                  <h3 className="min-w-0 truncate font-bold text-foreground">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {printTemplateMediumLabel(item.medium)} · {item.pageWidthMm} x{" "}
                    {item.pageHeightMm} mm
                  </p>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(item)}
                    >
                      Editar plantilla
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewBatchModal
        open={batchOpen}
        onOpenChange={setBatchOpen}
        eventId={eventId}
        eventTitle={eventTitle}
        tiers={tiers}
        templates={templates}
        onCreated={() => router.refresh()}
      />
    </div>
  )
}

function StatusPill({ label }: { label: string }) {
  const tone =
    label === "Emitido"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : label === "Borrador"
        ? "bg-amber-500/15 text-amber-900 dark:text-amber-100"
        : label === "Anulado"
          ? "bg-rose-500/15 text-rose-800 dark:text-rose-200"
          : "bg-sky-500/15 text-sky-900 dark:text-sky-100"
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  )
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <p className="font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button type="button" className="mt-4" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}
