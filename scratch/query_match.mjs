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
const { getDB } = await import('../src/lib/db.js');

async function query() {
  try {
    const db = await getDB();
    console.log('--- ALL FIXTURES (First 10) ---');
    // Tìm các fixtures xem thế nào
    const fixtures = await db.all('SELECT * FROM fixtures LIMIT 20');
    console.log(JSON.stringify(fixtures, null, 2));

    console.log('--- GERMANY / CURACAO FIXTURES ---');
    const matchedFixtures = await db.all(
      'SELECT * FROM fixtures WHERE home_team LIKE ? OR away_team LIKE ?',
      ['%Curaçao%', '%Curaçao%']
    );
    console.log(JSON.stringify(matchedFixtures, null, 2));

    if (matchedFixtures.length > 0) {
      const matchId = matchedFixtures[0].id;
      console.log(`--- PREDICTIONS FOR MATCH ${matchId} ---`);
      const predictions = await db.all('SELECT * FROM predictions WHERE match_id = ?', [matchId]);
      console.log(JSON.stringify(predictions, null, 2));
    }
  } catch (err) {
    console.error('Lỗi khi truy vấn:', err);
  }
}

query();
