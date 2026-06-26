import crypto from 'crypto';

export function hashContent(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export async function ensureScheduleSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT UNIQUE,
      name TEXT,
      url TEXT,
      priority INTEGER DEFAULT 100,
      status INTEGER DEFAULT 1,
      last_synced_at DATETIME DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS canonical_fixtures (
      id TEXT PRIMARY KEY,
      tournament TEXT,
      season TEXT,
      match_number INTEGER,
      stage TEXT,
      group_name TEXT,
      home_team TEXT,
      away_team TEXT,
      match_date TEXT,
      match_time TEXT,
      venue TEXT,
      city TEXT,
      status TEXT DEFAULT 'scheduled',
      confidence REAL DEFAULT 0,
      source_key TEXT,
      source_url TEXT,
      source_hash TEXT,
      last_verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament, season, match_number)
    );

    CREATE TABLE IF NOT EXISTS fixture_source_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT,
      tournament TEXT,
      season TEXT,
      content_hash TEXT,
      raw_excerpt TEXT,
      parsed_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fixture_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament TEXT,
      season TEXT,
      status TEXT,
      added_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      unchanged_count INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME DEFAULT NULL,
      error_message TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS fixture_sync_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_run_id INTEGER,
      match_number INTEGER,
      payload_json TEXT,
      validation_status TEXT,
      validation_reason TEXT,
      diff_type TEXT,
      confidence REAL DEFAULT 0,
      source_key TEXT,
      applied_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function upsertScheduleSource(db, source) {
  await db.run(
    `INSERT INTO schedule_sources (source_key, name, url, priority, status, last_synced_at)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(source_key) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       priority = excluded.priority,
       status = 1,
       last_synced_at = CURRENT_TIMESTAMP`,
    [source.sourceKey, source.name, source.url, source.priority || 100]
  );
}

export async function createSyncRun(db, { tournament, season }) {
  const result = await db.run(
    `INSERT INTO fixture_sync_runs (tournament, season, status)
     VALUES (?, ?, 'running')`,
    [tournament, season]
  );
  return result.lastID;
}

export async function finishSyncRun(db, runId, { status, addedCount, updatedCount, rejectedCount, unchangedCount, errorMessage = null }) {
  await db.run(
    `UPDATE fixture_sync_runs
     SET status = ?,
         added_count = ?,
         updated_count = ?,
         rejected_count = ?,
         unchanged_count = ?,
         finished_at = CURRENT_TIMESTAMP,
         error_message = ?
     WHERE id = ?`,
    [status, addedCount, updatedCount, rejectedCount, unchangedCount, errorMessage, runId]
  );
}

export async function saveSourceSnapshot(db, { source, tournament, season, rawExcerpt, fixtures }) {
  const parsedJson = JSON.stringify(fixtures);
  const contentHash = hashContent(`${rawExcerpt}\n${parsedJson}`);
  await db.run(
    `INSERT INTO fixture_source_snapshots (source_key, tournament, season, content_hash, raw_excerpt, parsed_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [source.sourceKey, tournament, season, contentHash, rawExcerpt || '', parsedJson]
  );
  return contentHash;
}

export async function getCanonicalFixtures(db, { tournament, season }) {
  return await db.all(
    `SELECT * FROM canonical_fixtures WHERE tournament = ? AND season = ?`,
    [tournament, season]
  );
}

export async function saveCandidate(db, runId, candidate) {
  const payload = JSON.stringify(candidate.payload);
  const result = await db.run(
    `INSERT INTO fixture_sync_candidates (
      sync_run_id, match_number, payload_json, validation_status, validation_reason, diff_type, confidence, source_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      candidate.payload.matchNumber || null,
      payload,
      candidate.validationStatus,
      candidate.validationReason || '',
      candidate.diffType,
      candidate.confidence || 0,
      candidate.sourceKey || null
    ]
  );
  return {
    ...candidate,
    id: result.lastID,
    syncRunId: runId
  };
}

export async function getCandidatesByRun(db, syncRunId) {
  const rows = await db.all(
    `SELECT * FROM fixture_sync_candidates WHERE sync_run_id = ? ORDER BY match_number, id`,
    [syncRunId]
  );
  return rows.map((row) => ({
    id: row.id,
    syncRunId: row.sync_run_id,
    matchNumber: row.match_number,
    payload: JSON.parse(row.payload_json),
    validationStatus: row.validation_status,
    validationReason: row.validation_reason,
    diffType: row.diff_type,
    confidence: row.confidence,
    sourceKey: row.source_key,
    appliedAt: row.applied_at
  }));
}

export async function markCandidateApplied(db, candidateId) {
  await db.run(
    `UPDATE fixture_sync_candidates SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [candidateId]
  );
}

export async function upsertCanonicalFixture(db, fixture) {
  const canonicalId = fixture.id || `m${fixture.matchNumber}`;
  await db.run(
    `INSERT INTO canonical_fixtures (
      id, tournament, season, match_number, stage, group_name, home_team, away_team,
      match_date, match_time, venue, city, status, confidence, source_key, source_url, source_hash, last_verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      tournament = excluded.tournament,
      season = excluded.season,
      match_number = excluded.match_number,
      stage = excluded.stage,
      group_name = excluded.group_name,
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      match_date = excluded.match_date,
      match_time = excluded.match_time,
      venue = excluded.venue,
      city = excluded.city,
      status = excluded.status,
      confidence = excluded.confidence,
      source_key = excluded.source_key,
      source_url = excluded.source_url,
      source_hash = excluded.source_hash,
      last_verified_at = CURRENT_TIMESTAMP`,
    [
      canonicalId,
      fixture.tournament,
      fixture.season,
      fixture.matchNumber,
      fixture.stage,
      fixture.group,
      fixture.homeTeam,
      fixture.awayTeam,
      fixture.date,
      fixture.time,
      fixture.venue,
      fixture.city,
      fixture.status || 'scheduled',
      fixture.confidence || 0,
      fixture.sourceKey,
      fixture.sourceUrl,
      fixture.sourceHash || null
    ]
  );
}

export async function syncCanonicalToRuntimeFixture(db, fixture) {
  const fixtureId = fixture.id || `m${fixture.matchNumber}`;
  const existing = await db.get('SELECT id FROM fixtures WHERE id = ?', [fixtureId]);
  const params = [
    fixture.homeTeam,
    fixture.awayTeam,
    fixture.date,
    fixture.time,
    fixture.group,
    fixture.venue,
    fixture.tournament,
    fixture.season
  ];

  if (existing) {
    await db.run(
      `UPDATE fixtures
       SET home_team = ?,
           away_team = ?,
           match_date = ?,
           match_time = ?,
           group_name = ?,
           venue = ?,
           tournament = ?,
           season = ?,
           is_test = 0
       WHERE id = ?`,
      [...params, fixtureId]
    );
  } else {
    await db.run(
      `INSERT INTO fixtures (id, home_team, away_team, match_date, match_time, group_name, venue, tournament, season, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [fixtureId, ...params]
    );
  }
}
