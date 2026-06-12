import { GoogleGenAI } from '@google/genai';
import { searchInternet } from '@/lib/search';
import { callGroqModel } from '@/lib/groq';
import fixturesData from '@/data/fixtures.json';
import fs from 'fs';
import path from 'path';

// --- CÁC HÀM HELPER ĐÁNH GIÁ KÈO CƯỢC (Được Export để tái sử dụng) ---
export function evaluateHandicap(recommendation, aHome, aAway, homeTeam, awayTeam, handicapLine = null) {
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
    if (selectedTeam === 'home') {
      netDiff = aHome - aAway + handicapValue;
    } else {
      netDiff = aAway - aHome - handicapValue;
    }
  } else {
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

export function evaluateAsianOu(recommendation, actualTotal, line) {
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
    } else {
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
    } else {
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

export function evaluateBetOutcome(rec1x2, recOu, recHandicap, recBtts, recCorners, recCards, predictedScore, aHome, aAway, actualCorners, actualCards, homeTeam, awayTeam, ouLine = 2.5, cornersLine = 8.5, cardsLine = 3.5, handicapLine = 0.0) {
  const pHome = predictedScore.home;
  const pAway = predictedScore.away;

  const actualOutcome = aHome > aAway ? 'Home' : (aHome < aAway ? 'Away' : 'Draw');
  const isCorrect_1x2 = (rec1x2 === actualOutcome) ? 1 : 0;
  
  const totalGoals = aHome + aAway;
  const ouEval = evaluateAsianOu(recOu, totalGoals, ouLine);
  let isCorrect_ou = 0;
  if (ouEval.outcome === 'correct') isCorrect_ou = 1;
  if (ouEval.outcome === 'refund') isCorrect_ou = 2;

  const recBttsLower = (recBtts || '').toLowerCase();
  const actualBtts = (aHome > 0 && aAway > 0) ? 'yes' : 'no';
  let isCorrect_btts = 0;
  if (recBttsLower.includes('yes') && actualBtts === 'yes') isCorrect_btts = 1;
  if (recBttsLower.includes('no') && actualBtts === 'no') isCorrect_btts = 1;

  let isCorrect_corners = null;
  let cornersEval = { outcome: 'n/a', reason: 'Không có dữ liệu phạt góc thực tế.' };
  if (actualCorners !== null && actualCorners !== undefined) {
    cornersEval = evaluateAsianOu(recCorners, actualCorners, cornersLine);
    isCorrect_corners = cornersEval.outcome === 'correct' ? 1 : (cornersEval.outcome === 'refund' ? 2 : 0);
  }

  let isCorrect_cards = null;
  let cardsEval = { outcome: 'n/a', reason: 'Không có dữ liệu thẻ phạt thực tế.' };
  if (actualCards !== null && actualCards !== undefined) {
    cardsEval = evaluateAsianOu(recCards, actualCards, cardsLine);
    isCorrect_cards = cardsEval.outcome === 'correct' ? 1 : (cardsEval.outcome === 'refund' ? 2 : 0);
  }

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

// --- HÀM HELPER CHÍNH CẬP NHẬT KẾT QUẢ ---
export async function updateMatchResult({ homeTeam, awayTeam, matchId, force, db }) {
  try {
    let apiKeys = [];
    let MODELS = [];
    let geminiKeys = [];
    let groqKeys = [];

    // Tải cấu hình API key/models
    try {
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      groqKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'groq').map(row => row.key_value.trim())));
      apiKeys = geminiKeys;
      
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      MODELS = activeModelsRows.map(row => ({
        name: row.model_name.trim(),
        provider: row.provider ? row.provider.trim().toLowerCase() : 'gemini'
      }));
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // 1. Tìm bản ghi dự đoán làm mẫu (Có thể null nếu chưa từng predict)
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

    // 2. Tìm tất cả các cược chưa chấm
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

    // Nếu không có bản ghi nào chưa chấm, kiểm tra cờ force
    if (pendingPredictions.length === 0 && sampleRecord) {
      if (force === true) {
        if (matchId) {
          pendingPredictions = await db.all('SELECT * FROM predictions WHERE match_id = ?', [matchId]);
        } else {
          pendingPredictions = await db.all(
            'SELECT * FROM predictions WHERE home_team = ? AND away_team = ?',
            [homeTeam, awayTeam]
          );
        }
      } else {
        pendingPredictions = [sampleRecord];
      }
    }

    // 3. CHẾ ĐỘ GIẢ LẬP (MOCK MODE) khi không có API key hoạt động
    if (apiKeys.length === 0 || MODELS.length === 0) {
      const currentTime = new Date();
      let isFuture = false;
      const fixture = fixturesData.fixtures.find(f => f.id === (matchId || (sampleRecord ? sampleRecord.match_id : null)) || (f.homeTeam === homeTeam && f.awayTeam === awayTeam));
      if (fixture && fixture.date) {
        const fixtureTime = new Date(`${fixture.date}T12:00:00`);
        if (fixtureTime > currentTime) isFuture = true;
      }

      if (isFuture) {
        return {
          success: false,
          status: 'not_started',
          message: `Trận đấu giữa ${homeTeam} và ${awayTeam} chưa diễn ra. Không thể lấy kết quả thực tế.`,
          isMock: true
        };
      }

      const mockHomeScore = (homeTeam.length + 2) % 4;
      const mockAwayScore = (awayTeam.length + 1) % 3;
      const mockCorners = (homeTeam.length * 3 + awayTeam.length * 2) % 6 + 6;
      const mockCards = (homeTeam.length + awayTeam.length) % 5 + 1;

      if (pendingPredictions.length > 0) {
        for (const pred of pendingPredictions) {
          const evalResults = evaluateBetOutcome(
            pred.recommendation_1x2, pred.recommendation_ou, pred.recommendation_handicap,
            pred.recommendation_btts, pred.recommendation_corners, pred.recommendation_cards,
            { home: pred.predicted_home_score, away: pred.predicted_away_score },
            mockHomeScore, mockAwayScore, mockCorners, mockCards, homeTeam, awayTeam,
            pred.ou_line || 2.5, pred.corners_line || 8.5, pred.cards_line || 3.5, pred.handicap_line || 0.0
          );

          const evalDetails = {
            ...evalResults.evalDetails,
            summary: `[Mock AI Grounding] Trận đấu kết thúc với tỷ số ${mockHomeScore}-${mockAwayScore}, AI đã chấm điểm cược thành công.`,
            modelUsed: 'Dự phòng / Mock'
          };

          await db.run(
            `UPDATE predictions 
             SET actual_home_score = ?, actual_away_score = ?, is_correct = ?, is_correct_ou = ?, 
                 is_correct_handicap = ?, is_correct_btts = ?, is_correct_corners = ?, is_correct_cards = ?, 
                 bet_evaluation_details = ? WHERE id = ?`,
            [mockHomeScore, mockAwayScore, evalResults.isCorrect_1x2, evalResults.isCorrect_ou,
             evalResults.isCorrect_handicap, evalResults.isCorrect_btts, evalResults.isCorrect_corners,
             evalResults.isCorrect_cards, JSON.stringify(evalDetails), pred.id]
          );
        }
      }

      // Cập nhật fixtures.json
      updateFixturesFile(matchId || (sampleRecord ? sampleRecord.match_id : null), homeTeam, awayTeam, mockHomeScore, mockAwayScore);

      return {
        success: true,
        status: 'finished',
        actualScore: { home: mockHomeScore, away: mockAwayScore },
        message: 'Đã giả lập kết quả và chấm điểm thành công.'
      };
    }

    // 4. CHẠY GOOGLE SEARCH GROUNDING RAG
    const q1 = `${homeTeam} vs ${awayTeam} final score result match World Cup 2026`;
    const q2 = `${homeTeam} vs ${awayTeam} match goals actual score 2026`;
    const q3 = `${homeTeam} vs ${awayTeam} corners match stats 2026`;
    const q4 = `${homeTeam} vs ${awayTeam} cards yellow red match stats 2026`;

    let searchContext = '';
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        searchInternet(q1), searchInternet(q2), searchInternet(q3), searchInternet(q4)
      ]);
      const allResults = [
        { name: 'KẾT QUẢ', data: r1 }, { name: 'BÀN THẮNG', data: r2 },
        { name: 'PHẠT GÓC', data: r3 }, { name: 'THẺ PHẠT', data: r4 }
      ];
      searchContext = `\n--- THÔNG TIN KẾT QUẢ TRA CỨU THỰC TẾ TỪ INTERNET ---`;
      allResults.forEach(res => {
        searchContext += `\n\n[Thống kê: ${res.name}]`;
        if (res.data && res.data.length > 0) {
          res.data.forEach(s => { searchContext += `\n- ${s}`; });
        } else {
          searchContext += `\n- Không tìm thấy dữ liệu.`;
        }
      });
    } catch (searchErr) {
      console.warn('⚠️ Lỗi tra cứu RAG:', searchErr.message);
    }

    const prompt = `
Hãy đóng vai trò là Trọng tài AI chấm điểm cược thể thao. Dựa trên dữ liệu tra cứu thực tế từ Internet dưới đây, hãy xác định kết quả thực tế của trận đấu giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}

Hãy trích xuất:
1. Trạng thái trận đấu: "finished" (đã kết thúc hoàn toàn) hoặc "not_started" (chưa đá / hoãn).
2. Tỷ số thực tế: số bàn thắng của Home và Away.
3. Tổng số phạt góc của trận đấu.
4. Tổng số thẻ phạt của trận đấu.
5. So sánh đề xuất cược ban đầu của mô hình tại mẫu cược sau đây và chấm điểm cược "correct" (Đúng), "incorrect" (Sai) hoặc "refund" (Hòa tiền):
Mẫu cược: ${sampleRecord ? JSON.stringify(sampleRecord) : 'Chưa có cược trước đó'}

${searchContext}

Hãy trả về chuỗi JSON thô có cấu trúc chính xác như sau:
{
  "status": "finished",
  "actualScore": { "home": 2, "away": 1 },
  "actualCorners": 9,
  "actualCards": 4,
  "summary": "Mô tả ngắn gọn diễn biến trận đấu và kết quả chấm điểm cược.",
  "betEvaluations": {
    "oneXTwo": { "outcome": "correct", "reason": "Lý do..." },
    "overUnder": { "outcome": "incorrect", "reason": "Lý do..." },
    "handicap": { "outcome": "correct", "reason": "Lý do..." },
    "btts": { "outcome": "incorrect", "reason": "Lý do..." },
    "corners": { "outcome": "correct", "reason": "Lý do..." },
    "cards": { "outcome": "correct", "reason": "Lý do..." }
  }
}
Chỉ trả về JSON thô. Do NOT include markdown blocks.
`;

    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModelObj = MODELS[modelIdx];
      const currentModel = currentModelObj.name;
      const provider = currentModelObj.provider;
      const targetKeys = provider === 'groq' ? groqKeys : geminiKeys;

      for (let keyIdx = 0; keyIdx < targetKeys.length; keyIdx++) {
        const currentKey = targetKeys[keyIdx];
        try {
          let responseText = '';
          if (provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const rawResponse = await ai.models.generateContent({
              model: currentModel,
              contents: prompt,
              config: { abortSignal: AbortSignal.timeout(180000) },
            });
            responseText = rawResponse.text;
          } else if (provider === 'groq') {
            const rawResponse = await callGroqModel(currentModel, [currentKey], prompt);
            responseText = rawResponse.response.text;
          }

          callResult = {
            responseText,
            modelUsed: currentModel,
            providerUsed: provider,
            keyUsed: currentKey
          };
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (callResult) break;
    }

    if (!callResult) {
      return {
        success: false,
        status: 'api_failed',
        message: 'Không có API Key hoặc Model nào hoạt động thành công.',
        details: lastError?.message
      };
    }

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

    const parsedData = JSON.parse(cleanJsonText(callResult.responseText));

    if (parsedData.status === 'finished' && parsedData.actualScore) {
      const aHome = parseInt(parsedData.actualScore.home, 10);
      const aAway = parseInt(parsedData.actualScore.away, 10);
      const aCorners = parsedData.actualCorners !== undefined ? parseInt(parsedData.actualCorners, 10) : null;
      const aCards = parsedData.actualCards !== undefined ? parseInt(parsedData.actualCards, 10) : null;

      let realEvalDetails = null;

      if (pendingPredictions.length > 0) {
        for (const pred of pendingPredictions) {
          const evalResults = evaluateBetOutcome(
            pred.recommendation_1x2, pred.recommendation_ou, pred.recommendation_handicap,
            pred.recommendation_btts, pred.recommendation_corners, pred.recommendation_cards,
            { home: pred.predicted_home_score, away: pred.predicted_away_score },
            aHome, aAway, aCorners, aCards, homeTeam, awayTeam,
            pred.ou_line || 2.5, pred.corners_line || 8.5, pred.cards_line || 3.5, pred.handicap_line || 0.0
          );

          let finalEvalDetails = evalResults.evalDetails;
          if (sampleRecord && pred.id === sampleRecord.id && parsedData.betEvaluations) {
            const aiEval = parsedData.betEvaluations;
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
            summary: parsedData.summary || '',
            modelUsed: callResult.modelUsed
          };

          if (!realEvalDetails) realEvalDetails = dbEvalDetails;

          const isCorrect_1x2 = dbEvalDetails.oneXTwo?.outcome === 'correct' ? 1 : 0;
          const isCorrect_ou = dbEvalDetails.overUnder?.outcome === 'correct' ? 1 : (dbEvalDetails.overUnder?.outcome === 'refund' ? 2 : 0);
          const isCorrect_handicap = dbEvalDetails.handicap?.outcome === 'correct' ? 1 : (dbEvalDetails.handicap?.outcome === 'refund' ? 2 : 0);
          const isCorrect_btts = dbEvalDetails.btts?.outcome === 'correct' ? 1 : 0;
          const isCorrect_corners = dbEvalDetails.corners?.outcome === 'correct' ? 1 : (dbEvalDetails.corners?.outcome === 'refund' ? 2 : (dbEvalDetails.corners?.outcome === 'n/a' ? null : 0));
          const isCorrect_cards = dbEvalDetails.cards?.outcome === 'correct' ? 1 : (dbEvalDetails.cards?.outcome === 'refund' ? 2 : (dbEvalDetails.cards?.outcome === 'n/a' ? null : 0));

          await db.run(
            `UPDATE predictions 
             SET actual_home_score = ?, actual_away_score = ?, is_correct = ?, is_correct_ou = ?, 
                 is_correct_handicap = ?, is_correct_btts = ?, is_correct_corners = ?, is_correct_cards = ?, 
                 bet_evaluation_details = ? WHERE id = ?`,
            [aHome, aAway, isCorrect_1x2, isCorrect_ou, isCorrect_handicap, isCorrect_btts, 
             isCorrect_corners, isCorrect_cards, JSON.stringify(dbEvalDetails), pred.id]
          );
        }
      }

      // Cập nhật fixtures.json
      updateFixturesFile(matchId || (sampleRecord ? sampleRecord.match_id : null), homeTeam, awayTeam, aHome, aAway);

      // --- TỰ ĐỘNG VIẾT BÀI HỌC KINH NGHIỆM ---
      if (sampleRecord) {
        await generateSelfRetrospective({ homeTeam, awayTeam, sampleRecord, aHome, aAway, parsedData, db, callResult, apiKeys });
      }

      return {
        success: true,
        status: 'finished',
        actualScore: { home: aHome, away: aAway },
        actualCorners: aCorners,
        actualCards: aCards,
        betEvaluations: realEvalDetails || parsedData.betEvaluations || {},
        summary: parsedData.summary,
        modelUsed: callResult.modelUsed
      };
    } else {
      return {
        success: false,
        status: parsedData.status || 'not_started',
        message: parsedData.summary || 'Trận đấu chưa bắt đầu hoặc chưa có kết quả.'
      };
    }
  } catch (error) {
    console.error('Lỗi khi cập nhật kết quả trong helper:', error);
    return { success: false, status: 'error', message: error.message };
  }
}

