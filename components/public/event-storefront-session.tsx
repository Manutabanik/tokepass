"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { canUserSandboxCheckout } from "@/app/actions/checkout"
import { recordEventStorefrontView } from "@/app/actions/event-storefront-views"
import type { EventDetails } from "@/app/actions/public-events"
import type { ResaleListingPublic } from "@/app/actions/resale"
import { EventStorefront } from "@/components/public/event-storefront"
import { normalizePreviewKey } from "@/lib/preview/sandbox"
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
  previewKey: previewKeyProp = null,
}: {
  event: EventDetails
  resaleListings?: ResaleListingPublic[]
  showBackLink?: boolean
  previewKey?: string | null
}) {
  const searchParams = useSearchParams()
  const referralCode = extractAffiliateCode(searchParams)
  const previewKey =
    previewKeyProp ?? normalizePreviewKey(searchParams.get("preview_key"))
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [initialBuyer, setInitialBuyer] = useState<BuyerPrefill | null>(null)
  const [sandboxEligible, setSandboxEligible] = useState(
    Boolean(event.isDraftPreview),
  )

  useEffect(() => {
    if (event.isDraftPreview) return
    const key = `tp-storefront-view:${event.id}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, "1")
    } catch {
      // sessionStorage puede no estar disponible.
    }
    void recordEventStorefrontView(event.id)
  }, [event.id, event.isDraftPreview])

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
        setSandboxEligible(Boolean(event.isDraftPreview))
        return
      }

      setCurrentUserId(user.id)
      const [{ data: profile }, sandbox] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, dni, email, phone")
          .eq("id", user.id)
          .maybeSingle(),
        event.isDraftPreview
          ? Promise.resolve(true)
          : canUserSandboxCheckout(event.id, previewKey).catch(() => false),
      ])
      if (cancelled) return
      setInitialBuyer({
        buyerName: profile?.full_name ?? "",
        buyerDni: profile?.dni ?? "",
        buyerEmail: profile?.email ?? user.email ?? "",
        buyerPhone: profile?.phone ?? "",
      })
      setSandboxEligible(Boolean(event.isDraftPreview) || sandbox)
    }

    void loadSession().catch(() => {
      if (cancelled) return
      setSandboxEligible(Boolean(event.isDraftPreview))
    })
    return () => {
      cancelled = true
    }
  }, [event.id, event.isDraftPreview, previewKey])

  return (
    <EventStorefront
      event={event}
      currentUserId={currentUserId}
      referralCode={referralCode}
      initialBuyer={initialBuyer}
      resaleListings={resaleListings}
      showBackLink={showBackLink}
      sandboxEligible={sandboxEligible}
      previewKey={previewKey}
    />
  )
}
