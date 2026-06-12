import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { searchInternet } from '@/lib/search';
import { callGroqModel } from '@/lib/groq';
import fixturesData from '@/data/fixtures.json';
import fs from 'fs';
import path from 'path';


function evaluateHandicap(recommendation, aHome, aAway, homeTeam, awayTeam, handicapLine = null) {
  if (!recommendation) return { outcome: 'n/a', reason: 'Không có thông tin kèo cược chấp.' };
  const lowerRec = recommendation.toLowerCase();
  let selectedTeam = '';
  
  if (lowerRec.includes('home') || lowerRec.includes(homeTeam.toLowerCase())) {
    selectedTeam = 'home';
  } else if (lowerRec.includes('away') || lowerRec.includes(awayTeam.toLowerCase())) {
    selectedTeam = 'away';
  } else {
    return { outcome: 'n/a', reason: `Không xác định được đội chọn từ kèo: ${recommendation}` };
  }
  
  let handicapValue = 0.0;
  let hasLine = false;
  if (handicapLine !== null && handicapLine !== undefined && handicapLine !== '') {
    handicapValue = parseFloat(handicapLine);
    hasLine = true;
  } else {
    const numMatch = recommendation.match(/[-+]?\d+(\.\d+)?/);
    if (!numMatch) {
      return { outcome: 'n/a', reason: `Không tìm thấy tỷ lệ chấp từ kèo: ${recommendation}` };
    }
    handicapValue = parseFloat(numMatch[0]);
  }
  
  let netDiff = 0;
  if (hasLine) {
    // Nếu sử dụng handicapLine tĩnh từ DB (cố định mốc chấp cho Home)
    if (selectedTeam === 'home') {
      netDiff = aHome - aAway + handicapValue;
    } else {
      netDiff = aAway - aHome - handicapValue;
    }
  } else {
    // Fallback nếu parse từ recommendation (AI tự đưa ra dấu chấp tương ứng đội chọn)
    if (selectedTeam === 'home') {
      netDiff = aHome - aAway + handicapValue;
    } else {
      netDiff = aAway - aHome + handicapValue;
    }
  }
  
  let outcome = 'incorrect';
  let reason = '';
  if (netDiff > 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng cả tiền (Mốc cược: ${handicapValue}).`;
  } else if (netDiff === 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng nửa tiền (Mốc cược: ${handicapValue}).`;
  } else if (netDiff === 0) {
    outcome = 'refund';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} hòa tiền (refund).`;
  } else if (netDiff === -0.25) {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua nửa tiền (Mốc cược: ${handicapValue}).`;
  } else {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua cả tiền (Mốc cược: ${handicapValue}).`;
  }
  return { outcome, reason };
}

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
        outcome = 'correct'; // Thắng nửa tiền
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
        outcome = 'correct'; // Thắng nửa tiền
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
        outcome = 'incorrect'; // Thua nửa tiền
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

function evaluateBetOutcome(rec1x2, recOu, recHandicap, recBtts, recCorners, recCards, predictedScore, aHome, aAway, actualCorners, actualCards, homeTeam, awayTeam, ouLine = 2.5, cornersLine = 8.5, cardsLine = 3.5, handicapLine = 0.0) {
  const pHome = predictedScore.home;
  const pAway = predictedScore.away;

  // 1. Chấm 1X2
  const actualOutcome = aHome > aAway ? 'Home' : (aHome < aAway ? 'Away' : 'Draw');
  const isCorrect_1x2 = (rec1x2 === actualOutcome) ? 1 : 0;
  
  // 2. Chấm Tài Xỉu
  const totalGoals = aHome + aAway;
  const ouEval = evaluateAsianOu(recOu, totalGoals, ouLine);
  let isCorrect_ou = 0;
  if (ouEval.outcome === 'correct') isCorrect_ou = 1;
  if (ouEval.outcome === 'refund') isCorrect_ou = 2;

  // 3. Chấm BTTS
  const recBttsLower = (recBtts || '').toLowerCase();
  const actualBtts = (aHome > 0 && aAway > 0) ? 'yes' : 'no';
  let isCorrect_btts = 0;
  if (recBttsLower.includes('yes') && actualBtts === 'yes') isCorrect_btts = 1;
  if (recBttsLower.includes('no') && actualBtts === 'no') isCorrect_btts = 1;

  // 4. Chấm Corners
  let isCorrect_corners = null;
  let cornersEval = { outcome: 'n/a', reason: 'Không có dữ liệu phạt góc thực tế.' };
  if (actualCorners !== null && actualCorners !== undefined) {
    cornersEval = evaluateAsianOu(recCorners, actualCorners, cornersLine);
    isCorrect_corners = cornersEval.outcome === 'correct' ? 1 : (cornersEval.outcome === 'refund' ? 2 : 0);
  }

  // 5. Chấm Cards
  let isCorrect_cards = null;
  let cardsEval = { outcome: 'n/a', reason: 'Không có dữ liệu thẻ phạt thực tế.' };
  if (actualCards !== null && actualCards !== undefined) {
    cardsEval = evaluateAsianOu(recCards, actualCards, cardsLine);
    isCorrect_cards = cardsEval.outcome === 'correct' ? 1 : (cardsEval.outcome === 'refund' ? 2 : 0);
  }

  // 6. Chấm Handicap
  const handicapEval = evaluateHandicap(recHandicap, aHome, aAway, homeTeam, awayTeam, handicapLine);
  let isCorrect_handicap = 0;
  if (handicapEval.outcome === 'correct') isCorrect_handicap = 1;
  if (handicapEval.outcome === 'refund') isCorrect_handicap = 2;

  const evalDetails = {
    oneXTwo: {
      outcome: isCorrect_1x2 === 1 ? 'correct' : 'incorrect',
      reason: `Kết quả thực tế là ${aHome}-${aAway}. Bạn dự đoán tỷ số ${pHome}-${pAway} (khuyến nghị ${rec1x2}).`
    },
    overUnder: ouEval,
    handicap: handicapEval,
    btts: {
      outcome: isCorrect_btts === 1 ? 'correct' : 'incorrect',
      reason: `Cả hai đội ghi bàn thực tế: ${actualBtts === 'yes' ? 'Có' : 'Không'}. Khuyến nghị của bạn: ${recBtts || 'N/A'}.`
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

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId, force } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng để tự động cập nhật kết quả.' },
        { status: 400 }
      );
    }

    let db = null;
    let apiKeys = [];
    let MODELS = [];
    let geminiKeys = [];
    let groqKeys = [];

    // Mở cơ sở dữ liệu SQLite trước để lấy cấu hình
    try {
      db = await getDB();
      
      // Đọc các API Keys hoạt động từ DB
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      groqKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'groq').map(row => row.key_value.trim())));
      apiKeys = geminiKeys; // Dành cho tương thích ngược Mock Mode
      
      // Đọc các AI Models hoạt động từ DB theo độ ưu tiên
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      MODELS = activeModelsRows.map(row => ({
        name: row.model_name.trim(),
        provider: row.provider ? row.provider.trim().toLowerCase() : 'gemini'
      }));
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // 2. Tìm thông tin Fixture để lấy ngày và địa điểm
    let matchDate = null;
    let matchVenue = null;
    let isTest = false;
    
    let fixture = null;
    if (matchId) {
      fixture = fixturesData.fixtures.find((f) => f.id === matchId);
    }
    if (!fixture) {
      fixture = fixturesData.fixtures.find(
        (f) => f.homeTeam === homeTeam && f.awayTeam === awayTeam
      );
    }
    
    if (fixture) {
      matchDate = fixture.date;
      matchVenue = fixture.venue;
      isTest = !!fixture.isTest;
    }

    // 3. Mở database để tìm các bản ghi dự đoán chưa chấm điểm và bản ghi gần nhất làm mẫu
    if (!db) db = await getDB();
    let sampleRecord = null;
    if (matchId) {
      sampleRecord = await db.get(
        'SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1',
        [matchId]
      );
    }
    if (!sampleRecord) {
      sampleRecord = await db.get(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? ORDER BY id DESC LIMIT 1',
        [homeTeam, awayTeam]
      );
    }

    if (!sampleRecord) {
      return NextResponse.json(
        { error: 'Không tìm thấy bản ghi dự đoán cho cặp đấu này để chấm điểm.' },
        { status: 404 }
      );
    }

    // Tìm tất cả các bản ghi chưa được cập nhật kết quả thực tế của trận đấu này
    let pendingPredictions = [];
    if (matchId) {
      pendingPredictions = await db.all(
        'SELECT * FROM predictions WHERE match_id = ? AND actual_home_score IS NULL',
        [matchId]
      );
    }
    if (pendingPredictions.length === 0) {
      pendingPredictions = await db.all(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? AND actual_home_score IS NULL',
        [homeTeam, awayTeam]
      );
    }

    // Nếu không có bản ghi nào chưa chấm
    if (pendingPredictions.length === 0) {
      if (force === true) {
        // Force Update: Lấy lại toàn bộ cược của trận đấu này để cập nhật đè
        if (matchId) {
          pendingPredictions = await db.all(
            'SELECT * FROM predictions WHERE match_id = ?',
            [matchId]
          );
        } else {
          pendingPredictions = await db.all(
            'SELECT * FROM predictions WHERE home_team = ? AND away_team = ?',
            [homeTeam, awayTeam]
          );
        }
      } else {
        // Mặc định: Giữ nguyên logic cũ cập nhật cho bản ghi mẫu gần nhất
        pendingPredictions = [sampleRecord];
      }
    }

    // 4. CHẾ ĐỘ GIẢ LẬP (MOCK MODE) khi không có API Key hoặc Model hoạt động
    if (apiKeys.length === 0 || MODELS.length === 0) {
      console.log(`\n💡 [MOCK MODE - AUTO UPDATE] Không có API Key hoặc Model hoạt động trong DB. Chạy giả lập chấm điểm cho: ${homeTeam} vs ${awayTeam}`);

      const currentTime = new Date(); // Lấy thời gian thực của hệ thống
      let isFuture = false;
      if (matchDate) {
        const fixtureTime = new Date(`${matchDate}T12:00:00`);
        if (fixtureTime > currentTime) {
          isFuture = true;
        }
      }

      if (isFuture) {
        return NextResponse.json({
          success: false,
          status: 'not_started',
          message: `Trận đấu giữa ${homeTeam} và ${awayTeam} chưa diễn ra (Ngày thi đấu: ${matchDate}). Không thể tự động lấy kết quả thực tế.`,
          isMock: true
        });
      }

      // Giả lập kết quả cho trận đấu đã qua hoặc trận đấu tự do
      const mockHomeScore = (homeTeam.length + 2) % 4; // Bán ngẫu nhiên từ tên đội
      const mockAwayScore = (awayTeam.length + 1) % 3;
      const mockCorners = (homeTeam.length * 3 + awayTeam.length * 2) % 6 + 6;
      const mockCards = (homeTeam.length + awayTeam.length) % 5 + 1;

      // Chạy vòng lặp cập nhật cho tất cả các bản ghi pending
      let mockEvalDetails = null;
      for (const pred of pendingPredictions) {
        const evalResults = evaluateBetOutcome(
          pred.recommendation_1x2,
          pred.recommendation_ou,
          pred.recommendation_handicap,
          pred.recommendation_btts,
          pred.recommendation_corners,
          pred.recommendation_cards,
          { home: pred.predicted_home_score, away: pred.predicted_away_score },
          mockHomeScore,
          mockAwayScore,
          mockCorners,
          mockCards,
          homeTeam,
          awayTeam,
          pred.ou_line || 2.5,
          pred.corners_line || 8.5,
          pred.cards_line || 3.5,
          pred.handicap_line || 0.0
        );

        const evalDetails = {
          ...evalResults.evalDetails,
          summary: `[Mock AI Grounding] Trận đấu kết thúc với tỷ số ${mockHomeScore}-${mockAwayScore}, phạt góc ${mockCorners} quả, thẻ phạt ${mockCards} thẻ. AI đã chấm điểm các kèo tự động thành công.`,
          modelUsed: 'Dự phòng / Mock'
        };

        if (!mockEvalDetails) {
          mockEvalDetails = evalDetails;
        }

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
            mockHomeScore,
            mockAwayScore,
            evalResults.isCorrect_1x2,
            evalResults.isCorrect_ou,
            evalResults.isCorrect_handicap,
            evalResults.isCorrect_btts,
            evalResults.isCorrect_corners,
            evalResults.isCorrect_cards,
            JSON.stringify(evalDetails),
            pred.id
          ]
        );
      }

      // Cập nhật fixtures.json
      try {
        const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
        if (fs.existsSync(fixturesFilePath)) {
          const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
          const fixtureIndex = fileData.fixtures.findIndex(
            (f) => f.id === sampleRecord.match_id || (f.homeTeam === homeTeam && f.awayTeam === awayTeam)
          );
          if (fixtureIndex !== -1) {
            fileData.fixtures[fixtureIndex].actualHomeScore = mockHomeScore;
            fileData.fixtures[fixtureIndex].actualAwayScore = mockAwayScore;
            fs.writeFileSync(fixturesFilePath, JSON.stringify(fileData, null, 2), 'utf8');
            console.log(`🟢 [fixtures.json - MOCK] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${mockHomeScore}-${mockAwayScore}`);
          }
        }
      } catch (fsError) {
        console.error('Lỗi khi cập nhật fixtures.json:', fsError);
      }

      return NextResponse.json({
        success: true,
        status: 'finished',
        actualScore: { home: mockHomeScore, away: mockAwayScore },
        betEvaluations: mockEvalDetails,
        isMock: true,
        modelUsed: 'Dự phòng / Mock',
        message: 'Đã tự động giả lập kết quả thực tế và chấm điểm AI thành công.'
      });
    }

    // Xác định ngày thi đấu thực tế trên internet (Lấy trực tiếp từ ngày của fixture trong hệ thống)
    let searchDateStr = '';
    if (matchDate) {
      const [yearStr, monthStr, dayStr] = matchDate.split('-');
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIndex = parseInt(monthStr, 10) - 1;
      const monthName = months[monthIndex] || 'June';
      const dayNum = parseInt(dayStr, 10);
      searchDateStr = `${monthName} ${dayNum}, ${yearStr}`;
    }

    const systemTimeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    // 5. CHẾ ĐỘ REAL MODE: Gọi Gemini AI cùng Search Grounding
    const prompt = `Hãy phân tích kết quả tỷ số thực tế và trạng thái của trận đấu bóng đá giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}
