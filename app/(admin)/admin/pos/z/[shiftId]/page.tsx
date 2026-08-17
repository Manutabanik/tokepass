import { redirect } from "next/navigation"

export default async function AdminPosZRedirectPage({
  params,
}: {
  params: Promise<{ shiftId: string }>
}) {
  const { shiftId } = await params
  redirect(`/dashboard/pos/z/${shiftId}`)
}
