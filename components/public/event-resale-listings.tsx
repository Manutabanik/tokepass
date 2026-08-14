"use client"

import { Loader2, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  startResaleCheckoutAction,
  type ResaleListingPublic,
} from "@/app/actions/resale"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"

export function EventResaleListings({
  listings,
  currentUserId,
}: {
  listings: ResaleListingPublic[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (listings.length === 0) return null

  function buy(listingId: string) {
    if (!currentUserId) {
      toast.error("Iniciá sesión para comprar en la reventa oficial.")
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    startTransition(async () => {
      const result = await startResaleCheckoutAction(listingId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      window.location.href = result.data.initPoint
    })
  }

  return (
    <section
      id="resale"
      className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Reventa Oficial de Fans
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entradas verificadas al precio oficial. El QR anterior se invalida al
          confirmar el pago.
        </p>
      </div>

      <ul className="space-y-3">
        {listings.map((listing) => (
          <li
            key={listing.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-foreground">{listing.tierName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatCurrency(listing.price)}
              </p>
            </div>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => buy(listing.id)}
              className="h-11 rounded-full bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-600"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="mr-2 size-4" aria-hidden />
              )}
              Comprar esta entrada
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
