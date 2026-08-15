export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): boolean {
    const bucket = (this.hits.get(key) ?? []).filter(
      (stamp) => now - stamp < this.windowMs,
    )
    if (bucket.length >= this.limit) {
      this.hits.set(key, bucket)
      return false
    }
    bucket.push(now)
    this.hits.set(key, bucket)
    return true
  }

  reset(): void {
    this.hits.clear()
  }
}

const globalHits = globalThis as {
  __tokepassCheckoutIpLimiter?: MemoryRateLimiter
  __tokepassArtistPreviewIpLimiter?: MemoryRateLimiter
}

export function getCheckoutIpLimiter(): MemoryRateLimiter {
  if (!globalHits.__tokepassCheckoutIpLimiter) {
    globalHits.__tokepassCheckoutIpLimiter = new MemoryRateLimiter(8, 60_000)
  }
  return globalHits.__tokepassCheckoutIpLimiter
}

export function getArtistPreviewIpLimiter(): MemoryRateLimiter {
  if (!globalHits.__tokepassArtistPreviewIpLimiter) {
    globalHits.__tokepassArtistPreviewIpLimiter = new MemoryRateLimiter(12, 60_000)
  }
  return globalHits.__tokepassArtistPreviewIpLimiter
}
