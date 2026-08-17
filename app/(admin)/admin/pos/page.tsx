import { redirect } from "next/navigation"

export default async function AdminPosRedirectPage() {
  redirect("/dashboard/pos")
}
