import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

async function test() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log('Opening database at:', dbPath);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const apiKeys = await db.all("SELECT * FROM api_keys");
  console.log('API Keys inside DB:');
  console.log(apiKeys);

  const models = await db.all("SELECT * FROM ai_models WHERE status = 1");
  console.log('Active AI Models inside DB:');
  console.log(models);
}

test().catch(err => console.error(err));
