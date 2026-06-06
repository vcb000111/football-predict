import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Hàm trích xuất mốc kèo động từ chuỗi khuyến nghị của AI
function extractLine(recText, defaultVal) {
  if (!recText) return defaultVal;
  const match = recText.match(/[-+]?\d+(\.\d+)?/);
  if (match) {
    return parseFloat(match[0]);
  }
  return defaultVal;
}

// Hàm trích xuất phạt góc thực tế từ lý do text
function parseCornersFromReason(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // Các từ khóa báo hiệu không có dữ liệu thực tế
  if (lower.includes('không có dữ liệu') || 
      lower.includes('không cung cấp') || 
      lower.includes('không ghi nhận chi tiết') || 
      lower.includes('không thể đánh giá') || 
      lower.includes('chưa có thống kê') ||
      lower.includes('không có thông tin') ||
      (lower.includes('dữ liệu') && lower.includes('không cung cấp đầy đủ'))) {
    // Tránh nhầm với trường hợp vẫn ghi nhận số lượng ở sau
    if (!lower.match(/(?:là|quét được)\s*\d+\s*(?:quả|phạt góc)/)) {
      return null;
    }
  }

  // 1. Thử tìm với regex phạt góc đặc thù
  let m = text.match(/(?:phạt góc thực tế|quả phạt góc thực tế|phạt góc thực tế quét được|tổng số quả phạt góc thực tế)[^.]*?(?:là|có|được)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);

  // 2. Thử tìm tổng số phạt góc là X
  m = text.match(/(?:tổng số phạt góc là|tổng số phạt góc thực tế là|phạt góc thực tế quét được là)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);

  // 3. Chỉ ghi nhận X quả / chỉ có X quả
  m = text.match(/(?:chỉ ghi nhận|chỉ có|thống kê chỉ ghi nhận)\s*(\d+)\s*(?:quả|phạt góc)/i);
  if (m) return parseInt(m[1], 10);

  // 4. Mẫu thực tế là X quả
  m = text.match(/(?:thực tế là|tổng là)\s*(\d+)\s*(?:quả|phạt góc)/i);
  if (m) return parseInt(m[1], 10);

  return null;
}

// Hàm trích xuất thẻ phạt thực tế từ lý do text
function parseCardsFromReason(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Kiểm tra trường hợp 0 thẻ
  if (lower.includes('không có thẻ phạt nào') || 
      lower.includes('không có thẻ nào') || 
      lower.includes('0 thẻ') || 
      lower.includes('không có thẻ phạt được rút ra') ||
      lower.includes('không có thẻ phạt đáng kể')) {
    return 0;
  }

  // Các từ khóa báo hiệu không có dữ liệu thực tế
  if (lower.includes('không có dữ liệu') || 
      lower.includes('không cung cấp') || 
      lower.includes('không ghi nhận chi tiết') || 
      lower.includes('không thể đánh giá') || 
      lower.includes('chưa có thống kê') ||
      lower.includes('không có thông tin')) {
    if (!lower.match(/(?:là|ghi nhận|chỉ có|rút ra)\s*\d+\s*(?:thẻ|vàng)/)) {
      return null;
    }
  }

  // 1. Thử tìm với regex thẻ phạt đặc thù
  let m = text.match(/(?:thẻ phạt thực tế|tổng số thẻ phạt thực tế|thẻ phạt thực tế được ghi nhận|thẻ phạt thực tế chỉ)[^.]*?(?:là|có|chỉ là)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);

  // 2. Chỉ ghi nhận X thẻ / chỉ có X thẻ vàng
  m = text.match(/(?:chỉ ghi nhận|chỉ có|chỉ có|rút ra)\s*(\d+)\s*(?:thẻ|vàng)/i);
  if (m) return parseInt(m[1], 10);

  // 3. Thẻ phạt thực tế là X
  m = text.match(/(?:thẻ phạt thực tế là|thực tế chỉ là)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);

  // 4. Mẫu tổng là X / thực tế là X thẻ
  m = text.match(/(?:tổng cộng có|tổng là|thực tế là)\s*(\d+)\s*(?:thẻ|vàng)/i);
  if (m) return parseInt(m[1], 10);

  m = text.match(/tổng là\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);

  return null;
}

