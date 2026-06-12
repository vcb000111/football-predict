import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const keys = await db.all(`SELECT id, key_value, provider FROM api_keys`, [], { raw: true });
  console.log('Raw api_keys:');
  for (const k of keys) {
    console.log(`ID: ${k.id}, Provider: ${k.provider}, Length: ${k.key_value?.length}, Value: ${k.key_value}`);
  }

  await db.close();
}

main().catch(console.error);
