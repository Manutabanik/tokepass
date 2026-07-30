import { prepareZXingModule } from "@yudiel/react-qr-scanner"

const ZXING_WASM_PATH = "/wasm/zxing_reader.wasm"
let configured = false

/**
 * Keep the QR engine same-origin. The upstream default points to jsDelivr,
 * which is intentionally blocked by our CSP and is unavailable offline.
 */
export function configureZxingWasm() {
  if (configured) return
  configured = true

  prepareZXingModule({
    overrides: {
      locateFile(path, prefix) {
        return path.endsWith(".wasm") ? ZXING_WASM_PATH : `${prefix}${path}`
      },
    },
    fireImmediately: false,
  })
}
