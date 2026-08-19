import { redirect } from "next/navigation"

import { getDoorGuestScannerContext } from "@/app/actions/door-access"
import { DoorScanner } from "@/components/admin/door-scanner"

export default async function DoorGuestScannerPage() {
  const session = await getDoorGuestScannerContext()
  if (!session) redirect("/puerta")
  return <DoorScanner guestEvent={session.event} />
}
