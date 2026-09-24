/** Song search via iTunes Search API (JSONP — no CORS, no API key). */

export type SongHit = {
  id: number;
  title: string;
  artist: string;
  previewUrl: string;
  artworkUrl: string | null;
  trackViewUrl: string | null;
};

type ItunesResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
};

type ItunesResponse = {
  resultCount?: number;
  results?: ItunesResult[];
};

function jsonp<T>(url: string, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__itunes_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      settled = true;
      delete (window as unknown as Record<string, unknown>)[cb];
      script.remove();
      window.clearTimeout(timer);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error("Song search timed out"));
    }, timeoutMs);

    (window as unknown as Record<string, unknown>)[cb] = (data: T) => {
      if (settled) return;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;
      cleanup();
      reject(new Error("Song search failed"));
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cb}`;
    document.body.appendChild(script);
  });
}

/** Search Apple Music / iTunes for tracks that have a 30s preview. */
export async function searchSongs(query: string, limit = 10): Promise<SongHit[]> {
  const q = query.trim();
  if (!q) return [];

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&media=music&entity=song&limit=${Math.max(1, Math.min(25, limit))}`;

  const data = await jsonp<ItunesResponse>(url);
  const results = data.results ?? [];

  return results
    .filter((r) => r.previewUrl && r.trackName && r.artistName && r.trackId != null)
    .map((r) => ({
      id: r.trackId!,
      title: r.trackName!,
      artist: r.artistName!,
      previewUrl: r.previewUrl!.replace(/^http:\/\//i, "https://"),
      artworkUrl: (r.artworkUrl100 ?? r.artworkUrl60 ?? null)?.replace(/^http:\/\//i, "https://") ?? null,
      trackViewUrl: r.trackViewUrl?.replace(/^http:\/\//i, "https://") ?? null,
    }));
}
