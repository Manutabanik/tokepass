import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Lugares",
}

/**
 * La gestión de lugares vive en el paso «El lugar» al crear/editar eventos.
 * Esta ruta queda como puente para bookmarks viejos.
 */
export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ stay?: string }>
}) {
  const params = await searchParams
  if (params.stay !== "1") {
    redirect("/admin/events/create")
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-5 py-16 text-center sm:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400/90">
        Lugares
      </p>
      <h1 className="text-3xl font-black tracking-tight text-foreground">
        Ahora se configuran en el evento
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Para no duplicar pantallas, creá o reutilizá lugares directamente en el
        paso «El lugar» al armar tu evento.
      </p>
      <Link
        href="/admin/events/create"
        className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-400"
      >
        Crear evento
      </Link>
    </div>
  )
}
