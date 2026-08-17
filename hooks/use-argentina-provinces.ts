"use client"

import { useEffect, useState } from "react"

import {
  ARGENTINA_PROVINCES_FALLBACK,
  fetchArgentinaProvinces,
} from "@/lib/georef-provincias"

export function useArgentinaProvinces() {
  const [provinces, setProvinces] = useState<string[]>([
    ...ARGENTINA_PROVINCES_FALLBACK,
  ])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchArgentinaProvinces().then((names) => {
      if (cancelled) return
      setProvinces(names.length ? names : [...ARGENTINA_PROVINCES_FALLBACK])
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { provinces, isLoading }
}