// Hàm chấm điểm Handicap châu Á
function evaluateHandicap(recommendation, aHome, aAway, homeTeam, awayTeam) {
  if (!recommendation) return { outcome: 'n/a', reason: 'Không có thông tin kèo chấp.' };
  const lowerRec = recommendation.toLowerCase();
  let selectedTeam = '';
  
  if (lowerRec.includes('home') || lowerRec.includes(homeTeam.toLowerCase())) {
    selectedTeam = 'home';
  } else if (lowerRec.includes('away') || lowerRec.includes(awayTeam.toLowerCase())) {
    selectedTeam = 'away';
  } else {
    return { outcome: 'n/a', reason: `Không xác định được đội chọn từ kèo: ${recommendation}` };
  }
  
  const numMatch = recommendation.match(/[-+]?\d+(\.\d+)?/);
  if (!numMatch) {
    return { outcome: 'n/a', reason: `Không tìm thấy tỷ lệ chấp từ kèo: ${recommendation}` };
  }
  const handicapValue = parseFloat(numMatch[0]);
  
  let netDiff = 0;
  if (selectedTeam === 'home') {
    netDiff = aHome - aAway + handicapValue;
  } else {
    netDiff = aAway - aHome + handicapValue;
  }
  
  let outcome = 'incorrect';
  let reason = '';
  if (netDiff > 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng cả tiền.`;
  } else if (netDiff === 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng nửa tiền.`;
  } else if (netDiff === 0) {
    outcome = 'refund';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} hòa tiền (refund).`;
  } else if (netDiff === -0.25) {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua nửa tiền.`;
  } else {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua cả tiền.`;
  }
  return { outcome, reason };
}

// Logic chấm điểm Tài Xỉu châu Á hỗ trợ .0, .25, .5, .75
function evaluateAsianOu(recommendation, actualTotal, line) {
  if (!recommendation) return { outcome: 'n/a', reason: 'Không có khuyến nghị.' };
  const lowerRec = recommendation.toLowerCase();
  const isOver = lowerRec.includes('over') || lowerRec.includes('tài');
  const isUnder = lowerRec.includes('under') || lowerRec.includes('xỉu');

  if (!isOver && !isUnder) {
    return { outcome: 'n/a', reason: `Không xác định được loại kèo Over/Under từ: ${recommendation}` };
  }

  const diff = actualTotal - line;
  const remainder = line % 1;
  
  let outcome = 'incorrect';
  let reason = '';

  if (Math.abs(remainder - 0.5) < 0.01) {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else {
      outcome = isUnder ? 'correct' : 'incorrect';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}. Kết quả: ${outcome === 'correct' ? 'Thắng' : 'Thua'}.`;
  } 
  else if (Math.abs(remainder - 0.0) < 0.01) {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else if (diff < 0) {
      outcome = isUnder ? 'correct' : 'incorrect';
    } else {
      outcome = 'refund';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}. Kết quả: ${outcome === 'correct' ? 'Thắng' : (outcome === 'refund' ? 'Hòa tiền' : 'Thua')}.`;
  }
  else if (Math.abs(remainder - 0.25) < 0.01) {
    if (isOver) {
      if (diff > 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng cả tiền.`;
      } else if (diff === -0.25) {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua cả tiền.`;
      }
    } else { // Under
      if (diff < -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng cả tiền.`;
      } else if (diff === -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua cả tiền.`;
      }
    }
  }
  else if (Math.abs(remainder - 0.75) < 0.01) {
    if (isOver) {
      if (diff > 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng cả tiền.`;
      } else if (diff === 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua cả tiền.`;
      }
    } else { // Under
      if (diff < -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng cả tiền.`;
      } else if (diff === 0.25) {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua cả tiền.`;
      }
    }
  }
  else {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else if (diff < 0) {
      outcome = isUnder ? 'correct' : 'incorrect';
    } else {
      outcome = 'refund';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}.`;
  }

  return { outcome, reason };
}