${matchDate ? `Ngày diễn ra trận đấu: ${matchDate} (${searchDateStr})` : ''}
${matchVenue ? `Địa điểm/Sân vận động: ${matchVenue}` : ''}
Thời điểm hiện tại của hệ thống: ${systemTimeStr} (Sử dụng mốc thời gian này để đối chiếu với thời gian diễn ra trận đấu thực tế).

Hãy sử dụng thông tin kết quả tra cứu từ internet được cung cấp dưới đây về trận đấu thực tế diễn ra vào ngày ${searchDateStr || 'gần đây nhất'}. Hãy lấy kết quả thực tế của trận đấu đó (tỉ số, phạt góc, thẻ phạt) để chấm điểm và trả về trạng thái "finished".

Nhiệm vụ của bạn:
1. Phân tích thông tin tìm kiếm từ internet được cung cấp dưới đây để tìm kết quả thực tế của trận đấu diễn ra vào ngày ${searchDateStr || 'gần đây nhất'}.
2. Trả về kết quả thực tế của trận đấu (tỷ số thực tế, số quả phạt góc, số thẻ phạt) và chấm điểm tự động các dự đoán kèo sau:
   - Kèo châu Âu (1X2) dự đoán: "${sampleRecord.recommendation_1x2}"
   - Kèo tài xỉu 2.5 dự đoán: "${sampleRecord.recommendation_ou}"
   - Kèo chấp châu Á dự đoán: "${sampleRecord.recommendation_handicap}"
   - Kèo cả hai đội ghi bàn (BTTS) dự đoán: "${sampleRecord.recommendation_btts || 'N/A'}"
   - Kèo phạt góc dự đoán: "${sampleRecord.recommendation_corners || 'N/A'}"
   - Kèo thẻ phạt dự đoán: "${sampleRecord.recommendation_cards || 'N/A'}"

