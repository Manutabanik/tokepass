import { redirect } from "next/navigation"

function buscarPath(params: {
  q?: string
  location?: string
  category?: string
  artist?: string
  when?: string
}) {
  const qs = new URLSearchParams()
  if (params.q?.trim()) qs.set("q", params.q.trim())
  if (params.location?.trim()) qs.set("location", params.location.trim())
  if (params.category?.trim()) qs.set("category", params.category.trim())
  if (params.artist?.trim()) qs.set("artist", params.artist.trim())
  if (params.when?.trim()) qs.set("when", params.when.trim())
  const encoded = qs.toString()
  return encoded ? `/buscar?${encoded}` : "/buscar"
}

export default async function EventsIndexRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    location?: string
    category?: string
    artist?: string
    when?: string
  }>
}) {
  redirect(buscarPath(await searchParams))
}
