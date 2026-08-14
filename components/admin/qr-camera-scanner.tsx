"use client"

import { Scanner, type IScannerProps } from "@yudiel/react-qr-scanner"
import { useEffect } from "react"

import { configureZxingWasm } from "@/lib/scanner/configure-zxing"

/** Client-only QR camera. Loaded via `next/dynamic` so WASM stays out of the first paint. */
export default function QrCameraScanner(props: IScannerProps) {
  useEffect(() => {
    configureZxingWasm()
  }, [])

  return <Scanner {...props} />
}
