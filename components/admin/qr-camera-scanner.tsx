"use client"

import { forwardRef, useEffect } from "react"
import {
  Scanner,
  type IScannerHandle,
  type IScannerProps,
} from "@yudiel/react-qr-scanner"

import { configureZxingWasm } from "@/lib/scanner/configure-zxing"
import { cn } from "@/lib/utils"

/** Client-only QR camera. Loaded via `next/dynamic` so WASM stays out of the first paint. */
const QrCameraScanner = forwardRef<IScannerHandle, IScannerProps>(
  function QrCameraScanner({ classNames, styles, ...props }, ref) {
    useEffect(() => {
      configureZxingWasm()
    }, [])

    return (
      <div className="relative z-0 h-full w-full overflow-hidden">
        <Scanner
          ref={ref}
          {...props}
          classNames={{
            container: cn(
              "relative z-0 h-full w-full overflow-hidden",
              classNames?.container,
            ),
            video: cn("pointer-events-none", classNames?.video),
          }}
          styles={{
            ...styles,
            container: {
              width: "100%",
              height: "100%",
              position: "relative",
              overflow: "hidden",
              ...styles?.container,
            },
            video: {
              objectFit: "cover",
              pointerEvents: "none",
              ...styles?.video,
            },
          }}
        />
      </div>
    )
  },
)

export default QrCameraScanner
