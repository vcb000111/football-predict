import { getDB } from '../src/lib/db.js';

async function test() {
  const db = await getDB();
  const rows = await db.all("SELECT * FROM match_chats ORDER BY id DESC LIMIT 5");
  console.log(JSON.stringify(rows, null, 2));
}
test().catch(console.error);
