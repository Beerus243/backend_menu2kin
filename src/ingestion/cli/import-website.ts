import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createDatabaseClient } from '../../database/database.service';
import { WebsiteImportService } from '../website-import.service';
async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      source: { type: 'string' },
      url: { type: 'string' },
      area: { type: 'string', default: 'Kinshasa' },
      actor: { type: 'string', default: 'local-operator' },
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (
    !values.file ||
    !values.source ||
    !values.url ||
    (values.apply && values['dry-run'])
  )
    throw new Error('ARGUMENTS_REQUIRED');
  if ((await stat(values.file)).size > 2 * 1024 * 1024)
    throw new Error('FILE_TOO_LARGE');
  const html = await readFile(values.file, 'utf8');
  const db = createDatabaseClient();
  try {
    process.stdout.write(
      JSON.stringify(
        await new WebsiteImportService(db).import(
          {
            html,
            sourceKey: values.source,
            sourceUrl: values.url,
            area: values.area,
            actor: values.actor,
          },
          !values.apply,
        ),
        null,
        2,
      ) + '\n',
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  process.stderr.write(
    'Import site refusé/échoué : vérifier permission documentée, fichier, arguments et base.\n',
  );
  process.exitCode = 1;
});
