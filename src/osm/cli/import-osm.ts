import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createDatabaseClient } from '../../database/database.service';
import {
  OsmImportService,
  prepareImport,
} from '../application/osm-import.service';
import type { ImportOptions } from '../application/osm-import.service';

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      actor: { type: 'string' },
      area: { type: 'string' },
      'snapshot-at': { type: 'string' },
      bbox: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });
  if (
    !values.file ||
    !values.actor ||
    !values.area ||
    !values['snapshot-at'] ||
    !values.bbox
  )
    throw new Error(
      'Usage: --file export.json --actor nom --area zone --snapshot-at ISO-UTC --bbox=west,south,east,north [--apply]',
    );
  const file = await open(values.file, 'r');
  let payload: unknown;
  try {
    const stats = await file.stat();
    if (!stats.isFile() || stats.size > 5 * 1024 * 1024)
      throw new Error('Fichier JSON ordinaire de 5 Mo maximum requis');
    const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        count,
        buffer.length - count,
        null,
      );
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux');
    payload = JSON.parse(buffer.subarray(0, count).toString('utf8'));
  } finally {
    await file.close();
  }
  const options: ImportOptions = {
    actor: values.actor,
    area: values.area,
    snapshotAt: values['snapshot-at'],
    bbox: values.bbox.split(',').map(Number) as ImportOptions['bbox'],
  };
  const candidates = prepareImport(payload, options);
  if (!values.apply) {
    process.stdout.write(
      JSON.stringify(
        {
          dryRun: true,
          candidates: candidates.map((c) => ({
            source: `${c.osmType}/${c.osmId}`,
            warnings: c.warnings,
          })),
          note: 'Validation du fichier uniquement ; doublons DB contrôlés avec --apply.',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }
  const db = createDatabaseClient();
  try {
    process.stdout.write(
      JSON.stringify(
        await new OsmImportService(db).import(payload, options),
        null,
        2,
      ) + '\n',
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  // Ne pas exposer URL DB, credentials ou détails du fournisseur dans une stack CLI.
  process.stderr.write(
    'Import échoué. Vérifier arguments, fichier, DATABASE_URL et migrations. Aucun succès ne doit être supposé.\n',
  );
  process.exitCode = 1;
});
