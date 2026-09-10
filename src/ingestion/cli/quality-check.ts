import { createDatabaseClient } from '../../database/database.service';
import { publicJson } from '../domain/discovery';
async function main() {
  const db = createDatabaseClient();
  try {
    const rows = await db.$queryRaw`SELECT count(*)::int AS total,
 count(*) FILTER(WHERE "contentStatus"='DRAFT')::int AS drafts,
 count(*) FILTER(WHERE address IS NULL)::int AS "missingAddress",
 count(*) FILTER(WHERE photo IS NULL)::int AS "missingPhoto",
 count(*) FILTER(WHERE verified)::int AS verified FROM "Restaurant"`;
    process.stdout.write(
      JSON.stringify(
        publicJson({
          event: 'quality_summary',
          restaurants: rows,
          sourceRecords: await db.osmRecord.count(),
          websiteRecords: await db.sourceRecord.count(),
          dishes: await db.dish.count(),
        }),
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
    'quality_check_failed: vérifier DATABASE_URL et migrations\n',
  );
  process.exitCode = 1;
});
