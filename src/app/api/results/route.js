import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, actualHomeScore, actualAwayScore, matchId } = await request.json();

    if (!homeTeam || !awayTeam || actualHomeScore === undefined || actualAwayScore === undefined) {
      return NextResponse.json(
        { error: 'Thiếu thông tin cập nhật kết quả' },
        { status: 400 }
      );
    }

    const db = await getDB();

    // Tìm bản ghi dự đoán gần nhất của cặp đấu này (hoặc theo matchId nếu có)
    let predictionRecord = null;
    if (matchId) {
      predictionRecord = await db.get(
        'SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1',
        [matchId]
      );
    }

    // Nếu không tìm thấy bằng matchId, tìm bằng tên đội
    if (!predictionRecord) {
      predictionRecord = await db.get(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? ORDER BY id DESC LIMIT 1',
        [homeTeam, awayTeam]
      );
    }

    if (!predictionRecord) {
      return NextResponse.json(
        { error: 'Không tìm thấy dữ liệu dự đoán tương ứng trong cơ sở dữ liệu.' },
        { status: 404 }
      );
    }

    // Tính toán xem AI đoán đúng kết quả (Thắng/Hòa/Thua) hay không
    const pHome = predictionRecord.predicted_home_score;
    const pAway = predictionRecord.predicted_away_score;
    const aHome = parseInt(actualHomeScore, 10);
    const aAway = parseInt(actualAwayScore, 10);

    const predictedOutcome = pHome > pAway ? 'home' : pHome < pAway ? 'away' : 'draw';
    const actualOutcome = aHome > aAway ? 'home' : aHome < aAway ? 'away' : 'draw';

    const isCorrect = predictedOutcome === actualOutcome ? 1 : 0;

    // Đánh giá Kèo Tài Xỉu (O/U 2.5)
    const totalGoals = aHome + aAway;
    const recOu = (predictionRecord.recommendation_ou || '').toLowerCase();
    let isCorrectOu = null;
    if (recOu.includes('over') || recOu.includes('tài')) {
      isCorrectOu = totalGoals > 2.5 ? 1 : 0;
    } else if (recOu.includes('under') || recOu.includes('xỉu')) {
      isCorrectOu = totalGoals < 2.5 ? 1 : 0;
    }

    // Đánh giá Kèo Chấp Châu Á
    let isCorrectHandicap = null;
    const recHandicap = (predictionRecord.recommendation_handicap || '');
    const homeSelected = recHandicap.toLowerCase().includes(homeTeam.toLowerCase());
    const awaySelected = recHandicap.toLowerCase().includes(awayTeam.toLowerCase());
    const numberMatch = recHandicap.match(/[-+]?\d*\.?\d+/);

    if (numberMatch && (homeSelected || awaySelected)) {
      const handicapValue = parseFloat(numberMatch[0]);
      if (homeSelected) {
        const diff = aHome + handicapValue - aAway;
        if (diff > 0) isCorrectHandicap = 1;
        else if (diff === 0) isCorrectHandicap = 2; // Refund
        else isCorrectHandicap = 0;
      } else if (awaySelected) {
        const diff = aAway + handicapValue - aHome;
        if (diff > 0) isCorrectHandicap = 1;
        else if (diff === 0) isCorrectHandicap = 2; // Refund
        else isCorrectHandicap = 0;
      }
    }

    // Đánh giá Kèo Cả hai đội ghi bàn (BTTS)
    let isCorrectBtts = null;
    const recBtts = (predictionRecord.recommendation_btts || '').toLowerCase();
    const actualBtts = (aHome > 0 && aAway > 0) ? 'yes' : 'no';
    if (recBtts) {
      if (recBtts.includes(actualBtts)) {
        isCorrectBtts = 1;
      } else {
        isCorrectBtts = 0;
      }
    }

    // Tạo chi tiết đánh giá
    const evalDetails = {
      oneXTwo: {
        outcome: isCorrect === 1 ? 'correct' : 'incorrect',
        reason: `Kết quả thực tế là ${aHome}-${aAway}. AI khuyến nghị: ${predictionRecord.recommendation_1x2 || 'N/A'}.`
      },
      overUnder: {
        outcome: isCorrectOu === null ? 'n/a' : (isCorrectOu === 1 ? 'correct' : 'incorrect'),
        reason: `Tổng số bàn thắng là ${totalGoals}. AI khuyến nghị: ${predictionRecord.recommendation_ou || 'N/A'}.`
      },
      handicap: {
        outcome: isCorrectHandicap === null ? 'n/a' : (isCorrectHandicap === 1 ? 'correct' : (isCorrectHandicap === 2 ? 'refund' : 'incorrect')),
        reason: `Tỷ số ${aHome}-${aAway}. AI khuyến nghị: ${predictionRecord.recommendation_handicap || 'N/A'}.`
      },
      btts: {
        outcome: isCorrectBtts === null ? 'n/a' : (isCorrectBtts === 1 ? 'correct' : 'incorrect'),
        reason: `Cả hai đội ghi bàn thực tế: ${actualBtts === 'yes' ? 'Có' : 'Không'}. AI khuyến nghị: ${predictionRecord.recommendation_btts || 'N/A'}.`
      },
      corners: {
        outcome: 'n/a',
        reason: 'Cập nhật thủ công không có dữ liệu phạt góc.'
      },
      cards: {
        outcome: 'n/a',
        reason: 'Cập nhật thủ công không có dữ liệu thẻ phạt.'
      },
      summary: `Cập nhật thủ công: Trận đấu kết thúc với tỷ số ${aHome}-${aAway}.`
    };

    // Cập nhật kết quả thực tế và điểm số đánh giá vào SQLite
    await db.run(
      `UPDATE predictions 
       SET actual_home_score = ?, 
           actual_away_score = ?, 
           is_correct = ?, 
           is_correct_ou = ?, 
           is_correct_handicap = ?, 
           is_correct_btts = ?,
           is_correct_corners = ?,
           is_correct_cards = ?,
           bet_evaluation_details = ? 
       WHERE id = ?`,
      [
        aHome, 
        aAway, 
        isCorrect, 
        isCorrectOu, 
        isCorrectHandicap, 
        isCorrectBtts,
        null,
        null,
        JSON.stringify(evalDetails), 
        predictionRecord.id
      ]
    );

    // Cập nhật fixtures.json
    try {
      const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
      if (fs.existsSync(fixturesFilePath)) {
        const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
        const fixtureIndex = fileData.fixtures.findIndex(
          (f) => f.id === predictionRecord.match_id || (f.homeTeam === homeTeam && f.awayTeam === awayTeam)
        );
        if (fixtureIndex !== -1) {
          fileData.fixtures[fixtureIndex].actualHomeScore = aHome;
          fileData.fixtures[fixtureIndex].actualAwayScore = aAway;
          fs.writeFileSync(fixturesFilePath, JSON.stringify(fileData, null, 2), 'utf8');
          console.log(`🟢 [fixtures.json - MANUAL] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}`);
        }
      }
    } catch (fsError) {
      console.error('Lỗi khi cập nhật fixtures.json:', fsError);
    }


    return NextResponse.json({
      success: true,
      predictionId: predictionRecord.id,
      predictedScore: { home: pHome, away: pAway },
      actualScore: { home: aHome, away: aAway },
      isCorrect: isCorrect === 1,
      betEvaluations: evalDetails,
      message: 'Cập nhật kết quả trận đấu và chấm điểm AI thành công.'
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật kết quả thực tế:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi cập nhật kết quả', details: error.message },
      { status: 500 }
    );
  }
}
