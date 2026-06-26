import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { getDB } from '../src/lib/db.js';
import { fetchFifaSchedule } from '../src/lib/schedule/sources/fifa.js';
import {
  ensureScheduleSchema,
  saveSourceSnapshot,
  syncCanonicalToRuntimeFixture,
  upsertCanonicalFixture,
  upsertScheduleSource
} from '../src/lib/schedule/repository.js';

loadEnvConfig(process.cwd());

async function main() {
  const tournament = 'World Cup 2026';
  const season = '2026';
  const db = await getDB();
  await ensureScheduleSchema(db);

  const sourceResult = await fetchFifaSchedule({ tournament, season });
  await upsertScheduleSource(db, sourceResult.source);
  const sourceHash = await saveSourceSnapshot(db, {
    source: sourceResult.source,
    tournament,
    season,
    rawExcerpt: sourceResult.rawExcerpt,
    fixtures: sourceResult.fixtures
  });

  let canonicalCount = 0;
  for (const fixture of sourceResult.fixtures) {
    const canonicalFixture = {
      ...fixture,
      sourceHash
    };
    await upsertCanonicalFixture(db, canonicalFixture);
    await syncCanonicalToRuntimeFixture(db, canonicalFixture);
    canonicalCount++;
  }

  const canonicalRows = await db.all(
    `SELECT id FROM canonical_fixtures WHERE tournament = ? AND season = ?`,
    [tournament, season]
  );
  const runtimeRows = await db.all(
    `SELECT id FROM fixtures WHERE tournament = ? AND season = ? AND is_test = 0`,
    [tournament, season]
  );

  console.log(JSON.stringify({
    success: true,
    seededCount: canonicalCount,
    canonicalCount: canonicalRows.length,
    runtimeOfficialCount: runtimeRows.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
