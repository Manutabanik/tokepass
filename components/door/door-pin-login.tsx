"use client"

import Image from "next/image"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, LoaderCircle } from "lucide-react"

import { redeemDoorAccessPin } from "@/app/actions/door-access"
import { fetchEventTicketManifest } from "@/app/actions/scanner"
import { BRAND_MARK_SRC } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { requestDoorAssetCache } from "@/lib/pwa/door-cache"
import { prefetchDoorManifest } from "@/lib/scanner/prefetch-manifest"

export function DoorPinLogin() {
  const router = useRouter()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ready = pin.length === 6 && !pending

  useEffect(() => {
    requestDoorAssetCache()
  }, [])

  function submit() {
    if (!ready) return
    setError(null)
    startTransition(async () => {
      const result = await redeemDoorAccessPin(pin)
      if (!result.success) {
        setError(result.error)
        return
      }
      requestDoorAssetCache()
      void prefetchDoorManifest(
        result.eventId,
        fetchEventTicketManifest,
      ).catch(() => {})
      router.replace("/puerta/escanear")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="flex flex-col items-center gap-3">
        <Image
          src={BRAND_MARK_SRC}
          alt=""
          width={48}
          height={48}
          className="size-12"
        />
        <p className="text-xl font-black tracking-tight text-white">TokePass</p>
      </div>
      <p className="mt-8 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-fuchsia-300">
        Control de acceso
      </p>
      <h1 className="mt-3 text-center text-3xl font-black tracking-tight">
        PIN de puerta
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-white/55">
        Ingresa el codigo de 6 numeros del organizador. No hace falta email ni
        contraseña.
      </p>

      <form
        className="mt-10 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="sr-only" htmlFor="door-pin">
          PIN de 6 numeros
        </label>
        <input
          id="door-pin"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            setError(null)
          }}
          placeholder="000000"
          className="h-20 w-full rounded-2xl border border-white/15 bg-white/10 text-center font-mono text-4xl font-black tracking-[0.4em] text-white placeholder:text-white/25"
        />
        {error ? (
          <p className="text-center text-sm text-rose-300">{error}</p>
        ) : null}
        <Button
          type="submit"
          disabled={!ready}
          className="min-h-16 w-full rounded-2xl bg-emerald-500 text-lg font-black tracking-wide text-black hover:bg-emerald-400 disabled:opacity-40"
        >
          {pending ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Validando…
            </>
          ) : (
            <>
              <KeyRound className="size-5" aria-hidden="true" />
              Entrar al escaner
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
