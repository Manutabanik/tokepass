import { redirect } from "next/navigation"

import { getDoorGuestScannerContext } from "@/app/actions/door-access"
import { DoorPinLogin } from "@/components/door/door-pin-login"

export default async function DoorPinPage() {
  const session = await getDoorGuestScannerContext()
  if (session) redirect("/puerta/escanear")
  return <DoorPinLogin />
}
