import { redirect } from "next/navigation"

/** Alias legacy → portal de cuenta */
export default function MyTicketsAliasPage() {
  redirect("/cuenta/entradas")
}
