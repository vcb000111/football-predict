import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function check() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log('Đang đọc SQLite local:', dbPath);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    const predictions = await db.all('SELECT * FROM predictions');
    console.log(`Số lượng bản ghi predictions trong SQLite local: ${predictions.length}`);
    if (predictions.length > 0) {
      console.log('Một số bản ghi predictions đầu tiên:');
      console.log(predictions.slice(0, 5).map(p => ({
        id: p.id,
        match_id: p.match_id,
        home_team: p.home_team,
        away_team: p.away_team,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        created_at: p.created_at
      })));
    }

    const fixtures = await db.all('SELECT * FROM fixtures');
    console.log(`Số lượng bản ghi fixtures trong SQLite local: ${fixtures.length}`);
  } catch (err) {
    console.error('Lỗi khi đọc bảng:', err.message);
  }
}

check().catch(console.error);
