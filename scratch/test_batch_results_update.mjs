import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fetch from 'node-fetch';

async function runTest() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Connecting to database at: ${dbPath}`);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    // 1. Tạo 2 lượt dự đoán giả lập cho trận t1 (Turkey vs North Macedonia) chưa có kết quả
    const timestampA = new Date().toISOString() + '_A';
    const timestampB = new Date().toISOString() + '_B';
    
    console.log('📌 Tạo 2 lượt dự đoán giả lập chưa có tỉ số thực tế cho trận t1...');
    
    // Lượt A: Dự đoán 2-1, Tài 2.5, Chấp Home -0.75, BTTS: Yes, Corners: Over 8.5, Cards: Under 3.5
    const resA = await db.run(
      `INSERT INTO predictions (
        match_id, home_team, away_team, 
        predicted_home_score, predicted_away_score, 
        win_prob_home, win_prob_draw, win_prob_away,
        recommendation_1x2, recommendation_ou, recommendation_handicap,
        recommendation_btts, recommendation_corners, recommendation_cards,
        actual_home_score, actual_away_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        't1', 'Turkey', 'North Macedonia',
        2, 1,
        60, 20, 20,
        'Home', 'Over 2.5', 'Home -0.75',
        'Yes', 'Over 8.5 Corners', 'Under 3.5 Cards'
      ]
    );
    const idA = resA.lastID;

    // Lượt B: Dự đoán 3-0, Tài 2.5, Chấp Home -1.5, BTTS: No, Corners: Under 8.5, Cards: Under 3.5
    const resB = await db.run(
      `INSERT INTO predictions (
        match_id, home_team, away_team, 
        predicted_home_score, predicted_away_score, 
        win_prob_home, win_prob_draw, win_prob_away,
        recommendation_1x2, recommendation_ou, recommendation_handicap,
        recommendation_btts, recommendation_corners, recommendation_cards,
        actual_home_score, actual_away_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        't1', 'Turkey', 'North Macedonia',
        3, 0,
        70, 20, 10,
        'Home', 'Over 2.5', 'Home -1.5',
        'No', 'Under 8.5 Corners', 'Under 3.5 Cards'
      ]
    );
    const idB = resB.lastID;

    console.log(`✅ Đã tạo lượt A (ID: ${idA}) và lượt B (ID: ${idB}) thành công.`);

    // 2. Gửi request POST tới /api/results/auto để AI tự cập nhật kết quả và chấm điểm
    console.log('\n🚀 Gửi yêu cầu tự động cập nhật kết quả cho trận đấu t1...');
    const url = 'http://localhost:3000/api/results/auto';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeTeam: 'Turkey',
        awayTeam: 'North Macedonia',
        matchId: 't1'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ API Error (${response.status}):`, errText);
      return;
    }

    const data = await response.json();
    console.log('✅ API cập nhật hoàn tất!', data);

    // 3. Truy vấn lại DB xem 2 bản ghi giả lập có được cập nhật và chấm điểm chính xác hay không
    console.log('\n📊 Kiểm tra kết quả trong SQLite...');
    
    const records = await db.all(
      `SELECT id, predicted_home_score, predicted_away_score, 
              actual_home_score, actual_away_score, 
              is_correct, is_correct_ou, is_correct_handicap, is_correct_btts,
              recommendation_handicap, bet_evaluation_details
       FROM predictions WHERE id IN (?, ?)`,
      [idA, idB]
    );

    for (const rec of records) {
      console.log(`\n--- Lượt ID: ${rec.id} ---`);
      console.log(`🔮 Dự đoán: ${rec.predicted_home_score}-${rec.predicted_away_score}`);
      console.log(`⚽ Thực tế: ${rec.actual_home_score}-${rec.actual_away_score}`);
      console.log(`🏆 Chấm điểm 1X2 (đúng/sai): ${rec.is_correct === 1 ? 'ĐÚNG' : 'SAI'}`);
      console.log(`📈 Chấm điểm Tài Xỉu 2.5: ${rec.is_correct_ou === 1 ? 'ĐÚNG' : 'SAI'}`);
      console.log(`⚖️ Chấm điểm Kèo Chấp (${rec.recommendation_handicap}): ${rec.is_correct_handicap === 1 ? 'ĐÚNG' : (rec.is_correct_handicap === 2 ? 'HÒA' : 'SAI')}`);
      console.log(`🤝 Chấm điểm BTTS: ${rec.is_correct_btts === 1 ? 'ĐÚNG' : 'SAI'}`);
      
      const evalDetails = JSON.parse(rec.bet_evaluation_details || '{}');
      console.log(`📝 Lý do chấm kèo chấp:`, evalDetails.handicap?.reason);
    }

    // Dọn dẹp: xóa 2 bản ghi test này để tránh làm bẩn dữ liệu thật
    console.log('\n🧹 Dọn dẹp dữ liệu test...');
    await db.run('DELETE FROM predictions WHERE id IN (?, ?)', [idA, idB]);
    console.log('✅ Đã dọn dẹp xong.');

  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
  } finally {
    await db.close();
  }
}

runTest();
