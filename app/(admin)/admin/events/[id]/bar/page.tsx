import { redirect } from "next/navigation"

/** Legacy alias → Tienda de Extras */
export default async function EventBarAliasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/events/${id}/store`)
}
