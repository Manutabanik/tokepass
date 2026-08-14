import type { Metadata } from "next"
import { Handshake } from "lucide-react"

import { listPlatformSponsorsAdmin } from "@/app/actions/platform-sponsors"
import { PlatformSponsorsAdminPanel } from "@/components/superadmin/platform-sponsors-admin-panel"
import { PageHeading } from "@/components/superadmin/page-heading"

export const metadata: Metadata = {
  title: "Partners",
}

export default async function SuperAdminSponsorsPage() {
  const sponsors = await listPlatformSponsorsAdmin()

  return (
    <>
      <PageHeading
        eyebrow="Marca"
        title="Partners globales"
        description="Logos de empresas que confían en Tokepass. Se muestran en la landing pública, en escala de grises hasta el hover."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-400">
            <Handshake className="size-3.5" aria-hidden />
            {sponsors.length} en total
          </span>
        }
      />
      <PlatformSponsorsAdminPanel initialSponsors={sponsors} />
    </>
  )
}
