export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Sondeo de alcance para la billetera. No toca base de datos: solo prueba que
 * la request llegó a nuestro servidor.
 *
 * Responde 204 sin cuerpo a propósito. Un portal cautivo de wifi devuelve 200
 * con HTML de login, así que `navigator.onLine` y un status 2xx genérico no
 * alcanzan para distinguir "wifi conectado" de "internet disponible". El
 * cliente exige el 204 exacto.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
