import {
  open,
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createDatabaseClient } from '../../database/database.service';
import { OsmImportService } from '../../osm/application/osm-import.service';
import {
  AREA_NAMES,
  AreaName,
  collectOsm,
} from '../infrastructure/osm-collector';
export async function boundedFile(
  path: string,
  max = 5 * 1024 * 1024,
): Promise<string> {
  const f = await open(path, 'r');
  try {
    if (!(await f.stat()).isFile()) throw new Error('REGULAR_FILE_REQUIRED');
    const b = Buffer.alloc(max + 1);
    let count = 0;
    while (count < b.length) {
      const r = await f.read(b, count, b.length - count, null);
      if (!r.bytesRead) break;
      count += r.bytesRead;
    }
    if (count > max) throw new Error('FILE_TOO_LARGE');
    return b.subarray(0, count).toString('utf8');
  } finally {
    await f.close();
  }
}
async function main() {
  const { values } = parseArgs({
    options: {
      area: { type: 'string', default: 'kinshasa' },
      file: { type: 'string' },
      actor: { type: 'string', default: 'local-operator' },
      'snapshot-at': { type: 'string' },
      bbox: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      offline: { type: 'boolean', default: false },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(
      'import:osm --area=kinshasa [--file export.json] [--dry-run | --apply] [--offline] [--actor opérateur]\nDATABASE_URL requis. Aucun coût API, aucun prix/photo importé.\n',
    );
    return;
  }
  if (values.apply && values['dry-run']) throw new Error('CONFLICTING_MODE');
  const dryRun = !values.apply;
  let payload: unknown,
    snapshotAt = values['snapshot-at'],
    pagesFetched = 0,
    cacheHit = false;
  const startedAt = new Date().toISOString();
  process.stdout.write(
    JSON.stringify({
      event: 'import_started',
      source: 'OSM',
      area: values.area,
      dryRun,
      startedAt,
    }) + '\n',
  );
  if (values.file) payload = JSON.parse(await boundedFile(values.file));
  else {
    if (!Object.hasOwn(AREA_NAMES, values.area))
      throw new Error('UNKNOWN_AREA');
    const dir = resolve(process.env.OSM_CACHE_DIR ?? 'data/osm');
    await mkdir(dir, { recursive: true });
    const path = resolve(dir, values.area + '.json');
    try {
      const cache = JSON.parse(await boundedFile(path));
      if (
        values.offline ||
        Date.now() - Date.parse(cache.fetchedAt) < 86400000
      ) {
        payload = cache.payload;
        snapshotAt = cache.snapshotAt;
        cacheHit = true;
      }
    } catch {
      if (values.offline) throw new Error('OFFLINE_CACHE_UNAVAILABLE');
    }
    if (!payload) {
      const lock = await open(resolve(dir, '.collector.lock'), 'wx');
      try {
        const last = await readFile(
          resolve(dir, '.last-request'),
          'utf8',
        ).catch(() => '0');
        if (Date.now() - Number(last) < 60000)
          throw new Error('LOCAL_RATE_LIMIT');
        await writeFile(resolve(dir, '.last-request'), String(Date.now()));
        const result = await collectOsm(values.area as AreaName);
        payload = result.payload;
        snapshotAt = result.snapshotAt;
        pagesFetched = result.attempts;
        const temp = path + '.tmp';
        await writeFile(
          temp,
          JSON.stringify({
            fetchedAt: new Date().toISOString(),
            snapshotAt,
            payload,
          }),
        );
        await rename(temp, path);
      } finally {
        await lock.close();
        await unlink(resolve(dir, '.collector.lock'));
      }
    }
  }
  snapshotAt ??= (payload as { osm3s?: { timestamp_osm_base?: string } })?.osm3s
    ?.timestamp_osm_base;
  if (!snapshotAt) throw new Error('SNAPSHOT_REQUIRED');
  const bbox = values.bbox
    ? values.bbox.split(',').map(Number)
    : [15, -5, 17, -3];
  const db = createDatabaseClient();
  try {
    const result = await new OsmImportService(db).import(
      payload,
      {
        area: values.area,
        actor: values.actor,
        snapshotAt,
        bbox: bbox as [number, number, number, number],
      },
      dryRun,
    );
    process.stdout.write(
      JSON.stringify(
        {
          event: 'import_completed',
          source: 'OSM',
          startedAt,
          finishedAt: new Date().toISOString(),
          pagesFetched,
          cacheHit,
          ...result,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await db.$disconnect();
  }
}
// Ce fichier est l'entrée CLI, pas un utilitaire à importer depuis le serveur.
void main().catch(() => {
  process.stderr.write(
    JSON.stringify({
      event: 'import_failed',
      message:
        'Vérifier arguments, cache/verrou, accès source, DATABASE_URL et migrations. Utiliser --help. Aucun succès présumé.',
    }) + '\n',
  );
  process.exitCode = 1;
});
