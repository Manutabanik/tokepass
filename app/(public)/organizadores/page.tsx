import type { Metadata } from "next"

import { OrganizerLanding } from "@/components/public/organizer-landing"

export const metadata: Metadata = {
  title: "Organizadores",
  description:
    "Tu plata segura. Tu puerta más rápida que nunca. Control de recaudación, cero colados con PDFs truchos y venta de mesas desde el celular.",
}

export default function OrganizadoresPage() {
  return <OrganizerLanding />
}
