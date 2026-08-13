import { ClipboardList } from "lucide-react"
import type { Metadata } from "next"

import { listPendingOrganizerApplications } from "@/app/actions/organizer-kyb"
import { OrganizerApplicationsPanel } from "@/components/superadmin/organizer-applications-panel"
import { PageHeading } from "@/components/superadmin/page-heading"

export const metadata: Metadata = {
  title: "Solicitudes",
}

export default async function SuperAdminApplicationsPage() {
  const applications = await listPendingOrganizerApplications()

  return (
    <>
      <PageHeading
        eyebrow="KYB"
        title="Solicitudes de productoras"
        description="Postulaciones pendientes. Revisá CUIT, redes y datos bancarios antes de aprobar."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/20">
            <ClipboardList className="size-3.5" />
            {applications.length} pendientes
          </span>
        }
      />
      <OrganizerApplicationsPanel applications={applications} />
    </>
  )
}
