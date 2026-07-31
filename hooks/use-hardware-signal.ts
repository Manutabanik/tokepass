"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type HardwareSignalKind = "LED_GREEN" | "LED_RED" | "LED_OFF"

type SerialPortLike = {
  readable: ReadableStream | null
  writable: WritableStream | null
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
}

type NavigatorWithSerial = Navigator & {
  serial?: {
    requestPort: () => Promise<SerialPortLike>
    getPorts: () => Promise<SerialPortLike[]>
  }
}

/**
 * Señal opcional a placa relay / LED vía Web Serial.
 * Falla en silencio si no hay dispositivo o el navegador no soporta Serial.
 */
export function useHardwareSignal() {
  const portRef = useRef<SerialPortLike | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const [connected, setConnected] = useState(false)

  const disconnect = useCallback(async () => {
    try {
      await writerRef.current?.close().catch(() => undefined)
      writerRef.current = null
      await portRef.current?.close().catch(() => undefined)
    } finally {
      portRef.current = null
      setConnected(false)
    }
  }, [])

  const connect = useCallback(async () => {
    const serial = (navigator as NavigatorWithSerial).serial
    if (!serial) return false

    try {
      const existing = await serial.getPorts()
      const port = existing[0] ?? (await serial.requestPort())
      if (!port.readable || !port.writable) {
        await port.open({ baudRate: 9600 })
      }
      const writer = port.writable?.getWriter()
      if (!writer) return false
      portRef.current = port
      writerRef.current = writer
      setConnected(true)
      return true
    } catch {
      await disconnect()
      return false
    }
  }, [disconnect])

  const sendSignal = useCallback(async (kind: HardwareSignalKind) => {
    const writer = writerRef.current
    if (!writer) return false
    try {
      const payload = new TextEncoder().encode(`${kind}\n`)
      await writer.write(payload)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    return () => {
      void disconnect()
    }
  }, [disconnect])

  return {
    connected,
    connect,
    disconnect,
    sendSignal,
  }
}
