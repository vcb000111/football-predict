import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';

loadEnvConfig(process.cwd());

async function test() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  const res = await client.execute("SELECT * FROM match_chats ORDER BY id DESC LIMIT 5");
  console.log(JSON.stringify(res.rows, null, 2));
}
test().catch(console.error);
