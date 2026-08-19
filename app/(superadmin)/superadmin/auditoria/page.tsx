import { ClipboardCheck } from "lucide-react"
import type { Metadata } from "next"

import { listPendingAuditEvents } from "@/app/actions/event-audit"
import { EventAuditWorkbench } from "@/components/superadmin/event-audit-workbench"
import { PageHeading } from "@/components/superadmin/page-heading"

export const metadata: Metadata = {
  title: "Eventos Pendientes",
}

export default async function SuperAdminAuditPage() {
  const pending = await listPendingAuditEvents()

  return (
    <>
      <PageHeading
        eyebrow="Auditoría"
        title="Eventos Pendientes"
        description="Revisá fecha, locación, flyer y entradas antes de habilitar la venta al público."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-400/20 dark:text-amber-200">
            <ClipboardCheck className="size-3.5" />
            {pending.length} en revisión
          </span>
        }
      />
      <EventAuditWorkbench events={pending} />
    </>
  )
}
