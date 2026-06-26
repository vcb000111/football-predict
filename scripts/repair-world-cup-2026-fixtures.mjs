import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { getDB } from '../src/lib/db.js';
import {
  fixtureIdentity,
  getWorldCup2026OfficialFixtures,
  WORLD_CUP_2026_SEASON,
  WORLD_CUP_2026_TOURNAMENT
} from '../src/lib/world-cup-schedule.js';

loadEnvConfig(process.cwd());

function normalizeScore(value) {
  return value === undefined ? null : value;
}

function scoresForOfficialFixture(officialFixture, currentRows) {
  const matchingRow = currentRows.find((row) => fixtureIdentity(row) === fixtureIdentity(officialFixture));
  if (!matchingRow) {
    return {
      actualHomeScore: null,
      actualAwayScore: null,
      actualFirstHalfHomeScore: null,
      actualFirstHalfAwayScore: null,
      matchTimeline: null
    };
  }

  const sameDirection =
    matchingRow.home_team === officialFixture.homeTeam &&
    matchingRow.away_team === officialFixture.awayTeam;

  return {
    actualHomeScore: sameDirection ? normalizeScore(matchingRow.actual_home_score) : normalizeScore(matchingRow.actual_away_score),
    actualAwayScore: sameDirection ? normalizeScore(matchingRow.actual_away_score) : normalizeScore(matchingRow.actual_home_score),
    actualFirstHalfHomeScore: sameDirection ? normalizeScore(matchingRow.actual_first_half_home_score) : normalizeScore(matchingRow.actual_first_half_away_score),
    actualFirstHalfAwayScore: sameDirection ? normalizeScore(matchingRow.actual_first_half_away_score) : normalizeScore(matchingRow.actual_first_half_home_score),
    matchTimeline: matchingRow.match_timeline || null
  };
}

async function main() {
  const db = await getDB();
  const officialFixtures = getWorldCup2026OfficialFixtures();
  const currentRows = await db.all(
    `SELECT id, home_team, away_team, match_date, match_time, group_name, venue, tournament, season,
            actual_home_score, actual_away_score, actual_first_half_home_score, actual_first_half_away_score,
            match_timeline, is_test
     FROM fixtures
     WHERE tournament = ? AND season = ? AND is_test = 0`,
    [WORLD_CUP_2026_TOURNAMENT, WORLD_CUP_2026_SEASON]
  );

  let updatedCount = 0;
  let insertedCount = 0;

  for (const fixture of officialFixtures) {
    const scores = scoresForOfficialFixture(fixture, currentRows);
    const existingById = currentRows.find((row) => row.id === fixture.id);

    if (existingById) {
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
             actual_home_score = ?,
             actual_away_score = ?,
             actual_first_half_home_score = ?,
             actual_first_half_away_score = ?,
             match_timeline = ?,
             is_test = 0
         WHERE id = ?`,
        [
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.date,
          fixture.time,
          fixture.group,
          fixture.venue,
          fixture.tournament,
          fixture.season,
          scores.actualHomeScore,
          scores.actualAwayScore,
          scores.actualFirstHalfHomeScore,
          scores.actualFirstHalfAwayScore,
          scores.matchTimeline,
          fixture.id
        ]
      );
      updatedCount++;
    } else {
      await db.run(
        `INSERT INTO fixtures (
          id, home_team, away_team, match_date, match_time, group_name, venue, tournament, season,
          actual_home_score, actual_away_score, actual_first_half_home_score, actual_first_half_away_score,
          match_timeline, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          fixture.id,
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.date,
          fixture.time,
          fixture.group,
          fixture.venue,
          fixture.tournament,
          fixture.season,
          scores.actualHomeScore,
          scores.actualAwayScore,
          scores.actualFirstHalfHomeScore,
          scores.actualFirstHalfAwayScore,
          scores.matchTimeline
        ]
      );
      insertedCount++;
    }
  }

  const finalRows = await db.all(
    `SELECT id FROM fixtures WHERE tournament = ? AND season = ? AND is_test = 0`,
    [WORLD_CUP_2026_TOURNAMENT, WORLD_CUP_2026_SEASON]
  );

  console.log(JSON.stringify({
    success: true,
    sourceFixtures: officialFixtures.length,
    updatedCount,
    insertedCount,
    finalOfficialCount: finalRows.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
