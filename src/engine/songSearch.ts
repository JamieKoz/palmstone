/** Song search via Deezer’s free API (30s MP3 previews, no key). */

export type SongHit = {
  id: number;
  title: string;
  artist: string;
  /** Preview / stream MP3 URL. */
  previewUrl: string;
  artworkUrl: string | null;
  trackViewUrl: string | null;
  /** Loop playback (used for the local demo track). */
  loop?: boolean;
};

type DeezerArtist = { name?: string };
type DeezerAlbum = { cover_medium?: string; cover_small?: string };
type DeezerTrack = {
  id?: number;
  title?: string;
  preview?: string;
  link?: string;
  artist?: DeezerArtist;
  album?: DeezerAlbum;
};

type DeezerSearchResponse = {
  data?: DeezerTrack[];
  error?: { message?: string };
};

/** Deezer search supports JSONP — avoids CORS issues on api.deezer.com. */
function deezerJsonp(url: string): Promise<DeezerSearchResponse> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Song search is client-only"));
  }

  return new Promise((resolve, reject) => {
    const cb = `dzcb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      script.remove();
      try {
        delete (window as unknown as Record<string, unknown>)[cb];
      } catch {
        (window as unknown as Record<string, unknown>)[cb] = undefined;
      }
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Song search timed out"));
    }, 12_000);

    (window as unknown as Record<string, unknown>)[cb] = (data: DeezerSearchResponse) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(data ?? {});
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("Song search failed to load"));
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

/** Search for tracks with playable previews. */
export async function searchSongs(query: string, limit = 12): Promise<SongHit[]> {
  const q = query.trim();
  if (!q) return [];

  const capped = Math.max(1, Math.min(25, limit));
  const url =
    `https://api.deezer.com/search?q=${encodeURIComponent(q)}` + `&limit=${capped}`;

  const data = await deezerJsonp(url);
  if (data.error?.message) throw new Error(data.error.message);

  const hits: SongHit[] = [];
  for (const r of data.data ?? []) {
    if (!r.preview || !r.id || !r.title) continue;
    hits.push({
      id: r.id,
      title: r.title,
      artist: r.artist?.name || "Unknown",
      previewUrl: r.preview,
      artworkUrl: r.album?.cover_medium || r.album?.cover_small || null,
      trackViewUrl: r.link ?? null,
    });
  }
  return hits;
}
