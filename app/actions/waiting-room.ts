"use server"

import { releaseWaitingRoomPassFromCookies } from "@/lib/waiting-room/release"

export async function releaseWaitingRoomPass(): Promise<{ success: true }> {
  await releaseWaitingRoomPassFromCookies()
  return { success: true }
}
