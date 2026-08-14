import { Building2 } from "lucide-react"
import type { Metadata } from "next"

import { listApprovedOrganizers } from "@/app/actions/organizer-kyb"
import { OrganizersDirectory } from "@/components/superadmin/organizers-directory"
import { PageHeading } from "@/components/superadmin/page-heading"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Productoras",
}

export default async function SuperAdminOrganizersPage() {
  const organizers = await listApprovedOrganizers()

  return (
    <>
      <PageHeading
        eyebrow="B2B"
        title="Productoras aprobadas"
        description="Organizadores con KYB aprobado. Desde acá entrás al gobierno financiero de cada una."
      />

      <Card className="border border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-5 py-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
            <Building2 className="size-4 text-violet-300" />
            {organizers.length}{" "}
            {organizers.length === 1 ? "productora" : "productoras"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <OrganizersDirectory organizers={organizers} />
        </CardContent>
      </Card>
    </>
  )
}
