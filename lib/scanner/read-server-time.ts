import { parseScannerServerTimestamp } from "@/lib/scanner/server-clock"

type RpcClient = {
  rpc: (
    fn: "scanner_server_time",
    args?: Record<string, never>,
  ) => PromiseLike<{ data: unknown; error: unknown }>
}

export async function readScannerServerTimeMs(
  client: RpcClient,
): Promise<number> {
  try {
    const { data, error } = await client.rpc("scanner_server_time")
    const parsed = parseScannerServerTimestamp(data)
    if (!error && parsed != null) return parsed
  } catch {
    // Fallback NTP del proceso (Vercel / Node). Mejor que el reloj del celular.
  }
  return Date.now()
}
