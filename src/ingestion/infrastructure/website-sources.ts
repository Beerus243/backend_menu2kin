import { readFile } from 'node:fs/promises';
import { safeUrl } from '../domain/discovery';
export interface WebsiteSource {
  key: string;
  origin: string;
  pathPrefix: string;
  approved: boolean;
  license: string;
  evidenceRef: string;
  reviewedAt: string;
  rights: string[];
}
export async function approvedWebsiteSource(
  key: string,
  url: string,
): Promise<WebsiteSource> {
  const sources: unknown = JSON.parse(
    await readFile(
      process.env.WEBSITE_SOURCES_FILE ?? 'config/website-sources.json',
      'utf8',
    ),
  );
  if (!Array.isArray(sources)) throw new Error('INVALID_SOURCE_REGISTRY');
  const source = sources.find((v) => v?.key === key) as
    WebsiteSource | undefined;
  if (
    !source ||
    !source.approved ||
    !source.evidenceRef ||
    !source.license ||
    !safeUrl(url) ||
    !Number.isFinite(Date.parse(source.reviewedAt)) ||
    Date.parse(source.reviewedAt) > Date.now() ||
    Date.now() - Date.parse(source.reviewedAt) > 90 * 86400000 ||
    !Array.isArray(source.rights) ||
    !['store', 'display', 'commercial'].every((right) =>
      source.rights.includes(right),
    )
  )
    throw new Error('SOURCE_NOT_APPROVED');
  const parsed = new URL(url);
  if (
    parsed.origin !== source.origin ||
    typeof source.pathPrefix !== 'string' ||
    !source.pathPrefix.startsWith('/') ||
    !(
      parsed.pathname === source.pathPrefix ||
      parsed.pathname.startsWith(
        source.pathPrefix.endsWith('/')
          ? source.pathPrefix
          : source.pathPrefix + '/',
      )
    )
  )
    throw new Error('SOURCE_URL_OUT_OF_SCOPE');
  return source;
}
