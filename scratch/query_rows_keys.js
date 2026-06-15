import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { getDB } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

async function test() {
  const db = await getDB();
  const messages = await db.all(
    `SELECT sender, message, model_used, image_url, created_at FROM match_chats WHERE match_id = ? ORDER BY id ASC`,
    ['m12']
  );
  console.log("RAW ROWS FROM DB:", messages.slice(-2));
}
test().catch(console.error);
