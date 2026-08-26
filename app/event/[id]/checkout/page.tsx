import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * Handoff del tunel de compra. El edge ya valido checkout_access_token.
 * No carga mapa de asientos: redirige a la ficha publica.
 */
export default async function EventCheckoutHandoffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const eventKey = decodeURIComponent(id).trim()
  redirect(`/eventos/${eventKey}`)
}
