import { redirect } from "next/navigation"

import { getDoorGuestScannerContext } from "@/app/actions/door-access"
import { DoorScannerClient } from "@/components/admin/door-scanner-entry"

export default async function DoorGuestScannerPage() {
  const session = await getDoorGuestScannerContext()
  if (!session) redirect("/puerta")
  return <DoorScannerClient guestEvent={session.event} />
}
