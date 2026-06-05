import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let dbInstance = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  
  // Khởi tạo file database trong thư mục gốc của dự án
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Tạo bảng lưu trữ lịch sử dự đoán nếu chưa tồn tại
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      home_team TEXT,
      away_team TEXT,
      predicted_home_score INTEGER,
      predicted_away_score INTEGER,
      win_prob_home INTEGER,
      win_prob_draw INTEGER,
      win_prob_away INTEGER,
      recommendation_1x2 TEXT,
      recommendation_ou TEXT,
      recommendation_handicap TEXT,
      actual_home_score INTEGER DEFAULT NULL,
      actual_away_score INTEGER DEFAULT NULL,
      is_correct INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Thực hiện migration bổ sung các cột đánh giá kèo nếu chưa tồn tại
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_ou INTEGER DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_handicap INTEGER DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN bet_evaluation_details TEXT DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  
  // Migrations cho các kèo phụ dễ ăn
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_btts TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_corners TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_cards TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_btts INTEGER DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_corners INTEGER DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_cards INTEGER DEFAULT NULL`);
  } catch (e) {}
  
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN raw_prediction_json TEXT DEFAULT NULL`);
  } catch (e) {}
  
  return dbInstance;
}
