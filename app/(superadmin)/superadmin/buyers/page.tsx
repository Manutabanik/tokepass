import { Users } from "lucide-react"
import type { Metadata } from "next"

import { listBuyers } from "@/app/actions/organizer-kyb"
import { BuyersPanel } from "@/components/superadmin/buyers-panel"
import { PageHeading } from "@/components/superadmin/page-heading"
import { Input } from "@/components/ui/input"

export const metadata: Metadata = {
  title: "Compradores",
}

export default async function SuperAdminBuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const buyers = await listBuyers(q)

  return (
    <>
      <PageHeading
        eyebrow="B2C"
        title="Compradores"
        description="Perfiles base de la plataforma. El DNI y el teléfono se guardan al comprar (progressive profiling)."
        actions={
          <form className="relative w-full">
            <Input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Buscar nombre, email, DNI…"
              aria-label="Buscar compradores"
              className="min-h-12 w-full border-border bg-background text-base"
            />
          </form>
        }
      />

      <div className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-3.5" />
        {buyers.length} compradores en esta vista
      </div>

      <BuyersPanel buyers={buyers} />
    </>
  )
}
