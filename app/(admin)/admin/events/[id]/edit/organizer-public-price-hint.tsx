"use client"

import { useFormContext, useWatch } from "react-hook-form"

import { useEventEditorFee } from "./event-editor-fee-context"
import {
  organizerPublicPriceFromBase,
  organizerPublicPriceHintParts,
} from "@/lib/pricing/organizer-public-price-preview"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function OrganizerPublicPriceHint({ price }: { price: unknown }) {
  const fee = useEventEditorFee()
  const { control } = useFormContext<EventDraftV2>()
  const absorbFees = Boolean(
    useWatch({ control, name: "settings.absorbFees" }),
  )
  const preview = organizerPublicPriceFromBase({
    basePrice: price,
    absorbFees,
    platformFeePercentage: fee.platformFeePercentage,
    platformFixedFee: fee.platformFixedFee,
    isSponsoredByTokePass: fee.isSponsoredByTokePass,
  })
  if (!preview) return null
  const parts = organizerPublicPriceHintParts(preview)
  return (
    <p className="text-xs text-muted-foreground">
      {parts.prefix}{" "}
      <strong className="font-semibold text-foreground">
        {parts.publicPrice}
      </strong>{" "}
      {parts.suffix}
    </p>
  )
}
