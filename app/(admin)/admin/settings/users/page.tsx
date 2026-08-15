import { EventStaffManager } from "@/components/admin/event-staff-manager"
import { PosUsersPinSettings } from "@/components/admin/pos-users-pin-settings"
import {
  listStaffAssignmentsForOrganizer,
} from "@/app/actions/event-staff"
import { getOrganizerEvents } from "@/app/actions/events"
import { getPosEvents } from "@/app/actions/pos"

export default async function AdminSettingsUsersPage() {
  const [events, assignments, posEvents] = await Promise.all([
    getOrganizerEvents(),
    listStaffAssignmentsForOrganizer(),
    getPosEvents().catch(() => []),
  ])

  return (
    <div className="space-y-10">
      <PosUsersPinSettings events={posEvents} assignments={assignments} />
      <EventStaffManager events={events} assignments={assignments} />
    </div>
  )
}
