import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function calculateStats() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('📊 THỐNG KÊ TỶ LỆ DỰ ĐOÁN ĐÚNG CỦA AI TỪ SQLITE DATABASE:\n');

  // 1. Thống kê tổng số bản ghi và trận đấu có kết quả thực tế
  const totalPreds = await db.get(`SELECT COUNT(*) as count FROM predictions`);
  const evaluatedPreds = await db.get(`
    SELECT COUNT(*) as count FROM predictions 
    WHERE actual_home_score IS NOT NULL AND actual_away_score IS NOT NULL
  `);

  console.log(`- Tổng số lượt AI đã dự đoán: ${totalPreds.count}`);
  console.log(`- Lượt dự đoán đã diễn ra & có kết quả thực tế: ${evaluatedPreds.count}`);

  if (evaluatedPreds.count === 0) {
    console.log('⚠️ Chưa có dữ liệu trận đấu đã kết thúc để thống kê tỉ lệ đúng.');
    return;
  }

  // 2. Thống kê Kèo Châu Âu (1X2) và Tỷ Số Chính Xác
  const exactScore = await db.get(`
    SELECT COUNT(*) as count FROM predictions 
    WHERE actual_home_score IS NOT NULL 
      AND predicted_home_score = actual_home_score 
      AND predicted_away_score = actual_away_score
  `);

  const correctOutcome1x2 = await db.get(`
    SELECT COUNT(*) as count FROM predictions 
    WHERE actual_home_score IS NOT NULL AND (
      (predicted_home_score > predicted_away_score AND actual_home_score > actual_away_score) OR
      (predicted_home_score < predicted_away_score AND actual_home_score < actual_away_score) OR
      (predicted_home_score = predicted_away_score AND actual_home_score = actual_away_score)
    )
  `);

  const exactPct = ((exactScore.count / evaluatedPreds.count) * 100).toFixed(2);
  const correct1x2Pct = ((correctOutcome1x2.count / evaluatedPreds.count) * 100).toFixed(2);

  console.log('\n--- 🔮 KÈO CHÍNH (TỶ SỐ & 1X2) ---');
  console.log(`⚽ Đúng tỷ số chính xác: ${exactScore.count}/${evaluatedPreds.count} trận (${exactPct}%)`);
  console.log(`⚖️ Đúng kết quả 1X2 (Thắng/Thua/Hoà): ${correctOutcome1x2.count}/${evaluatedPreds.count} trận (${correct1x2Pct}%)`);

  // 3. Thống kê các kèo phụ
  // Kèo Tài Xỉu
  const ouTotal = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_ou IS NOT NULL`);
  const ouCorrect = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_ou = 1`);
  const ouPct = ouTotal.count > 0 ? ((ouCorrect.count / ouTotal.count) * 100).toFixed(2) : '0.00';

  // Kèo Chấp
  const handicapTotal = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_handicap IS NOT NULL`);
  const handicapCorrect = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_handicap = 1`);
  const handicapPct = handicapTotal.count > 0 ? ((handicapCorrect.count / handicapTotal.count) * 100).toFixed(2) : '0.00';

  // Kèo BTTS
  const bttsTotal = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_btts IS NOT NULL`);
  const bttsCorrect = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_btts = 1`);
  const bttsPct = bttsTotal.count > 0 ? ((bttsCorrect.count / bttsTotal.count) * 100).toFixed(2) : '0.00';

  // Kèo Phạt Góc
  const cornersTotal = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_corners IS NOT NULL`);
  const cornersCorrect = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_corners = 1`);
  const cornersPct = cornersTotal.count > 0 ? ((cornersCorrect.count / cornersTotal.count) * 100).toFixed(2) : '0.00';

  // Kèo Thẻ Phạt
  const cardsTotal = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_cards IS NOT NULL`);
  const cardsCorrect = await db.get(`SELECT COUNT(*) as count FROM predictions WHERE actual_home_score IS NOT NULL AND is_correct_cards = 1`);
  const cardsPct = cardsTotal.count > 0 ? ((cardsCorrect.count / cardsTotal.count) * 100).toFixed(2) : '0.00';

  console.log('\n--- 🎯 CÁC KÈO PHỤ & ĐÁNH GIÁ ---');
  console.log(`📈 Tài Xỉu 2.5: Đúng ${ouCorrect.count}/${ouTotal.count} kèo (${ouPct}%)`);
  console.log(`🛡️ Kèo Chấp: Đúng ${handicapCorrect.count}/${handicapTotal.count} kèo (${handicapPct}%)`);
  console.log(`🥅 Cả hai đội ghi bàn (BTTS): Đúng ${bttsCorrect.count}/${bttsTotal.count} kèo (${bttsPct}%)`);
  console.log(`📐 Phạt Góc (O/U 8.5): Đúng ${cornersCorrect.count}/${cornersTotal.count} kèo (${cornersPct}%)`);
  console.log(`🟨 Thẻ Phạt (O/U 3.5): Đúng ${cardsCorrect.count}/${cardsTotal.count} kèo (${cardsPct}%)`);

  await db.close();
}

calculateStats().catch(err => {
  console.error('❌ Lỗi khi thực hiện tính toán thống kê:', err);
});
