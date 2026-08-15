import { handleStoryImageProxy } from "@/lib/story-image-proxy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return handleStoryImageProxy(request)
}