// Logic chấm điểm tổng hợp
function evaluateAllBets(pred, actualScore, actualCorners, actualCards, homeTeam, awayTeam) {
  const aHome = actualScore.home;
  const aAway = actualScore.away;
  const totalGoals = aHome + aAway;

  // 1. Chấm 1X2
  const actualOutcome = aHome > aAway ? 'Home' : (aHome < aAway ? 'Away' : 'Draw');
  const isCorrect_1x2 = (pred.recommendation_1x2 === actualOutcome) ? 1 : 0;

  // 2. Chấm Tài Xỉu bàn thắng (Over/Under ou_line)
  const ouEval = evaluateAsianOu(pred.recommendation_ou, totalGoals, pred.ou_line);
  let isCorrect_ou = 0;
  if (ouEval.outcome === 'correct') isCorrect_ou = 1;
  if (ouEval.outcome === 'refund') isCorrect_ou = 2;

  // 3. Chấm BTTS
  const recBttsLower = (pred.recommendation_btts || '').toLowerCase();
  const actualBtts = (aHome > 0 && aAway > 0) ? 'yes' : 'no';
  let isCorrect_btts = 0;
  if (recBttsLower.includes('yes') && actualBtts === 'yes') isCorrect_btts = 1;
  if (recBttsLower.includes('no') && actualBtts === 'no') isCorrect_btts = 1;

  // 4. Chấm Corners
  let isCorrect_corners = null;
  let cornersEval = { outcome: 'n/a', reason: 'Không có dữ liệu phạt góc thực tế.' };
  if (actualCorners !== null && actualCorners !== undefined) {
    cornersEval = evaluateAsianOu(pred.recommendation_corners, actualCorners, pred.corners_line);
    isCorrect_corners = cornersEval.outcome === 'correct' ? 1 : (cornersEval.outcome === 'refund' ? 2 : 0);
  }

  // 5. Chấm Cards
  let isCorrect_cards = null;
  let cardsEval = { outcome: 'n/a', reason: 'Không có dữ liệu thẻ phạt thực tế.' };
  if (actualCards !== null && actualCards !== undefined) {
    cardsEval = evaluateAsianOu(pred.recommendation_cards, actualCards, pred.cards_line);
    isCorrect_cards = cardsEval.outcome === 'correct' ? 1 : (cardsEval.outcome === 'refund' ? 2 : 0);
  }

  // 6. Chấm Handicap
  const handicapEval = evaluateHandicap(pred.recommendation_handicap, aHome, aAway, homeTeam, awayTeam);
  let isCorrect_handicap = 0;
  if (handicapEval.outcome === 'correct') isCorrect_handicap = 1;
  if (handicapEval.outcome === 'refund') isCorrect_handicap = 2;

  const evalDetails = {
    oneXTwo: {
      outcome: isCorrect_1x2 === 1 ? 'correct' : 'incorrect',
      reason: `Kết quả thực tế là ${aHome}-${aAway}. Dự đoán tỷ số: ${pred.predicted_home_score}-${pred.predicted_away_score} (Khuyến nghị 1X2: ${pred.recommendation_1x2}).`
    },
    overUnder: ouEval,
    handicap: handicapEval,
    btts: {
      outcome: isCorrect_btts === 1 ? 'correct' : 'incorrect',
      reason: `Cả hai đội ghi bàn thực tế: ${actualBtts === 'yes' ? 'Có' : 'Không'}. Khuyến nghị: ${pred.recommendation_btts || 'N/A'}.`
    },
    corners: cornersEval,
    cards: cardsEval
  };

  return {
    isCorrect_1x2,
    isCorrect_ou,
    isCorrect_btts,
    isCorrect_corners,
    isCorrect_cards,
    isCorrect_handicap,
    evalDetails
  };
}

