import { listOrganizerVenues } from "@/app/actions/venues"
import { OrganizerVenuesManager } from "@/components/admin/organizer-venues-manager"

export default async function AdminVenuesPage() {
  const venues = await listOrganizerVenues()
  return <OrganizerVenuesManager initialVenues={venues} />
}
