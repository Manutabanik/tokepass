import type { Metadata } from "next"
import { CircleHelp } from "lucide-react"
import { redirect } from "next/navigation"

import { listSupportFaqs } from "@/app/actions/support-faqs"
import { SupportFaqsManager } from "@/components/admin/support-faqs-manager"

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
}

export default async function AdminSupportFaqsPage() {
  let faqs: Awaited<ReturnType<typeof listSupportFaqs>> = []

  try {
    faqs = await listSupportFaqs()
  } catch {
    redirect("/login-organizador?next=/admin/support-faqs")
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-violet-400">
          <CircleHelp className="size-4" aria-hidden />
          Soporte
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-foreground">
          Preguntas frecuentes
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Administra las respuestas que van a ver organizadores y compradores
          en el modulo de soporte. Desactiva una pregunta para ocultarla sin
          borrarla.
        </p>
      </div>
      <SupportFaqsManager initialFaqs={faqs} />
    </div>
  )
}
