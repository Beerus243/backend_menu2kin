import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { DiscoveryCandidate, phone, safeUrl } from './discovery';
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const text = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : null;
const coordinate = (v: unknown, max: number): number | null => {
  const n = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max
    ? n
    : null;
};
/** Parser hors réseau : aucune exécution JS, fetch de contexte, image ou lien. */
export function parseRestaurantJsonLd(
  html: string,
  sourceUrl: string,
): { candidates: DiscoveryCandidate[]; invalidScripts: number } {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024 || !safeUrl(sourceUrl))
    throw new Error('INVALID_HTML_INPUT');
  const $ = load(html);
  const nodes: Record<string, unknown>[] = [];
  let invalidScripts = 0;
  function walk(v: unknown, depth = 0) {
    if (depth > 12 || nodes.length > 5000)
      throw new Error('JSONLD_TOO_COMPLEX');
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    const n = obj(v);
    if (!n) return;
    nodes.push(n);
    for (const [key, item] of Object.entries(n))
      if (key !== '@context') walk(item, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, script) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(script).text());
    } catch {
      invalidScripts++;
      return;
    }
    walk(parsed);
  });
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of nodes)
    if (
      typeof n['@id'] === 'string' &&
      Object.keys(n).length > Object.keys(byId.get(n['@id']) ?? {}).length
    )
      byId.set(n['@id'], n);
  const resolve = (v: unknown) => {
    const n = obj(v);
    return n && typeof n['@id'] === 'string' ? (byId.get(n['@id']) ?? n) : n;
  };
  const candidates: DiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const types = (Array.isArray(n['@type']) ? n['@type'] : [n['@type']])
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.replace(/^https?:\/\/schema.org\//, ''));
    if (
      !types.some((t) =>
        ['Restaurant', 'FoodEstablishment', 'LocalBusiness'].includes(t),
      )
    )
      continue;
    const warnings: string[] = [];
    if (!types.some((t) => ['Restaurant', 'FoodEstablishment'].includes(t)))
      warnings.push('AMBIGUOUS_BUSINESS_TYPE');
    const name = text(n.name);
    const geo = resolve(n.geo);
    const address = resolve(n.address);
    let latitude = coordinate(geo?.latitude, 90),
      longitude = coordinate(geo?.longitude, 180);
    if (latitude === null || longitude === null) {
      latitude = null;
      longitude = null;
      warnings.push('MISSING_OR_INVALID_GEO');
    }
    if (!name) warnings.push('MISSING_NAME');
    const addr =
      text(n.address, 500) ??
      (address
        ? [
            text(address.streetAddress),
            text(address.addressLocality),
            text(address.postalCode),
          ]
            .filter(Boolean)
            .join(', ') || null
        : null);
    const identifier =
      text(n['@id'], 1000) ??
      createHash('sha256')
        .update(
          JSON.stringify({
            sourceUrl,
            name,
            address: addr,
            latitude,
            longitude,
          }),
        )
        .digest('hex');
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    const hours = n.openingHoursSpecification;
    // Conserver une représentation structurée bornée comme texte, pas de planning interprété.
    const openingHours =
      text(n.openingHours, 1000) ??
      (hours && JSON.stringify(hours).length <= 1000
        ? JSON.stringify(hours)
        : null);
    const cuisines = Array.isArray(n.servesCuisine)
      ? n.servesCuisine
      : typeof n.servesCuisine === 'string'
        ? n.servesCuisine.split(/[;,]/)
        : [];
    candidates.push({
      externalId: identifier,
      name,
      address: addr && addr.length <= 500 ? addr : null,
      latitude,
      longitude,
      phone: phone(n.telephone),
      website:
        typeof n.url === 'string' && n.url.length <= 500
          ? safeUrl(n.url)
          : null,
      openingHours,
      cuisine: cuisines
        .map((v) => text(v, 80)?.toLowerCase())
        .filter((v): v is string => !!v)
        .slice(0, 20),
      warnings,
      externalLinks: (Array.isArray(n.sameAs) ? n.sameAs : [])
        .map(safeUrl)
        .filter((v): v is string => v !== null)
        .slice(0, 10),
    });
  }
  return { candidates, invalidScripts };
}
