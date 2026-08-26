import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export default async function CheckoutFailurePage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id } = await searchParams
  if (order_id) {
    redirect(`/cuenta/compras/${order_id}`)
  }
  redirect("/cuenta/compras")
}