Dự đoán tỷ số ban đầu của AI: ${sampleRecord.predicted_home_score} - ${sampleRecord.predicted_away_score}

Trả về một chuỗi JSON thô duy nhất có dạng cấu trúc sau:
{
  "status": "<'finished' nếu trận đấu đã kết thúc và có tỷ số thực tế, 'not_started' nếu trận đấu chưa diễn ra tại thời điểm hiện tại của bạn, 'postponed' nếu trận đấu bị hoãn>",
  "actualScore": {
    "home": <số bàn thắng thực tế của đội nhà, số nguyên hoặc null nếu trận chưa diễn ra>,
    "away": <số bàn thắng thực tế của đội khách, số nguyên hoặc null nếu trận chưa diễn ra>
  },
  "actualCorners": <tổng số quả phạt góc thực tế của cả 2 đội tuyển, số nguyên hoặc null nếu không tìm thấy dữ liệu>,
  "actualCards": <tổng số thẻ phạt thực tế của cả 2 đội tuyển, số nguyên hoặc null nếu không tìm thấy dữ liệu>,
  "betEvaluations": {
    "oneXTwo": {
      "outcome": "<'correct' nếu dự đoán đúng kèo châu Âu, 'incorrect' nếu sai, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do đúng/sai dựa trên tỉ số thực tế>"
    },
    "overUnder": {
      "outcome": "<'correct' nếu dự đoán đúng kèo Tài hoặc Xỉu 2.5, 'incorrect' nếu sai, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do đúng/sai dựa trên tổng bàn thắng>"
    },
    "handicap": {
      "outcome": "<'correct' nếu dự đoán kèo chấp đúng, 'incorrect' nếu sai, 'refund' nếu hòa tiền kèo chấp, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do thắng/thua kèo chấp dựa trên tỉ số thực tế và tỷ lệ chấp>"
    },
    "btts": {
      "outcome": "<'correct' nếu dự đoán đúng cả hai đội cùng ghi bàn hay không, 'incorrect' nếu sai, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do đúng/sai dựa trên bàn thắng hai đội>"
    },
    "corners": {
      "outcome": "<'correct' nếu dự đoán đúng tổng phạt góc Over/Under, 'incorrect' nếu sai, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do đúng/sai dựa trên tổng số quả phạt góc thực tế quét được>"
    },
    "cards": {
      "outcome": "<'correct' nếu dự đoán đúng tổng thẻ phạt Over/Under, 'incorrect' nếu sai, 'n/a' nếu không có dữ liệu>",
      "reason": "<giải thích lý do đúng/sai dựa trên tổng số thẻ phạt thực tế quét được>"
    }
  },
  "summary": "<Tóm tắt so sánh ngắn gọn giữa các dự đoán của AI và kết quả diễn ra thực tế của trận đấu (gồm tỉ số, phạt góc, thẻ phạt)>"
}

