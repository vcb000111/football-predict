const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(__dirname, '..', 'worldcup_predictions.db');
  console.log('Opening database:', dbPath);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Đếm tổng số dự đoán
  const totalPreds = await db.get("SELECT COUNT(*) as count FROM predictions");
  console.log("Tổng số bản ghi dự đoán:", totalPreds.count);

  // Đếm các trận đấu đã có kết quả thực tế
  const evaluated = await db.all(
    `SELECT * FROM predictions WHERE actual_home_score IS NOT NULL`
  );
  console.log("Số trận đã chấm điểm:", evaluated.length);

  if (evaluated.length === 0) {
    console.log("Không có dữ liệu trận đấu đã chấm điểm.");
    return;
  }

  // Thống kê độ chính xác từng kèo
  let correct1x2 = 0;
  let correctOu = 0;
  let correctHandicap = 0;
  let correctBtts = 0;
  let correctCorners = 0;
  let correctCards = 0;
  let exactScore = 0;

  let totalCornersWithActual = 0;
  let totalCardsWithActual = 0;
  
  evaluated.forEach(p => {
    // 1. 1X2
    if (p.is_correct === 1) correct1x2++;
    
    // 2. OU
    if (p.is_correct_ou === 1) correctOu++;
    
    // 3. Handicap
    if (p.is_correct_handicap === 1) correctHandicap++;

    // 4. BTTS
    if (p.is_correct_btts === 1) correctBtts++;
    
    // 5. Corners
    if (p.is_correct_corners !== null && p.is_correct_corners !== undefined) {
      totalCornersWithActual++;
      if (p.is_correct_corners === 1) correctCorners++;
    }

    // 6. Cards
    if (p.is_correct_cards !== null && p.is_correct_cards !== undefined) {
      totalCardsWithActual++;
      if (p.is_correct_cards === 1) correctCards++;
    }

    // 7. Exact Score
    const pHome = p.predicted_home_score;
    const pAway = p.predicted_away_score;
    const aHome = p.actual_home_score;
    const aAway = p.actual_away_score;
    if (pHome === aHome && pAway === aAway) {
      exactScore++;
    }
  });

  console.log("\n===== THỐNG KÊ CHI TIẾT HIỆU SUẤT =====");
  console.log(`- Kèo 1X2: ${correct1x2}/${evaluated.length} (${(correct1x2/evaluated.length*100).toFixed(1)}%)`);
  console.log(`- Kèo Over/Under (Tài Xỉu): ${correctOu}/${evaluated.length} (${(correctOu/evaluated.length*100).toFixed(1)}%)`);
  console.log(`- Kèo Handicap (Chấp): ${correctHandicap}/${evaluated.length} (${(correctHandicap/evaluated.length*100).toFixed(1)}%)`);
  console.log(`- Kèo BTTS: ${correctBtts}/${evaluated.length} (${(correctBtts/evaluated.length*100).toFixed(1)}%)`);
  console.log(`- Kèo Phạt Góc: ${correctCorners}/${totalCornersWithActual} (${totalCornersWithActual > 0 ? (correctCorners/totalCornersWithActual*100).toFixed(1) : 0}%) [Có ${totalCornersWithActual} trận có data]`);
  console.log(`- Kèo Thẻ Phạt: ${correctCards}/${totalCardsWithActual} (${totalCardsWithActual > 0 ? (correctCards/totalCardsWithActual*100).toFixed(1) : 0}%) [Có ${totalCardsWithActual} trận có data]`);
  console.log(`- Tỷ số chính xác: ${exactScore}/${evaluated.length} (${(exactScore/evaluated.length*100).toFixed(1)}%)`);

  await db.close();
}

main().catch(err => console.error(err));
