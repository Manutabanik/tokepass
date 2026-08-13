import type { Metadata } from "next"
import { Tags } from "lucide-react"

import { listEventCategoriesAdmin } from "@/app/actions/categories"
import { CategoriesAdminPanel } from "@/components/superadmin/categories-admin-panel"
import { PageHeading } from "@/components/superadmin/page-heading"

export const metadata: Metadata = {
  title: "Categorías",
}

export default async function SuperAdminCategoriesPage() {
  const categories = await listEventCategoriesAdmin()

  return (
    <>
      <PageHeading
        eyebrow="Taxonomía"
        title="Categorías de eventos"
        description="Catálogo cerrado que usan el buscador B2C y el wizard de organizadores. Solo vos podés crear, editar o desactivar."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
            <Tags className="size-3.5" aria-hidden />
            {categories.length} en total
          </span>
        }
      />
      <CategoriesAdminPanel initialCategories={categories} />
    </>
  )
}
