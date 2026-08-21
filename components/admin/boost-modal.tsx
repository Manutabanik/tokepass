"use client"

import { EventBoosterModal } from "@/components/admin/booster/event-booster-modal"

type BoostModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
}

export function BoostModal(props: BoostModalProps) {
  return <EventBoosterModal {...props} />
}
