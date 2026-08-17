import { redirect } from "next/navigation"

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
