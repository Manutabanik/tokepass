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
        eyebrow="Clasificación"
        title="Categorías de eventos"
        description="Armá el menú de categorías que ven el buscador público y el organizador al crear un evento. Solo vos podés crear, editar o desactivar."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-400">
            <Tags className="size-3.5" aria-hidden />
            {categories.length} en total
          </span>
        }
      />
      <CategoriesAdminPanel initialCategories={categories} />
    </>
  )
}
