import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const keys = await db.all(`SELECT id, key_value, provider FROM api_keys`);
  console.log('Decrypted api_keys:');
  for (const k of keys) {
    // We import deobfuscateKey from db.js, but wait, the database wrapper in db.js already decrypts it on read!
    // Let's print the length and prefix of k.key_value
    const val = k.key_value || '';
    console.log(`ID: ${k.id}, Provider: ${k.provider}, Length: ${val.length}, Prefix: ${val.substring(0, 8)}...`);
  }

  const searchKeys = await db.all(`SELECT id, key_value, provider_name FROM search_api_keys`);
  console.log('\nDecrypted search_api_keys:');
  for (const sk of searchKeys) {
    const val = sk.key_value || '';
    console.log(`ID: ${sk.id}, Provider: ${sk.provider_name}, Length: ${val.length}, Prefix: ${val.substring(0, 8)}...`);
  }

  await db.close();
}

main().catch(console.error);
