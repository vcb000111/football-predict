import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          env[key] = val;
        }
      }
    });
  }
  return env;
}

async function dumpPrompts() {
  const env = loadEnv();
  const dumpDir = path.join(process.cwd(), 'scratch', 'dump_prompts');
  
  if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  // 1. Dump Local
  const localDbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Reading Local: ${localDbPath}`);
  try {
    const db = await open({
      filename: localDbPath,
      driver: sqlite3.Database
    });
    const localPrompts = await db.all("SELECT prompt_key, prompt_content FROM system_prompts");
    for (const p of localPrompts) {
      const filePath = path.join(dumpDir, `local_${p.prompt_key}.txt`);
      fs.writeFileSync(filePath, p.prompt_content || '', 'utf8');
      console.log(`- Saved local_${p.prompt_key}.txt`);
    }
    await db.close();
  } catch (err) {
    console.error("Local Error:", err.message);
  }

  // 2. Dump Prod
  const tursoUrl = env.TURSO_DATABASE_URL;
  const tursoToken = env.TURSO_AUTH_TOKEN;
  if (tursoUrl) {
    console.log(`Reading Prod: ${tursoUrl}`);
    try {
      const client = createClient({
        url: tursoUrl,
        authToken: tursoToken || ''
      });
      const res = await client.execute("SELECT prompt_key, prompt_content FROM system_prompts");
      for (const row of res.rows) {
        const filePath = path.join(dumpDir, `prod_${row.prompt_key}.txt`);
        fs.writeFileSync(filePath, row.prompt_content || '', 'utf8');
        console.log(`- Saved prod_${row.prompt_key}.txt`);
      }
    } catch (err) {
      console.error("Prod Error:", err.message);
    }
  }
}

dumpPrompts();
