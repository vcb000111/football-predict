import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function query() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  console.log('--- DANH SÁCH DỰ ĐOÁN TRẬN m1 ---');
  const predictions = await db.all("SELECT id, predicted_home_score, predicted_away_score, win_prob_home, win_prob_draw, win_prob_away, recommendation_1x2, recommendation_ou, recommendation_handicap, created_at, raw_prediction_json FROM predictions WHERE match_id = 'm1' ORDER BY id ASC");
  
  const formatted = predictions.map(p => {
    let modelUsed = 'N/A';
    try {
      if (p.raw_prediction_json) {
        const rawObj = JSON.parse(p.raw_prediction_json);
        modelUsed = rawObj.modelUsed || rawObj.model_used || 'N/A';
      }
    } catch (e) {}
    
    return {
      ID: p.id,
      Time: p.created_at,
      Score: `${p.predicted_home_score}-${p.predicted_away_score}`,
      "Prob (H/D/A)": `${p.win_prob_home}% / ${p.win_prob_draw}% / ${p.win_prob_away}%`,
      "Rec 1X2": p.recommendation_1x2,
      "Rec O/U": p.recommendation_ou,
      "Rec Handicap": p.recommendation_handicap,
      Model: modelUsed
    };
  });
  
  console.table(formatted);
  console.log(`\nTổng số lượt predict: ${predictions.length}`);
  
  await db.close();
}

query().catch(console.error);
