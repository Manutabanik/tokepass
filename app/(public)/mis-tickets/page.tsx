import { redirect } from "next/navigation"

/** Alias legacy → portal de cuenta */
export default function MisTicketsAliasPage() {
  redirect("/cuenta/entradas")
}
