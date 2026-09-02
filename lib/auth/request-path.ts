import "server-only"

import { headers } from "next/headers"

import {
  REQUEST_PATHNAME_HEADER,
  safeInternalNextPath,
} from "@/lib/auth/next-path"

/**
 * Ruta que el interceptor Edge dejó en `x-pathname`, ya validada contra
 * open-redirect. Devuelve `null` en las rutas que no pasan por el interceptor.
 */
export async function currentRequestPath(): Promise<string | null> {
  const store = await headers()
  return safeInternalNextPath(store.get(REQUEST_PATHNAME_HEADER))
}
