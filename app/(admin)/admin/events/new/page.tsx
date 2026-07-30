import { redirect } from "next/navigation"

/** Alias pedido por producto: /admin/events/new → create */
export default function AdminEventsNewAliasPage() {
  redirect("/admin/events/create")
}
