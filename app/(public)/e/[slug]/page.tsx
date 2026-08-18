import { redirect } from "next/navigation"

import { getEventDetails } from "@/app/actions/public-events"
import { extractAffiliateCode, publicEventPathWithRrpp } from "@/lib/rrpp"
import { normalizePreviewKey, withPreviewKey } from "@/lib/preview/sandbox"
import { publicEventPath } from "@/lib/seo/site"

export default async function AffiliateEventShortLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const query = await searchParams
  const paramsBag = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") paramsBag.set(key, value)
  }
  const code = extractAffiliateCode(paramsBag)
  const previewKey = normalizePreviewKey(query.preview_key)
  const event = await getEventDetails(slug).catch(() => null)
  if (event) {
    redirect(
      withPreviewKey(
        publicEventPathWithRrpp({ ...event, referralCode: code }),
        previewKey,
      ),
    )
  }
  redirect(
    withPreviewKey(
      code
        ? `${publicEventPath({ id: slug, slug })}?rrpp=${encodeURIComponent(code)}`
        : publicEventPath({ id: slug, slug }),
      previewKey,
    ),
  )
}