async function run() {
  const dbPath = path.resolve('worldcup_predictions.db');
  console.log('🔄 Đang kết nối tới database tại:', dbPath);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Đảm bảo các cột kèo động tồn tại trong database
  console.log('🛠️ Kiểm tra và nâng cấp schema database...');
  try {
    await db.exec(`ALTER TABLE predictions ADD COLUMN ou_line REAL DEFAULT 2.5`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE predictions ADD COLUMN corners_line REAL DEFAULT 8.5`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE predictions ADD COLUMN cards_line REAL DEFAULT 3.5`);
  } catch (e) {}

  // Lấy danh sách tất cả các dự đoán
  const predictions = await db.all("SELECT * FROM predictions");
  console.log(`📊 Đang xử lý ${predictions.length} bản ghi dự đoán...`);

  let processedCount = 0;
  let regradedCount = 0;
  
  // Biến thống kê tỷ lệ đúng trước/sau
  let statsBefore = { total: 0, ou: 0, corners: { correct: 0, total: 0 }, cards: { correct: 0, total: 0 } };
  let statsAfter = { total: 0, ou: 0, corners: { correct: 0, total: 0 }, cards: { correct: 0, total: 0 } };

  for (const pred of predictions) {
    // 1. Trích xuất mốc cược động bằng Regex từ văn bản khuyến nghị
    const ou_line = extractLine(pred.recommendation_ou, 2.5);
    const corners_line = extractLine(pred.recommendation_corners, 8.5);
    const cards_line = extractLine(pred.recommendation_cards, 3.5);

    // Cập nhật mốc cược động vào DB trước
    await db.run(
      `UPDATE predictions SET ou_line = ?, corners_line = ?, cards_line = ? WHERE id = ?`,
      [ou_line, corners_line, cards_line, pred.id]
    );
    processedCount++;

    // 2. Chấm điểm lại nếu trận đấu đã kết thúc
    if (pred.actual_home_score !== null && pred.actual_away_score !== null) {
      // Trích xuất góc và thẻ phạt thực tế từ JSON bet_evaluation_details cũ
      let actualCorners = null;
      let actualCards = null;
      let modelUsed = 'Dự phòng / Mock';

      if (pred.bet_evaluation_details) {
        try {
          const oldDetails = JSON.parse(pred.bet_evaluation_details);
          modelUsed = oldDetails.modelUsed || 'Dự phòng / Mock';

          // Trích xuất góc thực tế từ lý do sử dụng bộ lọc thông minh mới
          if (oldDetails.corners && oldDetails.corners.reason) {
            actualCorners = parseCornersFromReason(oldDetails.corners.reason);
          }
          // Trích xuất thẻ thực tế từ lý do sử dụng bộ lọc thông minh mới
          if (oldDetails.cards && oldDetails.cards.reason) {
            actualCards = parseCardsFromReason(oldDetails.cards.reason);
          }
        } catch (e) {
          console.warn(`      ⚠️ Lỗi parse JSON ở bản ghi ID ${pred.id}`);
        }
      }

      // Lưu trữ chỉ số để thống kê trước regrade
      statsBefore.total++;
      if (pred.is_correct_ou === 1) statsBefore.ou++;
      if (pred.is_correct_corners !== null && pred.is_correct_corners !== undefined) {
        statsBefore.corners.total++;
        if (pred.is_correct_corners === 1) statsBefore.corners.correct++;
      }
      if (pred.is_correct_cards !== null && pred.is_correct_cards !== undefined) {
        statsBefore.cards.total++;
        if (pred.is_correct_cards === 1) statsBefore.cards.correct++;
      }

      // Chạy logic chấm điểm mới
      const result = evaluateAllBets(
        { ...pred, ou_line, corners_line, cards_line },
        { home: pred.actual_home_score, away: pred.actual_away_score },
        actualCorners,
        actualCards,
        pred.home_team,
        pred.away_team
      );

      const dbEvalDetails = {
        ...result.evalDetails,
        summary: pred.bet_evaluation_details ? (JSON.parse(pred.bet_evaluation_details).summary || '') : '',
        modelUsed
      };

      // Cập nhật lại kết quả chấm điểm vào DB
      await db.run(
        `UPDATE predictions 
         SET is_correct = ?, 
             is_correct_ou = ?, 
             is_correct_handicap = ?, 
             is_correct_btts = ?,
             is_correct_corners = ?,
             is_correct_cards = ?,
             bet_evaluation_details = ? 
         WHERE id = ?`,
        [
          result.isCorrect_1x2,
          result.isCorrect_ou,
          result.isCorrect_handicap,
          result.isCorrect_btts,
          result.isCorrect_corners,
          result.isCorrect_cards,
          JSON.stringify(dbEvalDetails),
          pred.id
        ]
      );

      regradedCount++;

      // Lưu trữ chỉ số sau regrade
      statsAfter.total++;
      if (result.isCorrect_ou === 1) statsAfter.ou++;
      if (result.isCorrect_corners !== null) {
        statsAfter.corners.total++;
        if (result.isCorrect_corners === 1) statsAfter.corners.correct++;
      }
      if (result.isCorrect_cards !== null) {
        statsAfter.cards.total++;
        if (result.isCorrect_cards === 1) statsAfter.cards.correct++;
      }
    }
  }

  console.log(`\n🎉 HOÀN THÀNH MIGRATION & REGRADE LỊCH SỬ!`);
  console.log(`- Tổng số bản ghi đã cập nhật mốc kèo động: ${processedCount}/${predictions.length}`);
  console.log(`- Tổng số trận đã kết thúc được chấm điểm lại (regraded): ${regradedCount}`);

  // In bảng so sánh tỷ lệ chính xác
  console.log(`\n📊 BẢNG SO SÁNH ĐỘ CHÍNH XÁC KÈO (TRƯỚC VS SAU TỐI ƯU KÈO ĐỘNG):`);
  console.log(`------------------------------------------------------------`);
  console.log(`Loại kèo          | Trước tối ưu (Mốc cứng) | Sau tối ưu (Kèo động)`);
  console.log(`------------------------------------------------------------`);
  
  const ouPctBefore = ((statsBefore.ou / statsBefore.total) * 100).toFixed(1);
  const ouPctAfter = ((statsAfter.ou / statsAfter.total) * 100).toFixed(1);
  console.log(`Tài Xỉu Bàn Thắng | ${statsBefore.ou}/${statsBefore.total} (${ouPctBefore}%)             | ${statsAfter.ou}/${statsAfter.total} (${ouPctAfter}%)`);
  
  const cornersPctBefore = statsBefore.corners.total > 0 ? ((statsBefore.corners.correct / statsBefore.corners.total) * 100).toFixed(1) : '0.0';
  const cornersPctAfter = statsAfter.corners.total > 0 ? ((statsAfter.corners.correct / statsAfter.corners.total) * 100).toFixed(1) : '0.0';
  console.log(`Tài Xỉu Phạt Góc  | ${statsBefore.corners.correct}/${statsBefore.corners.total} (${cornersPctBefore}%)             | ${statsAfter.corners.correct}/${statsAfter.corners.total} (${cornersPctAfter}%)`);
  
  const cardsPctBefore = statsBefore.cards.total > 0 ? ((statsBefore.cards.correct / statsBefore.cards.total) * 100).toFixed(1) : '0.0';
  const cardsPctAfter = statsAfter.cards.total > 0 ? ((statsAfter.cards.correct / statsAfter.cards.total) * 100).toFixed(1) : '0.0';
  console.log(`Tài Xỉu Thẻ Phạt  | ${statsBefore.cards.correct}/${statsBefore.cards.total} (${cardsPctBefore}%)             | ${statsAfter.cards.correct}/${statsAfter.cards.total} (${cardsPctAfter}%)`);
  console.log(`------------------------------------------------------------`);

  await db.close();
}

run().catch(err => console.error(err));
