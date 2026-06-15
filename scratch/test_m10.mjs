import fs from 'fs';
import path from 'path';

// Đọc .env.local thủ công
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        process.env[key] = value;
      }
    }
  });
}

// Dynamic import db sau khi có env
const { readLinkContent } = await import('../src/lib/link-reader.js');
const { getDB } = await import('../src/lib/db.js');

async function test() {
  const db = await getDB();
  console.log('--- FIXTURE m10 IN DB ---');
  const fix = await db.get('SELECT * FROM fixtures WHERE id = ?', ['m10']);
  console.log(JSON.stringify(fix, null, 2));

  console.log('--- PREDICTION m10 IN DB ---');
  const pred = await db.get('SELECT * FROM predictions WHERE match_id = ?', ['m10']);
  console.log(JSON.stringify(pred, null, 2));

  console.log('--- CONTEXT FROM LINK READER ---');
  const ctx = await readLinkContent('/match/m10');
  console.log(ctx);
}

test();
