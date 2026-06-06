import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function evaluatePerformance() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Connecting to database at: ${dbPath}`);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    // Lấy tất cả các dự đoán đã có kết quả thực tế
    const predictions = await db.all(
      `SELECT * FROM predictions 
       WHERE actual_home_score IS NOT NULL`
    );

    console.log(`📊 Tổng số dự đoán đã có kết quả thực tế trong DB: ${predictions.length}\n`);

    if (predictions.length === 0) {
      console.log('⚠️ Không tìm thấy dự đoán nào đã chấm điểm để thống kê.');
      return;
    }

    // Phân loại thành 2 nhóm: Consensus (Đồng thuận đa tác nhân) và Single Model
    const consensusGroup = [];
    const singleGroup = [];

    for (const pred of predictions) {
      const isConsensus = pred.raw_prediction_json && JSON.parse(pred.raw_prediction_json).isConsensus;
      const modelUsed = pred.model_used || '';
      
      if (isConsensus || modelUsed.includes('Critic') || modelUsed.includes('Consensus')) {
        consensusGroup.push(pred);
      } else {
        singleGroup.push(pred);
      }
    }

    console.log(`🔹 Nhóm Model Đơn Lẻ (Single Model): ${singleGroup.length} trận`);
    console.log(`🔸 Nhóm Đồng Thuận Đa Tác Nhân (Consensus Engine): ${consensusGroup.length} trận\n`);

    const calculateMetrics = (group, name) => {
      if (group.length === 0) {
        console.log(`❌ Nhóm ${name} không có dữ liệu để tính toán.`);
        return null;
      }

      let correct1x2 = 0;
      let correctOu = 0;
      let correctHandicap = 0;
      let refundHandicap = 0;
      let correctBtts = 0;
      let correctCorners = 0;
      let correctCards = 0;
      let correctScore = 0;

      // Đếm số trận có dữ liệu kèo phụ
      let bttsTotal = 0;
      let cornersTotal = 0;
      let cardsTotal = 0;

      for (const pred of group) {
        // 1X2
        if (pred.is_correct === 1) correct1x2++;
        // Over/Under
        if (pred.is_correct_ou === 1) correctOu++;
        // Handicap
        if (pred.is_correct_handicap === 1) correctHandicap++;
        if (pred.is_correct_handicap === 2) refundHandicap++;
        // Tỷ số chính xác
        if (pred.predicted_home_score === pred.actual_home_score && pred.predicted_away_score === pred.actual_away_score) {
          correctScore++;
        }
        // BTTS
        if (pred.is_correct_btts !== null && pred.is_correct_btts !== undefined) {
          bttsTotal++;
          if (pred.is_correct_btts === 1) correctBtts++;
        }
        // Corners
        if (pred.is_correct_corners !== null && pred.is_correct_corners !== undefined) {
          cornersTotal++;
          if (pred.is_correct_corners === 1) correctCorners++;
        }
        // Cards
        if (pred.is_correct_cards !== null && pred.is_correct_cards !== undefined) {
          cardsTotal++;
          if (pred.is_correct_cards === 1) correctCards++;
        }
      }

      const total = group.length;
      return {
        name,
        total,
        scoreAcc: ((correctScore / total) * 100).toFixed(1),
        oneXTwoAcc: ((correct1x2 / total) * 100).toFixed(1),
        ouAcc: ((correctOu / total) * 100).toFixed(1),
        handicapAcc: (((correctHandicap + refundHandicap) / total) * 100).toFixed(1), // Tính cả hòa tiền
        bttsAcc: bttsTotal > 0 ? ((correctBtts / bttsTotal) * 100).toFixed(1) : '0.0',
        cornersAcc: cornersTotal > 0 ? ((correctCorners / cornersTotal) * 100).toFixed(1) : '0.0',
        cardsAcc: cardsTotal > 0 ? ((correctCards / cardsTotal) * 100).toFixed(1) : '0.0',
        counts: {
          total, correctScore, correct1x2, correctOu, correctHandicap, refundHandicap, correctBtts, bttsTotal, correctCorners, cornersTotal, correctCards, cardsTotal
        }
      };
    };

    const singleMetrics = calculateMetrics(singleGroup, 'Model Đơn Lẻ');
    const consensusMetrics = calculateMetrics(consensusGroup, 'Consensus (Tối Ưu Hóa)');

    console.log('================================================================================');
    console.log('                     BẢNG SO SÁNH HIỆU SUẤT THỰC TẾ TRÊN DB');
    console.log('================================================================================');
    console.log(`Chỉ số Kèo cược     | Nhóm Model Đơn Lẻ          | Nhóm Consensus (Tối Ưu Hóa)`);
    console.log('--------------------|----------------------------|------------------------------');
    
    if (singleMetrics && consensusMetrics) {
      console.log(`Số trận thống kê     | ${singleMetrics.total} trận                    | ${consensusMetrics.total} trận`);
      console.log(`Đúng Tỉ Số Chính Xác | ${singleMetrics.scoreAcc}% (${singleMetrics.counts.correctScore}/${singleMetrics.total})             | ${consensusMetrics.scoreAcc}% (${consensusMetrics.counts.correctScore}/${consensusMetrics.total})`);
      console.log(`Đúng Kết Quả 1X2     | ${singleMetrics.oneXTwoAcc}% (${singleMetrics.counts.correct1x2}/${singleMetrics.total})            | ${consensusMetrics.oneXTwoAcc}% (${consensusMetrics.counts.correct1x2}/${consensusMetrics.total})`);
      console.log(`Đúng Kèo Tài Xỉu 2.5 | ${singleMetrics.ouAcc}% (${singleMetrics.counts.correctOu}/${singleMetrics.total})             | ${consensusMetrics.ouAcc}% (${consensusMetrics.counts.correctOu}/${consensusMetrics.total})`);
      console.log(`Đúng Kèo Chấp (Asia) | ${singleMetrics.handicapAcc}% (${singleMetrics.counts.correctHandicap + singleMetrics.counts.refundHandicap}/${singleMetrics.total})            | ${consensusMetrics.handicapAcc}% (${consensusMetrics.counts.correctHandicap + consensusMetrics.counts.refundHandicap}/${consensusMetrics.total})`);
      console.log(`Đúng Kèo BTTS        | ${singleMetrics.bttsAcc}% (${singleMetrics.counts.correctBtts}/${singleMetrics.counts.bttsTotal})             | ${consensusMetrics.bttsAcc}% (${consensusMetrics.counts.correctBtts}/${consensusMetrics.counts.bttsTotal})`);
      console.log(`Đúng Kèo Phạt Góc    | ${singleMetrics.cornersAcc}% (${singleMetrics.counts.correctCorners}/${singleMetrics.counts.cornersTotal})             | ${consensusMetrics.cornersAcc}% (${consensusMetrics.counts.correctCorners}/${consensusMetrics.counts.cornersTotal})`);
      console.log(`Đúng Kèo Thẻ Phạt    | ${singleMetrics.cardsAcc}% (${singleMetrics.counts.correctCards}/${singleMetrics.counts.cardsTotal})             | ${consensusMetrics.cardsAcc}% (${consensusMetrics.counts.correctCards}/${consensusMetrics.counts.cardsTotal})`);
    }
    console.log('================================================================================');

    // Thống kê bài học kinh nghiệm tự động rút ra
    const lessonsCount = await db.get('SELECT COUNT(*) as count FROM ai_lessons');
    console.log(`💡 Tổng số bài học kinh nghiệm tự động rút ra (Option 2) trong DB: ${lessonsCount.count} bài học.`);

  } catch (err) {
    console.error('❌ Lỗi thống kê:', err.message);
  } finally {
    await db.close();
  }
}

evaluatePerformance();
