import type { Metadata } from "next"
import { Handshake } from "lucide-react"

import { listPlatformSponsorsAdmin } from "@/app/actions/platform-sponsors"
import { PlatformSponsorsAdminPanel } from "@/components/superadmin/platform-sponsors-admin-panel"
import { PageHeading } from "@/components/superadmin/page-heading"

export const metadata: Metadata = {
  title: "Sponsors y Marcas",
}

export default async function SuperAdminSponsorsPage() {
  const sponsors = await listPlatformSponsorsAdmin()

  return (
    <>
      <PageHeading
        eyebrow="Marca"
        title="Sponsors y Marcas"
        description="Logos de productoras o marcas que confían en TokePass. Se muestran en el pie de la página pública."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Handshake className="size-3.5" aria-hidden />
            {sponsors.length} en total
          </span>
        }
      />
      <PlatformSponsorsAdminPanel initialSponsors={sponsors} />
    </>
  )
}
