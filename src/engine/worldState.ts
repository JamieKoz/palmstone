const PREFIX = "palmstone:world:";

type Envelope<T> = {
  savedAt: number;
  data: T;
};

function key(id: string) {
  return `${PREFIX}${id}`;
}

function readEnvelope<T>(id: string): Envelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadWorld<T>(id: string): T | null {
  return readEnvelope<T>(id)?.data ?? null;
}

export function worldSavedAt(id: string): number | null {
  return readEnvelope(id)?.savedAt ?? null;
}

export function hasWorldState(id: string): boolean {
  return worldSavedAt(id) != null;
}

export function saveWorld<T>(id: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope<T> = { savedAt: Date.now(), data };
    localStorage.setItem(key(id), JSON.stringify(envelope));
  } catch {
    /* quota / private mode */
  }
}

export function clearWorld(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(id));
  } catch {
    /* ignore */
  }
}

/** Seconds since this world was last saved. Null if never. */
export function worldAgeSec(id: string): number | null {
  const at = worldSavedAt(id);
  if (at == null) return null;
  return Math.max(0, (Date.now() - at) / 1000);
}
