import { redirect } from "next/navigation"

import { exploreCatalogPath } from "@/lib/discovery-filters"

export default async function EventosIndexRedirectPage({
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
  redirect(exploreCatalogPath(await searchParams))
}
