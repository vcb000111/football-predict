import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';

async function main() {
  const db = await getDB();
  const keys = await db.all("SELECT id, provider, status, key_value FROM api_keys", [], { raw: true });
  console.log("Raw api_keys from Turso DB:");
  for (const k of keys) {
    console.log(`ID: ${k.id}, Provider: ${k.provider}, Status: ${k.status}, Length: ${k.key_value?.length}, Value: ${k.key_value}`);
  }
}

main().catch(console.error);
