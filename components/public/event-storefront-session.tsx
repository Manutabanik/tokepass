"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { canUserSandboxCheckout } from "@/app/actions/checkout"
import type { EventDetails } from "@/app/actions/public-events"
import type { ResaleListingPublic } from "@/app/actions/resale"
import { EventStorefront } from "@/components/public/event-storefront"
import { extractAffiliateCode } from "@/lib/rrpp"
import { createClient } from "@/lib/supabase/client"

type BuyerPrefill = {
  buyerName?: string
  buyerDni?: string
  buyerEmail?: string
  buyerPhone?: string
}

/**
 * Auth, profile, and sandbox eligibility load after the static event shell.
 * Keeps `/eventos/[slug]` off the cookies() path so ISR can hold.
 */
export function EventStorefrontSession({
  event,
  resaleListings = [],
  showBackLink = true,
}: {
  event: EventDetails
  resaleListings?: ResaleListingPublic[]
  showBackLink?: boolean
}) {
  const searchParams = useSearchParams()
  const referralCode = extractAffiliateCode(searchParams)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [initialBuyer, setInitialBuyer] = useState<BuyerPrefill | null>(null)
  const [sandboxEligible, setSandboxEligible] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setCurrentUserId(null)
        setInitialBuyer(null)
        setSandboxEligible(false)
        return
      }

      setCurrentUserId(user.id)
      const [{ data: profile }, sandbox] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, dni, email, phone")
          .eq("id", user.id)
          .maybeSingle(),
        canUserSandboxCheckout(event.id),
      ])
      if (cancelled) return
      setInitialBuyer({
        buyerName: profile?.full_name ?? "",
        buyerDni: profile?.dni ?? "",
        buyerEmail: profile?.email ?? user.email ?? "",
        buyerPhone: profile?.phone ?? "",
      })
      setSandboxEligible(sandbox)
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [event.id])

  return (
    <EventStorefront
      event={event}
      currentUserId={currentUserId}
      referralCode={referralCode}
      initialBuyer={initialBuyer}
      resaleListings={resaleListings}
      showBackLink={showBackLink}
      sandboxEligible={sandboxEligible}
    />
  )
}
