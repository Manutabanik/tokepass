"use client"

import { forwardRef, useEffect } from "react"
import {
  Scanner,
  type IScannerHandle,
  type IScannerProps,
} from "@yudiel/react-qr-scanner"

import { configureZxingWasm } from "@/lib/scanner/configure-zxing"

/** Client-only QR camera. Loaded via `next/dynamic` so WASM stays out of the first paint. */
const QrCameraScanner = forwardRef<IScannerHandle, IScannerProps>(
  function QrCameraScanner(props, ref) {
    useEffect(() => {
      configureZxingWasm()
    }, [])

    return <Scanner ref={ref} {...props} />
  },
)

export default QrCameraScanner
