import { redirect } from "next/navigation"

export default async function EditEventLegacyAliasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/events/${id}/edit`)
}
