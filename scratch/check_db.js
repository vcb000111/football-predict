import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const predictions = await db.all(`SELECT id, match_id, home_team, away_team, actual_home_score, created_at FROM predictions ORDER BY id DESC LIMIT 10`);
  console.log('Last 10 predictions:');
  console.log(JSON.stringify(predictions, null, 2));

  const keys = await db.all(`SELECT provider, COUNT(*) as count FROM api_keys WHERE status = 1 GROUP BY provider`);
  console.log('Active keys:', keys);

  const models = await db.all(`SELECT model_name, provider, priority, status FROM ai_models WHERE status = 1`);
  console.log('Active models:', models);

  const searchKeys = await db.all(`SELECT provider_name, COUNT(*) as count FROM search_api_keys WHERE status = 1 GROUP BY provider_name`);
  console.log('Active search keys:', searchKeys);

  await db.close();
}

main().catch(console.error);
