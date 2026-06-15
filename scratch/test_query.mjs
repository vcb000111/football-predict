import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log('Connecting to database:', dbPath);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const row = await db.get(
    "SELECT * FROM predictions ORDER BY id DESC LIMIT 1"
  );

  if (!row) {
    console.log('No predictions found.');
    return;
  }

  console.log('\n--- LƯỢT DỰ ĐOÁN MỚI NHẤT ---');
  console.log(`ID: ${row.id}`);
  console.log(`Match: ${row.home_team} vs ${row.away_team} (${row.predict_type})`);
  console.log(`Dự đoán tỷ số: ${row.predicted_home_score} - ${row.predicted_away_score}`);
  console.log(`Kèo 1X2: ${row.recommendation_1x2}`);
  console.log(`Created At: ${row.created_at}`);

  if (row.raw_prediction_json) {
    const data = JSON.parse(row.raw_prediction_json);
    console.log('\n--- PHẦN NHẬN ĐỊNH CHI TIẾT (predictionReasoning) ---');
    console.log(data.analysis?.predictionReasoning);
    console.log('------------------------------------------------');
  }
}

main().catch(err => {
  console.error('Error:', err);
});
