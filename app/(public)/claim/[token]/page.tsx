import type { Metadata } from "next"

import { ClaimTicketScreen } from "@/app/(public)/claim/claim-ticket-screen"

export const metadata: Metadata = {
  title: "Reclamar entrada",
  description: "Aceptá una entrada transferida a tu cuenta TokePass.",
}

export default async function ClaimTicketTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ClaimTicketScreen token={decodeURIComponent(token)} />
}
