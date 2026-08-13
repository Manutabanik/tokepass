import { redirect } from "next/navigation"

/** Alias legacy → historial de compras */
export default function MyOrdersAliasPage() {
  redirect("/cuenta/compras")
}
