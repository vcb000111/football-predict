import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function check() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  console.log('--- KIỂM TRA CẤU TRÚC BẢNG predictions ---');
  const tableInfo = await db.all("PRAGMA table_info(predictions)");
  console.log(tableInfo.map(c => `${c.name} (${c.type})`));
  
  console.log('\n--- KIỂM TRA CẤU TRÚC BẢNG teams ---');
  const teamsInfo = await db.all("PRAGMA table_info(teams)");
  console.log(teamsInfo.map(c => `${c.name} (${c.type})`));

  console.log('\n--- KIỂM TRA MỘT SỐ CLB ĐÃ SEED ---');
  const clubs = await db.all("SELECT team_name, elo_rating, tactical_analysis FROM teams WHERE team_name IN ('Manchester City', 'Arsenal', 'Real Madrid', 'Barcelona')");
  console.log(clubs);
  
  await db.close();
}

check().catch(console.error);
