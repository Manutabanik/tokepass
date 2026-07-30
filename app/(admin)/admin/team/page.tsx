import { EventStaffManager } from "@/components/admin/event-staff-manager"
import {
  listStaffAssignmentsForOrganizer,
} from "@/app/actions/event-staff"
import { getOrganizerEvents } from "@/app/actions/events"

export default async function AdminTeamPage() {
  const [events, assignments] = await Promise.all([
    getOrganizerEvents(),
    listStaffAssignmentsForOrganizer(),
  ])

  return <EventStaffManager events={events} assignments={assignments} />
}
