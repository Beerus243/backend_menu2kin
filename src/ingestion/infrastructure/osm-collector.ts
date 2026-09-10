export const AREA_NAMES = {
  kinshasa: 'Kinshasa',
  gombe: 'Gombe',
  limete: 'Limete',
  ngaliema: 'Ngaliema',
  kintambo: 'Kintambo',
  bandalungwa: 'Bandalungwa',
  lemba: 'Lemba',
} as const;
export type AreaName = keyof typeof AREA_NAMES;
export function overpassQuery(area: AreaName): string {
  if (!Object.hasOwn(AREA_NAMES, area)) throw new Error('UNKNOWN_AREA');
  const selection =
    area === 'kinshasa'
      ? 'rel(5646651);'
      : 'area(3605646651)->.province;rel(area.province)["boundary"="administrative"]["admin_level"="7"]["name"="' +
        AREA_NAMES[area] +
        '"];';
  return `[out:json][timeout:40];${selection}out tags;map_to_area->.selection;nwr["amenity"~"^(restaurant|fast_food|cafe)$"](area.selection);out body center;`;
}
export async function collectOsm(
  area: AreaName,
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
) {
  const query = overpassQuery(area);
  let attempts = 0;
  for (;;) {
    attempts++;
    const signal = AbortSignal.timeout(45000);
    let response: Response;
    try {
      response = await fetcher('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          'User-Agent': 'Menu2Kin/0.1 (controlled local ingestion)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: query }).toString(),
      });
    } catch {
      if (attempts >= 3) throw new Error('OSM_NETWORK_UNAVAILABLE');
      await pause(attempts * 10000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      if (attempts >= 3) throw new Error('OSM_UNAVAILABLE');
      const header = response.headers.get('retry-after');
      const seconds = header
        ? /^\d+$/.test(header)
          ? Number(header)
          : (Date.parse(header) - Date.now()) / 1000
        : 0;
      const delay = Math.max(
        attempts * 10000,
        Number.isFinite(seconds) ? seconds * 1000 : 0,
      );
      if (delay > 60000) throw new Error('OSM_RETRY_LATER');
      await pause(delay);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('OSM_HTTP_REJECTED');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('OSM_EMPTY_RESPONSE');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        length += r.value.length;
        if (length > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('OSM_RESPONSE_TOO_LARGE');
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      remark?: unknown;
      elements?: unknown[];
      osm3s?: { timestamp_osm_base?: string };
    };
    if (payload.remark !== undefined || !Array.isArray(payload.elements))
      throw new Error('OSM_INCOMPLETE_RESPONSE');
    const boundaries = payload.elements.filter((value) => {
      const v = value as { type?: string; tags?: Record<string, string> };
      return (
        v.type === 'relation' &&
        v.tags?.boundary === 'administrative' &&
        v.tags?.name === AREA_NAMES[area]
      );
    });
    if (boundaries.length !== 1) throw new Error('OSM_AREA_NOT_UNIQUE');
    const snapshotAt = payload.osm3s?.timestamp_osm_base;
    if (!snapshotAt || !Number.isFinite(Date.parse(snapshotAt)))
      throw new Error('OSM_SNAPSHOT_MISSING');
    return { payload, snapshotAt, attempts, bytes: length };
  }
}