Chú ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;
    // 4.5 Thực hiện tìm kiếm kết quả trận đấu trước khi gọi AI (Custom RAG) - Chia nhỏ theo các kèo
    let searchContext = '';
    try {
      const dateSuffix = searchDateStr ? ` ${searchDateStr}` : '';
      const yearSuffix = matchDate ? ` ${matchDate.split('-')[0]}` : ' 2026';
      
      // Tạo 4 query song song tập trung đúng trọng tâm, bao gồm cả tìm kiếm theo năm để tăng khả năng khớp
      const q1 = `${homeTeam} vs ${awayTeam}${dateSuffix} score goals match result`;
      const q2 = `${homeTeam} vs ${awayTeam} ${yearSuffix} score goals match result`;
      const q3 = `${homeTeam} vs ${awayTeam}${dateSuffix} corners stats`;
      const q4 = `${homeTeam} vs ${awayTeam}${dateSuffix} cards stats`;

      console.log(`   - 🔍 [RAG SEARCH] Chạy 4 truy vấn song song cho kết quả trận đấu...`);
      console.log(`     [Q1]: "${q1}"`);
      console.log(`     [Q2]: "${q2}"`);
      console.log(`     [Q3]: "${q3}"`);
      console.log(`     [Q4]: "${q4}"`);

      const [r1, r2, r3, r4] = await Promise.all([
        searchInternet(q1),
        searchInternet(q2),
        searchInternet(q3),
        searchInternet(q4)
      ]);

      const allResults = [
        { name: 'KẾT QUẢ & TỶ SỐ (Theo ngày)', data: r1 },
        { name: 'KẾT QUẢ & TỶ SỐ (Theo năm)', data: r2 },
        { name: 'PHẠT GÓC (Corners)', data: r3 },
        { name: 'THẺ PHẠT (Cards)', data: r4 }
      ];

      searchContext = `\n--- THÔNG TIN KẾT QUẢ TRA CỨU THỰC TẾ TỪ INTERNET ---`;
      
      allResults.forEach(res => {
        console.log(`   - 🔍 [RAG SEARCH RESULTS] ${res.name} tìm thấy ${res.data?.length || 0} kết quả:`);
        searchContext += `\n\n[Thống kê: ${res.name}]`;
        if (res.data && res.data.length > 0) {
          res.data.forEach((s, idx) => {
            console.log(`       [${idx + 1}] ${s}`);
            searchContext += `\n- ${s}`;
          });
        } else {
          console.log(`       ⚠️ Không tìm thấy kết quả nào.`);
          searchContext += `\n- Không tìm thấy dữ liệu từ internet.`;
        }
      });

    } catch (searchErr) {
      console.warn('⚠️ Lỗi khi tra cứu internet cho kết quả tự động:', searchErr.message);
    }

    const finalPrompt = prompt + '\n' + searchContext;

    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModelObj = MODELS[modelIdx];
      const currentModel = currentModelObj.name;
      const provider = currentModelObj.provider;
      const targetKeys = provider === 'groq' ? groqKeys : geminiKeys;

      for (let keyIdx = 0; keyIdx < targetKeys.length; keyIdx++) {
        const currentKey = targetKeys[keyIdx];
        const startTime = Date.now();
        try {
          console.log(`\n🤖 [AI REQUEST - AUTO UPDATE] Tra cứu kết quả trận đấu: ${homeTeam} vs ${awayTeam}`);
          console.log(`   - Model: ${currentModel} (${provider.toUpperCase()})`);
          console.log(`   - API Key: #${keyIdx + 1}/${targetKeys.length}`);
          console.log(`   - Custom Search RAG: Bật (DuckDuckGo/Tavily)`);
          
          let responseText = '';
          let rawResponse = null;

          if (provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: currentKey });

            rawResponse = await ai.models.generateContent({
              model: currentModel,
              contents: finalPrompt,
              config: {
                abortSignal: AbortSignal.timeout(300000), // 5 minutes timeout
              },
            });
            responseText = rawResponse.text;
          } else if (provider === 'groq') {
            rawResponse = await callGroqModel(currentModel, [currentKey], finalPrompt);
            responseText = rawResponse.response.text;
          } else {
            throw new Error(`Nhà cung cấp không được hỗ trợ: ${provider}`);
          }

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`🟢 [AI RESPONSE - AUTO UPDATE] Thành công!`);
          console.log(`   - Model đã trả lời: ${currentModel}`);
          console.log(`   - Thời gian phản hồi: ${duration}s`);
          console.log(`   - Độ dài phản hồi: ${responseText?.length || 0} ký tự`);

          callResult = {
            response: { text: responseText },
            modelUsed: currentModel,
            keyIndexUsed: keyIdx,
            providerUsed: provider,
            keyUsed: currentKey
          };
          break;
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.warn(`🔴 [AI ERROR - AUTO UPDATE] Thất bại với model ${currentModel} bằng Key #${keyIdx + 1} (sau ${duration}s):`, err.message);
          lastError = err;
        }
      }
      if (callResult) break;
    }

    if (!callResult) {
      console.error('🔴 [AI ERROR - AUTO UPDATE] Tất cả API Key hoặc Model đều thất bại. Chi tiết lỗi cuối:', lastError?.message);
      return NextResponse.json({
        success: false,
        status: 'api_failed',
        message: 'Không có API Key hoặc Model nào hoạt động thành công. Vui lòng cấu hình API Key hợp lệ trong Admin.',
        details: lastError?.message
      });
    }

    const { response, modelUsed } = callResult;
    const text = response.text;
    let updateResultData;

    const cleanJsonText = (rawText) => {
      if (!rawText) return '';
      let cleaned = rawText.trim();
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) cleaned = codeBlockMatch[1].trim();
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      let start = -1;
      let end = -1;
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = cleaned.lastIndexOf('}');
      } else if (firstBracket !== -1) {
        start = firstBracket;
        end = cleaned.lastIndexOf(']');
      }
      if (start !== -1 && end !== -1 && end > start) return cleaned.substring(start, end + 1);
      return cleaned;
    };

    try {
      updateResultData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      return NextResponse.json({ error: 'Dữ liệu phân tích kết quả trả về từ AI không đúng định dạng JSON.', raw: text }, { status: 500 });
    }

    // 6. Xử lý kết quả từ AI
    if (updateResultData.status === 'finished' && updateResultData.actualScore) {
      const aHome = parseInt(updateResultData.actualScore.home, 10);
      const aAway = parseInt(updateResultData.actualScore.away, 10);
      const aCorners = updateResultData.actualCorners !== undefined ? parseInt(updateResultData.actualCorners, 10) : null;
      const aCards = updateResultData.actualCards !== undefined ? parseInt(updateResultData.actualCards, 10) : null;

      // Chạy vòng lặp chấm điểm và cập nhật tất cả các bản ghi pending
      let realEvalDetails = null;
      for (const pred of pendingPredictions) {
        const evalResults = evaluateBetOutcome(
          pred.recommendation_1x2,
          pred.recommendation_ou,
          pred.recommendation_handicap,
          pred.recommendation_btts,
          pred.recommendation_corners,
          pred.recommendation_cards,
          { home: pred.predicted_home_score, away: pred.predicted_away_score },
          aHome,
          aAway,
          aCorners,
          aCards,
          homeTeam,
          awayTeam,
          pred.ou_line || 2.5,
          pred.corners_line || 8.5,
          pred.cards_line || 3.5,
          pred.handicap_line || 0.0
        );

        let finalEvalDetails = evalResults.evalDetails;
        if (pred.id === sampleRecord.id && updateResultData.betEvaluations) {
          const aiEval = updateResultData.betEvaluations;
          finalEvalDetails = {
            oneXTwo: aiEval.oneXTwo || evalResults.evalDetails.oneXTwo,
            overUnder: aiEval.overUnder || evalResults.evalDetails.overUnder,
            handicap: aiEval.handicap || evalResults.evalDetails.handicap,
            btts: aiEval.btts || evalResults.evalDetails.btts,
            corners: aiEval.corners || evalResults.evalDetails.corners,
            cards: aiEval.cards || evalResults.evalDetails.cards
          };
        }

        const dbEvalDetails = {
          ...finalEvalDetails,
          summary: updateResultData.summary || '',
          modelUsed: modelUsed || 'Dự phòng / Mock'
        };

        if (!realEvalDetails) {
          realEvalDetails = dbEvalDetails;
        }

        const isCorrect_1x2 = dbEvalDetails.oneXTwo?.outcome === 'correct' ? 1 : 0;
        const isCorrect_ou = dbEvalDetails.overUnder?.outcome === 'correct' ? 1 : (dbEvalDetails.overUnder?.outcome === 'refund' ? 2 : 0);
        const isCorrect_handicap = dbEvalDetails.handicap?.outcome === 'correct' ? 1 : (dbEvalDetails.handicap?.outcome === 'refund' ? 2 : 0);
        const isCorrect_btts = dbEvalDetails.btts?.outcome === 'correct' ? 1 : 0;
        const isCorrect_corners = dbEvalDetails.corners?.outcome === 'correct' ? 1 : (dbEvalDetails.corners?.outcome === 'refund' ? 2 : (dbEvalDetails.corners?.outcome === 'n/a' ? null : 0));
        const isCorrect_cards = dbEvalDetails.cards?.outcome === 'correct' ? 1 : (dbEvalDetails.cards?.outcome === 'refund' ? 2 : (dbEvalDetails.cards?.outcome === 'n/a' ? null : 0));

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
            isCorrect_1x2,
            isCorrect_ou,
            isCorrect_handicap,
            isCorrect_btts,
            isCorrect_corners,
            isCorrect_cards,
            JSON.stringify(dbEvalDetails),
            pred.id
          ]
        );
      }

      // Cập nhật fixtures.json
      try {
        const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
        if (fs.existsSync(fixturesFilePath)) {
          const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
          const fixtureIndex = fileData.fixtures.findIndex(
            (f) => f.id === sampleRecord.match_id || (f.homeTeam === homeTeam && f.awayTeam === awayTeam)
          );
          if (fixtureIndex !== -1) {
            fileData.fixtures[fixtureIndex].actualHomeScore = aHome;
            fileData.fixtures[fixtureIndex].actualAwayScore = aAway;
            fs.writeFileSync(fixturesFilePath, JSON.stringify(fileData, null, 2), 'utf8');
            console.log(`🟢 [fixtures.json - REAL] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}`);
          }
        }
      } catch (fsError) {
        console.error('Lỗi khi cập nhật fixtures.json:', fsError);
      }

      // --- OPTION 2: SELF-RETROSPECTIVE LESSON GENERATION ---
      const incorrectBets = [];
      const sampleEval = updateResultData.betEvaluations || {};
      if (sampleEval.oneXTwo?.outcome === 'incorrect') incorrectBets.push('1X2 (Thắng/Hòa/Thua)');
      if (sampleEval.overUnder?.outcome === 'incorrect') incorrectBets.push('Tài/Xỉu 2.5');
      if (sampleEval.handicap?.outcome === 'incorrect') incorrectBets.push('Kèo chấp Handicap');
      if (sampleEval.btts?.outcome === 'incorrect') incorrectBets.push('Cả hai đội ghi bàn (BTTS)');
      if (sampleEval.corners?.outcome === 'incorrect') incorrectBets.push('Tài/Xỉu Phạt góc');
      if (sampleEval.cards?.outcome === 'incorrect') incorrectBets.push('Tài/Xỉu Thẻ phạt');

      if (incorrectBets.length > 0 && apiKeys.length > 0) {
        console.log(`🔁 [Self-Retrospective] Phát hiện ${incorrectBets.length} kèo dự đoán sai ở mẫu. Gọi AI viết bài học kinh nghiệm...`);
        try {
          // Kiểm tra xem đã có bài học kinh nghiệm cho trận đấu này chưa để tối ưu hóa API (Rule 14)
          const targetMatchId = sampleRecord.match_id || null;
          let hasLesson = false;
          if (targetMatchId) {
            const existingLesson = await db.get(
              'SELECT id FROM ai_lessons WHERE match_id = ? LIMIT 1',
              [targetMatchId]
            );
            if (existingLesson) {
              hasLesson = true;
              console.log(`ℹ️ [Self-Retrospective] Đã có bài học kinh nghiệm cho trận đấu này trong DB. Bỏ qua.`);
            }
          }

          if (!hasLesson) {
            const lessonPrompt = `
Trận đấu giữa ${homeTeam} và ${awayTeam} kết thúc với tỷ số thực tế là ${aHome}-${aAway}.
Dự đoán ban đầu của bạn là: Tỷ số ${sampleRecord.predicted_home_score}-${sampleRecord.predicted_away_score}.
Các đề xuất kèo bị sai lệch bao gồm: ${incorrectBets.join(', ')}.
Chi tiết phân tích sai lệch: ${updateResultData.summary}

Nhiệm vụ: Hãy viết một bài học kinh nghiệm cực kỳ ngắn gọn (dưới 50 từ) giải thích lý do tại sao mô hình dự đoán sai các kèo này (ví dụ: đánh giá quá cao hàng công, đánh giá sai tính chất thực dụng của giải đấu, bỏ qua tin tức chấn thương...).
Hãy trả về duy nhất nội dung bài học bằng tiếng Việt. Không thêm bất cứ tag hay ký tự dẫn dắt nào. Do NOT include markdown blocks.
`;

            // Tái sử dụng API Key và Model thành công từ bước trước để tránh lỗi Rate Limit / Quota Exceeded (429)
            const successfulKey = callResult.keyUsed;
            const successfulModel = callResult.modelUsed;
            const successfulProvider = callResult.providerUsed;

            let lessonContent = '';
            if (successfulProvider === 'gemini') {
              const aiInstance = new GoogleGenAI({ apiKey: successfulKey });
              const lessonRes = await aiInstance.models.generateContent({
                model: successfulModel,
                contents: lessonPrompt,
                config: { abortSignal: AbortSignal.timeout(15000) }
              });
              lessonContent = lessonRes.text?.trim() || '';
            } else if (successfulProvider === 'groq') {
              const lessonRes = await callGroqModel(successfulModel, [successfulKey], lessonPrompt);
              lessonContent = lessonRes.response?.text?.trim() || '';
            }
            if (lessonContent) {
              console.log(`💾 [Self-Retrospective] Đã tạo bài học: "${lessonContent}"`);
              await db.run(
                `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
                [targetMatchId, homeTeam, incorrectBets.join('/'), lessonContent]
              );
              await db.run(
                `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
                [targetMatchId, awayTeam, incorrectBets.join('/'), lessonContent]
              );
              console.log(`🟢 [Self-Retrospective] Đã lưu bài học vào CSDL.`);
            }
          }
        } catch (lessonErr) {
          console.warn('⚠️ Lỗi khi tự tạo bài học kinh nghiệm AI:', lessonErr.message);
        }
      }

      return NextResponse.json({
        success: true,
        status: 'finished',
        actualScore: { home: aHome, away: aAway },
        betEvaluations: realEvalDetails || {},
        summary: updateResultData.summary,
        modelUsed,
        message: 'Đã tự động lấy kết quả trực tuyến và chấm điểm AI thành công.'
      });
    } else {
      // Trận đấu chưa bắt đầu hoặc bị hoãn
      return NextResponse.json({
        success: false,
        status: updateResultData.status || 'not_started',
        message: updateResultData.summary || `Trận đấu chưa diễn ra hoặc không tìm thấy kết quả thực tế trên internet.`,
        isMock: false
      });
    }

  } catch (error) {
    console.error('Lỗi khi tự động cập nhật kết quả:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi tự động tìm kiếm kết quả', details: error.message },
      { status: 500 }
    );
  }
}
