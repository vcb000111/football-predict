import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng' },
        { status: 400 }
      );
    }

    // 1. Phân tích danh sách API Keys từ biến môi trường (Hỗ trợ nhiều định dạng)
    const apiKeysList = [];
    
    // Đọc key đơn lẻ
    if (process.env.GEMINI_API_KEY) {
      apiKeysList.push(process.env.GEMINI_API_KEY.trim());
    }
    
    // Đọc danh sách keys phân tách bằng dấu phẩy
    if (process.env.GEMINI_API_KEYS) {
      const splitKeys = process.env.GEMINI_API_KEYS.split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      apiKeysList.push(...splitKeys);
    }
    
    // Đọc các keys đánh số dạng GEMINI_API_KEY_1, GEMINI_API_KEY_2, ...
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

    let db = null;
    let feedbackPromptSection = '';
    let historicalAccuracy = null;

    // 2. Mở cơ sở dữ liệu SQLite
    try {
      db = await getDB();
      
      // 3. Tải lịch sử dự đoán trước đây của 2 đội đã có kết quả thực tế để làm Feedback Loop (Học máy)
      const history = await db.all(
        `SELECT * FROM predictions 
         WHERE (home_team = ? OR away_team = ? OR home_team = ? OR away_team = ?) 
           AND actual_home_score IS NOT NULL 
         ORDER BY id DESC LIMIT 5`,
        [homeTeam, awayTeam, awayTeam, homeTeam]
      );

      if (history && history.length > 0) {
        let correctCount = 0;
        let historyTexts = history.map((record) => {
          const isCorrectStr = record.is_correct === 1 ? 'ĐÚNG' : 'SAI';
          if (record.is_correct === 1) correctCount++;
          
          return `- Trận [${record.home_team} vs ${record.away_team}]: Bạn dự đoán tỷ số ${record.predicted_home_score}-${record.predicted_away_score}. Thực tế diễn ra: ${record.actual_home_score}-${record.actual_away_score} (Dự đoán kết quả 1X2: ${isCorrectStr}).`;
        }).join('\n');

        historicalAccuracy = {
          total: history.length,
          correct: correctCount,
          rate: Math.round((correctCount / history.length) * 100)
        };

        feedbackPromptSection = `
--- LỊCH SỬ DỰ ĐOÁN & SAI SỐ TRƯỚC ĐÂY CỦA BẠN (HỌC MÁY NGỮ CẢNH) ---
Hệ thống đã lưu lại các dự đoán trước đây của bạn đối với 2 đội bóng này. Hãy phân tích kỹ các lỗi dự đoán trước đây để tránh lặp lại sai lầm và tăng độ chính xác lần này:
${historyTexts}
Tỷ lệ dự đoán đúng kết quả chung cuộc (1X2) gần đây của bạn với 2 đội này là: ${historicalAccuracy.rate}% (${correctCount}/${history.length} trận đúng).
Chú ý: Nếu trước đây bạn từng đánh giá quá cao/thấp đội bóng nào, hãy điều chỉnh lại lập luận chiến thuật và phân bổ xác suất trong JSON dự đoán mới cho phù hợp.
`;
      }
    } catch (dbError) {
      console.error('Lỗi khi truy vấn lịch sử SQLite:', dbError);
    }

    // 4. Nếu không cấu hình API Key nào, chạy chế độ giả lập (Mock Mode)
    if (apiKeys.length === 0) {
      console.warn('Không tìm thấy GEMINI_API_KEY hay GEMINI_API_KEYS. Chạy Mock Mode.');
      const mockData = getMockPrediction(homeTeam, awayTeam, true, 'GEMINI_API_KEY chưa được thiết lập. Đang chạy ở chế độ giả lập.', historicalAccuracy);
      
      // Lưu dữ liệu giả lập vào SQLite để người dùng vẫn test được Database & Học máy
      if (db) {
        try {
          await db.run(
            `INSERT INTO predictions (
              match_id, home_team, away_team, 
              predicted_home_score, predicted_away_score, 
              win_prob_home, win_prob_draw, win_prob_away,
              recommendation_1x2, recommendation_ou, recommendation_handicap
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              matchId || null, homeTeam, awayTeam,
              mockData.predictedScore.home, mockData.predictedScore.away,
              mockData.winProbability.home, mockData.winProbability.draw, mockData.winProbability.away,
              mockData.bets.oneXTwo.recommendation, mockData.bets.overUnder.recommendation, mockData.bets.handicap.recommendation
            ]
          );
        } catch (saveError) {
          console.error('Lỗi khi lưu dự đoán Mock vào SQLite:', saveError);
        }
      }
      
      return NextResponse.json(mockData);
    }

    // 5. Soạn thảo Prompt chi tiết gửi cho Gemini
    const prompt = `Bạn là một chuyên gia phân tích bóng đá thế giới hàng đầu, chuyên gia soi kèo bóng đá cho kỳ World Cup 2026.
Hãy đưa ra nhận định, dự đoán kết quả và soi kèo cho trận đấu giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}
${feedbackPromptSection}
Yêu cầu phân tích và trả về kết quả dưới định dạng JSON duy nhất theo cấu trúc sau đây:
{
  "winProbability": {
    "home": <phần trăm thắng của đội nhà, số nguyên từ 0 đến 100>,
    "draw": <phần trăm hòa, số nguyên từ 0 đến 100>,
    "away": <phần trăm thắng của đội khách, số nguyên từ 0 đến 100>
  },
  "predictedScore": {
    "home": <số bàn thắng dự đoán của đội nhà>,
    "away": <số bàn thắng dự đoán của đội khách>
  },
  "analysis": {
    "homeTeam": "<phân tích ngắn gọn khoảng 3-4 câu về sức mạnh, phong độ gần đây, chấn thương của đội nhà>",
    "awayTeam": "<phân tích ngắn gọn khoảng 3-4 câu về sức mạnh, phong độ gần đây, chấn thương của đội khách>",
    "keyFactors": [
      "<Yếu tố then chốt quyết định trận đấu 1>",
      "<Yếu tố then chốt quyết định trận đấu 2>",
      "<Yếu tố then chốt quyết định trận đấu 3>"
    ],
    "predictionReasoning": "<Lý giải chi tiết tại sao đưa ra dự đoán tỷ số và kết quả trận đấu này dựa trên dữ liệu phong độ và lịch sử đối đầu>"
  },
  "bets": {
    "oneXTwo": {
      "recommendation": "<Dự đoán kèo châu Âu: Chọn Home, Away hoặc Draw>",
      "reason": "<Lý giải ngắn gọn lý do chọn kèo này>"
    },
    "overUnder": {
      "recommendation": "<Dự đoán kèo tài xỉu: Chọn Over 2.5 hoặc Under 2.5>",
      "reason": "<Lý giải ngắn gọn lý do chọn kèo này dựa trên khả năng tấn công/phòng ngự>"
    },
    "handicap": {
      "recommendation": "<Dự đoán kèo châu Á: Ví dụ '${homeTeam} -0.5' hoặc '${awayTeam} +0.5'>",
      "reason": "<Lý giải ngắn gọn tại sao chọn kèo chấp này>"
    }
  }
}

Chú ý: Tổng phần trăm trong "winProbability" (home + draw + away) phải bằng chính xác 100. Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    // 6. Thực hiện xoay vòng API Keys & Models (Key / Model Rotation & Retry)
    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModel = MODELS[modelIdx];
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const currentKey = apiKeys[keyIdx];
        try {
          console.log(`Đang gọi model ${currentModel} bằng API Key #${keyIdx + 1}/${apiKeys.length}...`);
          const ai = new GoogleGenAI({ apiKey: currentKey });
          
          const response = await ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              abortSignal: AbortSignal.timeout(15000), // Timeout sau 15 giây để tăng khả năng hoàn thành Search Grounding
            },
          });
          
          callResult = {
            response,
            modelUsed: currentModel,
            keyIndexUsed: keyIdx
          };
          break; // Tìm thấy key hoạt động, thoát vòng lặp key
        } catch (err) {
          console.warn(`Lỗi khi gọi model ${currentModel} với Key #${keyIdx + 1}:`, err.message);
          lastError = err;
          // Tiếp tục thử key kế tiếp
        }
      }
      if (callResult) break; // Đã chạy thành công, thoát vòng lặp model
    }

    if (!callResult) {
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const { response, modelUsed, keyIndexUsed } = callResult;
    const text = response.text;
    let predictionData;

    // Làm sạch thẻ bao ngoài markdown JSON
    const cleanJsonText = (rawText) => {
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n/, '');
        cleaned = cleaned.replace(/\n```$/, '');
      }
      return cleaned.trim();
    };

    try {
      predictionData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      console.error('Lỗi parse JSON từ Gemini:', text);
      return NextResponse.json(
        getMockPrediction(
          homeTeam,
          awayTeam,
          false,
          'Dữ liệu AI trả về không đúng định dạng. Đang sử dụng thuật toán dự phòng.',
          historicalAccuracy
        )
      );
    }

    // Lấy nguồn từ grounding metadata
    let sources = [];
    try {
      const candidates = response.candidates;
      const groundingMetadata = candidates?.[0]?.groundingMetadata;
      const searchChunks = groundingMetadata?.groundingChunks || [];
      sources = searchChunks
        .map((chunk) => {
          if (chunk.web) {
            return {
              title: chunk.web.title || 'Tin tức liên quan',
              uri: chunk.web.uri,
            };
          }
          return null;
        })
        .filter(Boolean);
    } catch (sourceError) {
      console.error('Lỗi lấy nguồn từ metadata:', sourceError);
    }

    // 7. Lưu dự đoán thành công vào SQLite
    if (db) {
      try {
        await db.run(
          `INSERT INTO predictions (
            match_id, home_team, away_team, 
            predicted_home_score, predicted_away_score, 
            win_prob_home, win_prob_draw, win_prob_away,
            recommendation_1x2, recommendation_ou, recommendation_handicap
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            matchId || null, homeTeam, awayTeam,
            predictionData.predictedScore.home, predictionData.predictedScore.away,
            predictionData.winProbability.home, predictionData.winProbability.draw, predictionData.winProbability.away,
            predictionData.bets.oneXTwo.recommendation, predictionData.bets.overUnder.recommendation, predictionData.bets.handicap.recommendation
          ]
        );
      } catch (saveError) {
        console.error('Lỗi lưu dự đoán thật vào SQLite:', saveError);
      }
    }

    return NextResponse.json({
      ...predictionData,
      sources,
      isMock: false,
      modelUsed,
      keyIndexUsed,
      historicalAccuracy
    });
  } catch (error) {
    console.error('Lỗi máy chủ trong API dự đoán:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xử lý dự đoán', details: error.message },
      { status: 500 }
    );
  }
}

