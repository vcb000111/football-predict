import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function printSearchConfig() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('--- BẢNG search_providers ---');
  const providers = await db.all('SELECT * FROM search_providers ORDER BY priority ASC');
  console.table(providers);

  console.log('\n--- BẢNG search_api_keys ---');
  const keys = await db.all('SELECT * FROM search_api_keys ORDER BY id ASC');
  console.table(keys.map(k => ({
    id: k.id,
    provider_name: k.provider_name,
    key_value: k.key_value.substring(0, 15) + '...',
    status: k.status
  })));

  await db.close();
}

printSearchConfig();
