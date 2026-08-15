import "server-only"

import { isPlayablePreviewUrl } from "@/lib/spotify/map"
import { fetchArtistTopTrack, type SpotifyTopTrack } from "@/lib/spotify/client"

export type ArtistPreviewSyncRow = {
  id: string
  spotify_id?: string | null
  top_track_preview_url?: string | null
  top_track_name?: string | null
}

export type ArtistPreviewSyncResult = {
  updated: number
  skipped: number
  failed: number
  previews: Record<string, { previewUrl: string; trackName: string | null }>
}

function needsPreview(row: ArtistPreviewSyncRow): boolean {
  const spotifyId = row.spotify_id?.trim() ?? ""
  return Boolean(spotifyId) && !isPlayablePreviewUrl(row.top_track_preview_url)
}

export async function syncArtistPreviewRows(
  rows: ArtistPreviewSyncRow[],
  persist: (id: string, track: SpotifyTopTrack) => Promise<boolean>,
  options?: { limit?: number; timeoutMs?: number },
): Promise<ArtistPreviewSyncResult> {
  const limit = Math.max(1, options?.limit ?? 80)
  const deadline = options?.timeoutMs ? Date.now() + options.timeoutMs : null
  const pending = rows.filter(needsPreview).slice(0, limit)
  const skipped = Math.max(0, rows.length - pending.length)
  const previews: ArtistPreviewSyncResult["previews"] = {}
  let updated = 0
  let failed = 0

  for (const row of pending) {
    if (deadline != null && Date.now() >= deadline) break
    const spotifyId = row.spotify_id?.trim() ?? ""
    try {
      const track = await fetchArtistTopTrack(spotifyId)
      if (!isPlayablePreviewUrl(track.previewUrl)) {
        failed += 1
        continue
      }
      row.top_track_preview_url = track.previewUrl
      row.top_track_name = track.trackName
      const saved = await persist(row.id, track)
      if (!saved) {
        failed += 1
        continue
      }
      previews[row.id] = {
        previewUrl: track.previewUrl,
        trackName: track.trackName,
      }
      updated += 1
    } catch {
      failed += 1
    }
  }

  return { updated, skipped, failed, previews }
}