// Helper nhỏ để ghi file fixtures.json
function updateFixturesFile(matchId, homeTeam, awayTeam, aHome, aAway) {
  try {
    const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
    if (fs.existsSync(fixturesFilePath)) {
      const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
      const fixtureIndex = fileData.fixtures.findIndex(
        (f) => f.id === matchId || (f.homeTeam === homeTeam && f.awayTeam === awayTeam)
      );
      if (fixtureIndex !== -1) {
        fileData.fixtures[fixtureIndex].actualHomeScore = aHome;
        fileData.fixtures[fixtureIndex].actualAwayScore = aAway;
        fs.writeFileSync(fixturesFilePath, JSON.stringify(fileData, null, 2), 'utf8');
        console.log(`🟢 [fixtures.json] Đã cập nhật tỉ số: ${aHome}-${aAway}`);
      }
    }
  } catch (fsError) {
    console.error('Lỗi ghi fixtures.json:', fsError);
  }
}

// Helper tự học viết bài học kinh nghiệm
async function generateSelfRetrospective({ homeTeam, awayTeam, sampleRecord, aHome, aAway, parsedData, db, callResult, apiKeys }) {
  const incorrectBets = [];
  const sampleEval = parsedData.betEvaluations || {};
  if (sampleEval.oneXTwo?.outcome === 'incorrect') incorrectBets.push('1X2');
  if (sampleEval.overUnder?.outcome === 'incorrect') incorrectBets.push('Tài/Xỉu 2.5');
  if (sampleEval.handicap?.outcome === 'incorrect') incorrectBets.push('Handicap');
  if (sampleEval.btts?.outcome === 'incorrect') incorrectBets.push('BTTS');
  if (sampleEval.corners?.outcome === 'incorrect') incorrectBets.push('Phạt góc');
  if (sampleEval.cards?.outcome === 'incorrect') incorrectBets.push('Thẻ phạt');

  if (incorrectBets.length > 0 && apiKeys.length > 0) {
    try {
      const targetMatchId = sampleRecord.match_id || null;
      if (targetMatchId) {
        const existingLesson = await db.get('SELECT id FROM ai_lessons WHERE match_id = ? LIMIT 1', [targetMatchId]);
        if (existingLesson) return;
      }

      const lessonPrompt = `
Trận đấu ${homeTeam} vs ${awayTeam} kết thúc ${aHome}-${aAway}. Dự đoán ban đầu là tỷ số ${sampleRecord.predicted_home_score}-${sampleRecord.predicted_away_score}.
Các kèo cược bị sai: ${incorrectBets.join(', ')}. Chi tiết sai lệch: ${parsedData.summary}
Nhiệm vụ: Viết bài học kinh nghiệm siêu ngắn (dưới 50 từ) bằng tiếng Việt giải thích lý do dự đoán sai. Trả về text thô. Do NOT include markdown blocks.
`;
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
        await db.run(
          `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
          [targetMatchId, homeTeam, incorrectBets.join('/'), lessonContent]
        );
        await db.run(
          `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
          [targetMatchId, awayTeam, incorrectBets.join('/'), lessonContent]
        );
      }
    } catch (e) {
      console.warn('⚠️ Lỗi sinh bài học kinh nghiệm:', e.message);
    }
  }
}
