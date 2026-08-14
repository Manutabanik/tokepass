import { redirect } from "next/navigation"

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
