import { CircleHelp } from "lucide-react"
import type { Metadata } from "next"

import { listSupportFaqs } from "@/app/actions/support-faqs"
import { PageHeading } from "@/components/superadmin/page-heading"
import { SupportFaqsManager } from "@/components/superadmin/support-faqs-manager"

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
}

export default async function SuperAdminFaqPage() {
  const faqs = await listSupportFaqs()

  return (
    <>
      <PageHeading
        eyebrow="Ayuda"
        title="Preguntas frecuentes"
        description="Creá y publicá las respuestas que ven los productores desde Ayuda y FAQ. Los borradores no aparecen en el panel."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <CircleHelp className="size-3.5" aria-hidden />
            {faqs.length} en total
          </span>
        }
      />
      <SupportFaqsManager initialFaqs={faqs} />
    </>
  )
}