function getMockPrediction(homeTeam, awayTeam, isMissingKey = false, customReason = '', historicalAccuracy = null) {
  const hash = (homeTeam.length + awayTeam.length) % 3;
  let winProb, score;

  if (hash === 0) {
    winProb = { home: 45, draw: 30, away: 25 };
    score = { home: 2, away: 1 };
  } else if (hash === 1) {
    winProb = { home: 20, draw: 30, away: 50 };
    score = { home: 0, away: 2 };
  } else {
    winProb = { home: 35, draw: 35, away: 30 };
    score = { home: 1, away: 1 };
  }

  return {
    winProbability: winProb,
    predictedScore: score,
    analysis: {
      homeTeam: `Đội tuyển ${homeTeam} có lực lượng tương đối ổn định với phong độ tốt ở các trận gần đây. Lợi thế về thời gian làm quen sân cỏ và thể lực giúp họ chủ động nhập cuộc tốt hơn.`,
      awayTeam: `Đội tuyển ${awayTeam} có tinh thần kỷ luật chiến thuật cao. Dù phải thi đấu xa nhà, họ vẫn là đối thủ nguy hiểm nhờ lối đá phản công chớp nhoáng.`,
      keyFactors: [
        `Tập trung tuyến giữa: Đội kiểm soát trung lộ tốt hơn sẽ tạo ra nhịp đấu mong muốn.`,
        `Khoảnh khắc sơ hở phòng ngự: Trận đấu chặt chẽ thường được định đoạt bởi 1 lỗi cá nhân.`,
        `Khả năng tận dụng cơ hội cố định: Đá phạt và phạt góc là vũ khí then chốt.`
      ],
      predictionReasoning: customReason || `Phân tích tương quan thực tế. ${homeTeam} thiên về kiểm soát bóng áp đặt, còn ${awayTeam} phòng ngự phản công. Dự đoán trận đấu sẽ có ít bàn thắng và mang tính chiến thuật cao.`
    },
    bets: {
      oneXTwo: {
        recommendation: winProb.home > winProb.away ? 'Home' : winProb.away > winProb.home ? 'Away' : 'Draw',
        reason: `Dựa vào khả năng kiểm soát bóng của bên có tỷ lệ thắng cao hơn.`
      },
      overUnder: {
        recommendation: (score.home + score.away) >= 2 ? 'Over 2.5' : 'Under 2.5',
        reason: 'Lối chơi chặt chẽ, thận trọng ở các trận vòng bảng mở màn.'
      },
      handicap: {
        recommendation: winProb.home > winProb.away ? `${homeTeam} -0.25` : `${awayTeam} +0.25`,
        reason: 'Đánh giá tỷ lệ chấp tối thiểu tương ứng phong độ.'
      }
    },
    sources: [
      { title: 'FIFA World Cup 2026 Official Site', uri: 'https://www.fifa.com/fifaworldcup/en' },
      { title: 'ESPN Soccer Analysis', uri: 'https://www.espn.com/soccer/' }
    ],
    isMock: true,
    warning: isMissingKey ? 'Vui lòng điền GEMINI_API_KEY hoặc GEMINI_API_KEYS vào file `.env.local` để chạy dự đoán thật.' : null,
    historicalAccuracy
  };
}
