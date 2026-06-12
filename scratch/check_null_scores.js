import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const nullPredictions = await db.all(`SELECT id, match_id, home_team, away_team, created_at FROM predictions WHERE actual_home_score IS NULL`);
  console.log('Predictions with NULL actual scores:');
  console.log(JSON.stringify(nullPredictions, null, 2));

  await db.close();
}

main().catch(console.error);
