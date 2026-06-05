import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import fixturesData from '@/data/fixtures.json';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng để tự động cập nhật kết quả.' },
        { status: 400 }
      );
    }

    // 1. Phân tích danh sách API Keys giống như trong predict API
    const apiKeysList = [];
    if (process.env.GEMINI_API_KEY) {
      apiKeysList.push(process.env.GEMINI_API_KEY.trim());
    }
    if (process.env.GEMINI_API_KEYS) {
      const splitKeys = process.env.GEMINI_API_KEYS.split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      apiKeysList.push(...splitKeys);
    }
    const numberedKeys = Object.keys(process.env)
      .filter((key) => key.startsWith('GEMINI_API_KEY_'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('GEMINI_API_KEY_', ''), 10);
        const numB = parseInt(b.replace('GEMINI_API_KEY_', ''), 10);
        return numA - numB;
      });
    numberedKeys.forEach((key) => {
      if (process.env[key]) {
        apiKeysList.push(process.env[key].trim());
      }
    });
    const apiKeys = Array.from(new Set(apiKeysList));

    // 2. Tìm thông tin Fixture để lấy ngày và địa điểm
    let matchDate = null;
    let matchVenue = null;
    if (matchId) {
      const fixture = fixturesData.fixtures.find((f) => f.id === matchId);
      if (fixture) {
        matchDate = fixture.date;
        matchVenue = fixture.venue;
      }
    }

    // 3. Mở database để tìm bản ghi dự đoán gần nhất
    const db = await getDB();
    let predictionRecord = null;
    if (matchId) {
      predictionRecord = await db.get(
        'SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1',
        [matchId]
      );
    }
    if (!predictionRecord) {
      predictionRecord = await db.get(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? ORDER BY id DESC LIMIT 1',
        [homeTeam, awayTeam]
      );
    }

    if (!predictionRecord) {
      return NextResponse.json(
        { error: 'Không tìm thấy bản ghi dự đoán cho cặp đấu này để chấm điểm.' },
        { status: 404 }
      );
    }

    // 4. CHẾ ĐỘ GIẢ LẬP (MOCK MODE) khi không có API Key
    if (apiKeys.length === 0) {
      console.warn('Chạy Auto-Update ở chế độ giả lập (Mock Mode) do thiếu API Key.');
      
      const currentTime = new Date('2026-06-05T23:42:17+07:00'); // Lấy mốc thời gian hệ thống cung cấp
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
      
      const pHome = predictionRecord.predicted_home_score;
      const pAway = predictionRecord.predicted_away_score;
      
      const predictedOutcome = pHome > pAway ? 'home' : pHome < pAway ? 'away' : 'draw';
      const actualOutcome = mockHomeScore > mockAwayScore ? 'home' : mockHomeScore < mockAwayScore ? 'away' : 'draw';
      
      const isCorrect_1x2 = predictedOutcome === actualOutcome ? 1 : 0;
      
      // Đánh giá Tài Xỉu
      const totalGoals = mockHomeScore + mockAwayScore;
      const recOu = (predictionRecord.recommendation_ou || '').toLowerCase();
      let isCorrect_ou = 0;
      if (recOu.includes('over 2.5') && totalGoals > 2.5) isCorrect_ou = 1;
      if (recOu.includes('under 2.5') && totalGoals < 2.5) isCorrect_ou = 1;

      // Đánh giá Chấp (Kèo Châu Á)
      let isCorrect_handicap = 0; // Đơn giản hóa trong mock
      if (isCorrect_1x2) isCorrect_handicap = 1;

      const evalDetails = {
        oneXTwo: {
          outcome: isCorrect_1x2 === 1 ? 'correct' : 'incorrect',
          reason: `Kết quả thực tế là ${mockHomeScore}-${mockAwayScore}. Bạn dự đoán ${pHome}-${pAway}.`
        },
        overUnder: {
          outcome: isCorrect_ou === 1 ? 'correct' : 'incorrect',
          reason: `Tổng bàn thắng thực tế là ${totalGoals} quả. Dự đoán của bạn: ${predictionRecord.recommendation_ou}.`
        },
        handicap: {
          outcome: isCorrect_handicap === 1 ? 'correct' : 'incorrect',
          reason: `Đánh giá kèo chấp dựa trên kết quả ${mockHomeScore}-${mockAwayScore}.`
        },
        summary: `[Mock AI Grounding] Trận đấu kết thúc với tỷ số ${mockHomeScore}-${mockAwayScore}. AI đã chấm điểm các kèo tự động thành công.`
      };

      await db.run(
        `UPDATE predictions 
         SET actual_home_score = ?, 
             actual_away_score = ?, 
             is_correct = ?, 
             is_correct_ou = ?, 
             is_correct_handicap = ?, 
             bet_evaluation_details = ? 
         WHERE id = ?`,
        [
          mockHomeScore,
          mockAwayScore,
          isCorrect_1x2,
          isCorrect_ou,
          isCorrect_handicap,
          JSON.stringify(evalDetails),
          predictionRecord.id
        ]
      );

      return NextResponse.json({
        success: true,
        status: 'finished',
        actualScore: { home: mockHomeScore, away: mockAwayScore },
        betEvaluations: evalDetails,
        isMock: true,
        message: 'Đã tự động giả lập kết quả thực tế và chấm điểm AI thành công.'
      });
    }

    // 5. CHẾ ĐỘ REAL MODE: Gọi Gemini AI cùng Search Grounding
    const prompt = `Hãy tìm kiếm kết quả tỷ số thực tế và trạng thái của trận đấu bóng đá giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}
${matchDate ? `Ngày diễn ra dự kiến: ${matchDate}` : ''}
${matchVenue ? `Địa điểm/Sân vận động: ${matchVenue}` : ''}

Nhiệm vụ của bạn:
1. Sử dụng công cụ Tìm kiếm Google (Google Search) để quét kết quả từ các nguồn chính thức và uy tín nhất như FIFA.com, ESPN, Livescore, Flashscore, v.v.
2. Trả về kết quả thực tế của trận đấu (tỷ số thực tế) và chấm điểm tự động các dự đoán kèo sau:
   - Kèo châu Âu (1X2) dự đoán: "${predictionRecord.recommendation_1x2}"
   - Kèo tài xỉu 2.5 dự đoán: "${predictionRecord.recommendation_ou}"
   - Kèo chấp châu Á dự đoán: "${predictionRecord.recommendation_handicap}"

Dự đoán tỷ số ban đầu của AI: ${predictionRecord.predicted_home_score} - ${predictionRecord.predicted_away_score}

Trả về một chuỗi JSON thô duy nhất có dạng cấu trúc sau:
{
  "status": "<'finished' nếu trận đấu đã kết thúc và có tỷ số thực tế, 'not_started' nếu trận đấu chưa diễn ra tại thời điểm hiện tại của bạn, 'postponed' nếu trận đấu bị hoãn>",
  "actualScore": {
    "home": <số bàn thắng thực tế của đội nhà, số nguyên hoặc null nếu trận chưa diễn ra>,
    "away": <số bàn thắng thực tế của đội khách, số nguyên hoặc null nếu trận chưa diễn ra>
  },
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
    }
  },
  "summary": "<Tóm tắt so sánh ngắn gọn giữa các dự đoán của AI và kết quả diễn ra thực tế của trận đấu>"
}

Chú ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModel = MODELS[modelIdx];
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const currentKey = apiKeys[keyIdx];
        try {
          console.log(`[Auto-Update] Gọi model ${currentModel} bằng API Key #${keyIdx + 1}/${apiKeys.length}...`);
          const ai = new GoogleGenAI({ apiKey: currentKey });
          
          const response = await ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              abortSignal: AbortSignal.timeout(15000), // 15s timeout
            },
          });
          
          callResult = {
            response,
            modelUsed: currentModel,
            keyIndexUsed: keyIdx
          };
          break;
        } catch (err) {
          console.warn(`[Auto-Update] Lỗi khi gọi model ${currentModel} với Key #${keyIdx + 1}:`, err.message);
          lastError = err;
        }
      }
      if (callResult) break;
    }

    if (!callResult) {
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const { response, modelUsed } = callResult;
    const text = response.text;
    let updateResultData;

    const cleanJsonText = (rawText) => {
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n/, '');
        cleaned = cleaned.replace(/\n```$/, '');
      }
      return cleaned.trim();
    };

    try {
      updateResultData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      console.error('Lỗi parse JSON kết quả cập nhật:', text);
      return NextResponse.json(
        { error: 'Dữ liệu phân tích kết quả trả về từ AI không đúng định dạng JSON.', raw: text },
        { status: 500 }
      );
    }

    // 6. Xử lý kết quả từ AI
    if (updateResultData.status === 'finished' && updateResultData.actualScore) {
      const aHome = parseInt(updateResultData.actualScore.home, 10);
      const aAway = parseInt(updateResultData.actualScore.away, 10);
      
      const evalData = updateResultData.betEvaluations || {};
      
      const isCorrect_1x2 = evalData.oneXTwo?.outcome === 'correct' ? 1 : 0;
      const isCorrect_ou = evalData.overUnder?.outcome === 'correct' ? 1 : 0;
      const isCorrect_handicap = evalData.handicap?.outcome === 'correct' ? 1 : (evalData.handicap?.outcome === 'refund' ? 2 : 0);

      // Cập nhật kết quả thực tế và chấm điểm vào cơ sở dữ liệu SQLite
      await db.run(
        `UPDATE predictions 
         SET actual_home_score = ?, 
             actual_away_score = ?, 
             is_correct = ?, 
             is_correct_ou = ?, 
             is_correct_handicap = ?, 
             bet_evaluation_details = ? 
         WHERE id = ?`,
        [
          aHome,
          aAway,
          isCorrect_1x2,
          isCorrect_ou,
          isCorrect_handicap,
          JSON.stringify({
            oneXTwo: evalData.oneXTwo || { outcome: 'n/a', reason: '' },
            overUnder: evalData.overUnder || { outcome: 'n/a', reason: '' },
            handicap: evalData.handicap || { outcome: 'n/a', reason: '' },
            summary: updateResultData.summary || ''
          }),
          predictionRecord.id
        ]
      );

      return NextResponse.json({
        success: true,
        status: 'finished',
        actualScore: { home: aHome, away: aAway },
        betEvaluations: evalData,
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
