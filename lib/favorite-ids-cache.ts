/** Client-side cache of favorite event IDs for discovery cards. */

let favoriteIdsCache: Promise<string[]> | null = null

export function getFavoriteIdsCache(): Promise<string[]> | null {
  return favoriteIdsCache
}

export function setFavoriteIdsCache(promise: Promise<string[]>) {
  favoriteIdsCache = promise
}

export function invalidateFavoriteIdsCache() {
  favoriteIdsCache = null
}
