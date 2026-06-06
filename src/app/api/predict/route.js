import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { searchInternet } from '@/lib/search';
import { calculateMatchPoisson, runMonteCarloSimulation } from '@/lib/poisson';
import fs from 'fs';
import path from 'path';

// Hàm helper gọi đơn lẻ một model AI phục vụ cho Consensus Engine
// Biến lưu trữ Cool Down của các model bị lỗi Quota 429 hoặc 503
const modelCoolDown = {};

// Hàm helper gọi đơn lẻ một model AI phục vụ cho Consensus Engine
async function callSingleModel(model, apiKeys, prompt) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(35000), // Timeout sau 35 giây
        },
      });
      return {
        response,
        modelUsed: model,
        keyIndexUsed: keyIdx
      };
    } catch (err) {
      console.warn(`⚠️ [AI Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      
      const errMsg = err.message || '';
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
        console.warn(`🛑 Model ${model} gặp lỗi Quota/Unavailable. Đưa vào Cool Down 5 phút.`);
        modelCoolDown[model] = Date.now() + 5 * 60 * 1000;
      }
      
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId, forceRefresh } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng' },
        { status: 400 }
      );
    }

    let db = null;
    let apiKeys = [];
    let MODELS = [];

    // Mở SQLite lấy cấu hình hoạt động
    try {
      db = await getDB();
      const activeKeysRows = await db.all("SELECT key_value FROM api_keys WHERE status = 1");
      apiKeys = Array.from(new Set(activeKeysRows.map(row => row.key_value.trim())));
      const activeModelsRows = await db.all("SELECT model_name FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      MODELS = activeModelsRows.map(row => row.model_name.trim());
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // --- OPTION 1: TRUY VẤN DỮ LIỆU ĐỊNH LƯỢNG (ELO & FIFA RANK) TỪ SQLITE ---
    let homeTeamData = { fifa_rank: 50, elo_rating: 1600, recent_form: "D,D,D,D,D", avg_goals_scored: 1.2, avg_goals_conceded: 1.2, key_players: "Chưa có thông tin", tactical_analysis: "Đang cập nhật" };
    let awayTeamData = { fifa_rank: 50, elo_rating: 1600, recent_form: "D,D,D,D,D", avg_goals_scored: 1.2, avg_goals_conceded: 1.2, key_players: "Chưa có thông tin", tactical_analysis: "Đang cập nhật" };

    if (db) {
      try {
        const homeStats = await db.get("SELECT * FROM teams WHERE team_name = ?", [homeTeam]);
        const awayStats = await db.get("SELECT * FROM teams WHERE team_name = ?", [awayTeam]);
        if (homeStats) homeTeamData = homeStats;
        if (awayStats) awayTeamData = awayStats;
      } catch (err) {
        console.error('Lỗi khi đọc chỉ số đội tuyển từ SQLite:', err);
      }
    }

    // --- KIỂM TRA CACHE DỰ ĐOÁN (24 GIỜ & CHỈ SỐ CHƯA ĐỔI) ---
    if (!forceRefresh && db) {
      try {
        let cacheRecord = null;
        if (matchId) {
          cacheRecord = await db.get(
            "SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1",
            [matchId]
          );
        }
        if (!cacheRecord) {
          cacheRecord = await db.get(
            "SELECT * FROM predictions WHERE home_team = ? AND away_team = ? ORDER BY id DESC LIMIT 1",
            [homeTeam, awayTeam]
          );
        }

        if (cacheRecord) {
          const utcStr = cacheRecord.created_at.replace(' ', 'T') + 'Z';
          const cacheTime = new Date(utcStr).getTime();
          const nowTime = Date.now();
          const ageInHours = (nowTime - cacheTime) / (1000 * 60 * 60);

          if (ageInHours <= 24) {
            const homeUpdated = homeTeamData.last_updated ? new Date(homeTeamData.last_updated.replace(' ', 'T') + 'Z').getTime() : 0;
            const awayUpdated = awayTeamData.last_updated ? new Date(awayTeamData.last_updated.replace(' ', 'T') + 'Z').getTime() : 0;

            if (homeUpdated < cacheTime && awayUpdated < cacheTime) {
              console.log(`⚡ [CACHE HIT] Tìm thấy cache hợp lệ cho ${homeTeam} vs ${awayTeam} (tuổi: ${ageInHours.toFixed(2)}h)`);
              if (cacheRecord.raw_prediction_json) {
                try {
                  const cachedPayload = JSON.parse(cacheRecord.raw_prediction_json);
                  return NextResponse.json({
                    ...cachedPayload,
                    isCached: true,
                    cachedAt: cacheRecord.created_at
                  });
                } catch (e) {
                  console.error('Lỗi parse raw_prediction_json, bỏ qua cache:', e);
                }
              }
              
              // Tương thích ngược nếu thiếu raw_prediction_json
              const cachedPayload = {
                winProbability: {
                  home: cacheRecord.win_prob_home,
                  draw: cacheRecord.win_prob_draw,
                  away: cacheRecord.win_prob_away
                },
                predictedScore: {
                  home: cacheRecord.predicted_home_score,
                  away: cacheRecord.predicted_away_score
                },
                analysis: {
                  homeTeam: `${homeTeam} có chỉ số sức mạnh tốt hơn trong các dữ liệu ELO.`,
                  awayTeam: `${awayTeam} sẽ phải nỗ lực thi đấu chặt chẽ.`,
                  keyFactors: [
                    "Phong độ thi đấu gần đây của hai đội",
                    "Động lực thi đấu tại vòng bảng",
                    "Các nhân tố ngôi sao có thể gây đột biến"
                  ],
                  predictionReasoning: "Kết quả dự đoán được tải nhanh từ bộ nhớ đệm (Cache SQLite) do chỉ số của hai đội bóng không thay đổi trong vòng 24 giờ qua."
                },
                bets: {
                  oneXTwo: { recommendation: cacheRecord.recommendation_1x2, reason: "Dữ liệu từ cache" },
                  overUnder: { recommendation: cacheRecord.recommendation_ou, reason: "Dữ liệu từ cache" },
                  handicap: { recommendation: cacheRecord.recommendation_handicap, reason: "Dữ liệu từ cache" },
                  btts: { recommendation: cacheRecord.recommendation_btts || "No", reason: "Dữ liệu từ cache" },
                  corners: { recommendation: cacheRecord.recommendation_corners || "Under 8.5 Corners", reason: "Dữ liệu từ cache" },
                  cards: { recommendation: cacheRecord.recommendation_cards || "Under 3.5 Cards", reason: "Dữ liệu từ cache" }
                },
                isCached: true,
                cachedAt: cacheRecord.created_at
              };
              return NextResponse.json(cachedPayload);
            } else {
              console.log(`⚡ [CACHE BYPASS] Có cache nhưng đã hết hạn do chỉ số đội bóng mới được cập nhật.`);
            }
          } else {
            console.log(`⚡ [CACHE BYPASS] Có cache nhưng đã quá 24h (tuổi: ${ageInHours.toFixed(2)}h).`);
          }
        }
      } catch (cacheErr) {
        console.error('Lỗi xử lý cache dự đoán:', cacheErr);
      }
    }

    // Đọc địa điểm (venue) từ fixtures.json để xác định lợi thế sân nhà
    let venue = '';
    if (matchId) {
      try {
        const fixturesPath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
        if (fs.existsSync(fixturesPath)) {
          const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
          const match = fixturesData.fixtures?.find(f => f.id === matchId);
          if (match) {
            venue = match.venue || '';
          }
        }
      } catch (err) {
        console.error('Lỗi khi đọc venue từ fixtures.json:', err);
      }
    }

    // Xác định lợi thế sân nhà thực tế của World Cup 2026 (Mexico, Canada, USA đá tại nước họ)
    let isHomeAdvantage = false;
    const venueLower = venue.toLowerCase();
    if (homeTeam === 'Mexico' && (venueLower.includes('mexico') || venueLower.includes('guadalajara') || venueLower.includes('monterrey'))) {
      isHomeAdvantage = true;
    } else if (homeTeam === 'Canada' && (venueLower.includes('toronto') || venueLower.includes('vancouver'))) {
      isHomeAdvantage = true;
    } else if ((homeTeam === 'United States' || homeTeam === 'USA') && (
      venueLower.includes('los angeles') || venueLower.includes('boston') || 
      venueLower.includes('san francisco') || venueLower.includes('philadelphia') || 
      venueLower.includes('houston') || venueLower.includes('dallas') || 
      venueLower.includes('miami') || venueLower.includes('atlanta') || 
      venueLower.includes('seattle') || venueLower.includes('kansas city') || 
      venueLower.includes('new york') || venueLower.includes('new jersey')
    )) {
      isHomeAdvantage = true;
    }

    // --- OPTION 3: TÍNH TOÁN BASELINE PHÂN PHỐI POISSON & GIẢ LẬP MONTE CARLO ---
    const poissonResult = calculateMatchPoisson(homeTeamData, awayTeamData, isHomeAdvantage);
    const monteCarloResult = runMonteCarloSimulation(homeTeamData, awayTeamData, isHomeAdvantage, 10000);

    let feedbackPromptSection = '';
    let historicalAccuracy = null;
    let history = [];
    let historyTexts = '';
    let correctCount = 0;

    if (db) {
      try {
        // Tải lịch sử dự đoán trước đây để làm Feedback Loop
        history = await db.all(
          `SELECT * FROM predictions 
           WHERE (home_team = ? OR away_team = ? OR home_team = ? OR away_team = ?) 
             AND actual_home_score IS NOT NULL 
           ORDER BY id DESC LIMIT 5`,
          [homeTeam, awayTeam, awayTeam, homeTeam]
        );

        if (history && history.length > 0) {
          correctCount = 0;
          historyTexts = history.map((record) => {
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
`;
        }
      } catch (dbError) {
        console.error('Lỗi khi truy vấn lịch sử SQLite:', dbError);
      }
    }

    // Chế độ giả lập (Mock Mode) nếu thiếu cấu hình
    if (apiKeys.length === 0 || MODELS.length === 0) {
      console.log(`💡 [MOCK MODE] Không có API Key/Model hoạt động. Chạy giả lập cho: ${homeTeam} vs ${awayTeam}`);
      const mockData = getMockPrediction(homeTeam, awayTeam, true, 'Thiếu cấu hình API Key hoặc Model trong DB. Đang chạy giả lập.', historicalAccuracy, homeTeamData, awayTeamData, isHomeAdvantage);
      if (db) {
        try {
          await db.run(
            `INSERT INTO predictions (
              match_id, home_team, away_team, 
              predicted_home_score, predicted_away_score, 
              win_prob_home, win_prob_draw, win_prob_away,
              recommendation_1x2, recommendation_ou, recommendation_handicap,
              recommendation_btts, recommendation_corners, recommendation_cards,
              raw_prediction_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              matchId || null, homeTeam, awayTeam,
              mockData.predictedScore.home, mockData.predictedScore.away,
              mockData.winProbability.home, mockData.winProbability.draw, mockData.winProbability.away,
              mockData.bets.oneXTwo.recommendation, mockData.bets.overUnder.recommendation, mockData.bets.handicap.recommendation,
              mockData.bets.btts.recommendation, mockData.bets.corners.recommendation, mockData.bets.cards.recommendation,
              JSON.stringify(mockData)
            ]
          );
        } catch (saveError) {
          console.error('Lỗi lưu dự đoán Mock:', saveError);
        }
      }
      return NextResponse.json(mockData);
    }

    // --- LOAD PROMPT TEMPLATES FROM SQLITE (DYNAMIC PROMPTS) ---
    let systemPromptTemplate = `Bạn là một chuyên gia phân tích bóng đá thế giới hàng đầu, chuyên gia soi kèo bóng đá cho kỳ World Cup 2026.
Hãy đưa ra nhận định, dự đoán kết quả và soi kèo cho trận đấu giữa:
Đội nhà (Home Team): {{homeTeam}}
Đội khách (Away Team): {{awayTeam}}

--- THÔNG SỐ ĐỊNH LƯỢNG THỰC LỰC CỦA HAI ĐỘI (SQLITE METADATA BASELINE) ---
- Đội nhà [{{homeTeam}}]: {{homeStats}}
- Đội khách [{{awayTeam}}]: {{awayStats}}

--- MÔ HÌNH TOÁN HỌC POISSON & MÔ PHỎNG MONTE CARLO 10,000 LẦN ---
Hệ thống đã chạy mô hình toán học Poisson kết hợp mô phỏng Monte Carlo 10,000 lần. Hãy sử dụng dữ liệu toán học này làm cơ sở định lượng quan trọng:
{{poissonMonteCarlo}}
Lưu ý: Bạn cần dùng trí tuệ AI phân tích thêm các tin tức định tính từ RAG Search (như chấn thương mới nhất, thời tiết, động lực bảng đấu...) để điều chỉnh nhẹ tỷ lệ xác suất và tỉ số cuối cùng cho tối ưu nhất.

{{feedbackSection}}

--- CÁCH THỨC SUY LUẬN & ĐỊNH DẠNG JSON MẪU (FEW-SHOT EXAMPLES & CHAIN OF THOUGHT) ---
Để nâng cao độ chính xác, bạn BẮT BUỘC phải thực hiện suy luận từng bước (Chain of Thought) trong phân tích trước khi đưa ra kết quả kèo cược. Hãy phân tích kỹ lưỡng các khía cạnh: tương quan lực lượng, chiến thuật và động lực thi đấu.
Dưới đây là một ví dụ mẫu về cấu trúc phân tích và định dạng JSON mong muốn:
{
  "winProbability": {
    "home": 55,
    "draw": 25,
    "away": 20
  },
  "predictedScore": {
    "home": 2,
    "away": 1
  },
  "analysis": {
    "homeTeam": "Đội nhà có đội hình mạnh mẽ với các ngôi sao tấn công đang đạt điểm rơi phong độ cao. Tuy nhiên hàng thủ bộc lộ sơ hở khi thiếu vắng trung vệ trụ cột do chấn thương.",
    "awayTeam": "Đội khách thi đấu kỷ luật, chơi phòng ngự lùi sâu tốt. Tuy nhiên tuyến tiền vệ thiếu sáng tạo khiến việc tịnh tiến bóng phản công gặp nhiều khó khăn.",
    "keyFactors": [
      "Khả năng áp đặt thế trận của hàng tiền vệ đội nhà.",
      "Sự thiếu vắng trung vệ cốt cán của đội nhà có bị khai thác?",
      "Độ hiệu quả trong các pha phản công nhanh của đội khách."
    ],
    "predictionReasoning": "[SUY LUẬN LOGIC]: Phân tích chỉ số ELO cho thấy đội nhà (1820) vượt trội đội khách (1650). Mô hình Poisson dự báo tỉ số lý thuyết là 2-0. Tuy nhiên, tin tức RAG cho thấy trung vệ chính của đội nhà chấn thương, trong khi tiền đạo đội khách đang có phong độ tốt. Do đó, đội khách khả năng cao sẽ ghi được 1 bàn từ phản công. Kết quả dự đoán được điều chỉnh thành 2-1 nghiêng về đội nhà."
  },
  "bets": {
    "oneXTwo": {
      "recommendation": "Home",
      "reason": "Đội nhà có thực lực vượt trội và lợi thế sân bãi đủ để giành 3 điểm trọn vẹn."
    },
    "overUnder": {
      "recommendation": "Over 2.5",
      "reason": "Khả năng cao trận đấu cởi mở do hàng thủ đội nhà khuyết người còn hàng công hai bên đều sút tốt phong độ ổn định."
    },
    "handicap": {
      "recommendation": "Home -0.75",
      "reason": "Lựa chọn an toàn hơn khi đội nhà thắng cách biệt tối thiểu hoặc hơn."
    },
    "btts": {
      "recommendation": "Yes",
      "reason": "Hàng công hai bên đều có các nhân tố đột biến và phòng ngự có sơ hở."
    },
    "corners": {
      "recommendation": "Over 8.5 Corners",
      "reason": "Đội nhà sẽ ép sân mạnh ở cánh tạo ra nhiều quả phạt góc."
    },
    "cards": {
      "recommendation": "Under 3.5 Cards",
      "reason": "Lối đá hai đội cống hiến kỹ thuật, ít va chạm quyết liệt phi thể thao."
    }
  }
}

Chú ý: Tổng phần trăm trong \"winProbability\" (home + draw + away) phải bằng chính xác 100. Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    let ragTemplate = `--- THÔNG TIN TRA CỨU TỪ INTERNET (TIN TỨC & THỐNG KÊ THỰC TẾ) ---\n{{searchContext}}`;
    let feedbackTemplate = `--- LỊCH SỬ DỰ ĐOÁN & SAI SỐ TRƯỚC ĐÂY CỦA BẠN (HỌC MÁY NGỮ CẢNH) ---\nHệ thống đã lưu lại các dự đoán trước đây của bạn đối với 2 đội bóng này. Hãy phân tích kỹ các lỗi dự đoán trước đây để tránh lặp lại sai lầm và tăng độ chính xác lần này:\n{{historyTexts}}\nTỷ lệ dự đoán đúng kết quả chung cuộc (1X2) gần đây của bạn với 2 đội này là: {{rate}}% ({{correct}}/{{total}} trận đúng).`;
    let criticTemplate = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là bản nháp nhận định ban đầu cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- BẢN NHÁP DỰ ĐOÁN (DRAFT PREDICTION JSON) ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng bản nháp trên. Tìm ra các lỗi logic suy luận (ví dụ: dự đoán đội nhà thắng ELO cao hơn nhưng lại đưa ra kèo Draw hoặc Away có tỷ lệ thắng cao hơn phi lý, hoặc dự kiến ít bàn thắng nhưng kèo Tài Xỉu khuyến nghị Over...).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem bản nháp đã bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards).

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). Trong phần analysis.predictionReasoning, hãy ghi rõ: "[TINH CHỈNH PHẢN BIỆN]: <Lý do phản biện và những điểm đã tối ưu hóa so với bản nháp>".

Lưu ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    if (db) {
      try {
        const rowSys = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_system'");
        const rowRag = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_rag_template'");
        const rowFb = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_feedback_template'");
        const rowCritic = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_critic_template'");
        if (rowSys) systemPromptTemplate = rowSys.prompt_content;
        if (rowRag) ragTemplate = rowRag.prompt_content;
        if (rowFb) feedbackTemplate = rowFb.prompt_content;
        if (rowCritic) criticTemplate = rowCritic.prompt_content;
      } catch (err) {
        console.error('Lỗi khi đọc prompt template từ SQLite:', err);
      }
    }

    // --- CHUẨN BỊ DỮ LIỆU ĐỘNG ---
    const homeStatsString = `FIFA Rank: #${homeTeamData.fifa_rank}, ELO Rating: ${homeTeamData.elo_rating}. Phong độ gần đây: ${homeTeamData.recent_form}. Số bàn thắng ghi được TB: ${homeTeamData.avg_goals_scored}/trận, Bàn thua TB: ${homeTeamData.avg_goals_conceded}/trận. Ngôi sao: ${homeTeamData.key_players}. Lối chơi chiến thuật: ${homeTeamData.tactical_analysis}.`;
    const awayStatsString = `FIFA Rank: #${awayTeamData.fifa_rank}, ELO Rating: ${awayTeamData.elo_rating}. Phong độ gần đây: ${awayTeamData.recent_form}. Số bàn thắng ghi được TB: ${awayTeamData.avg_goals_scored}/trận, Bàn thua TB: ${awayTeamData.avg_goals_conceded}/trận. Ngôi sao: ${awayTeamData.key_players}. Lối chơi chiến thuật: ${awayTeamData.tactical_analysis}.`;

    const poissonMonteCarloString = `* Số bàn thắng kỳ vọng (xG): Đội nhà ${poissonResult.expectedGoals.home} vs Đội khách ${poissonResult.expectedGoals.away}.
* Xác suất 1X2 Poisson cơ bản: Đội nhà thắng ${poissonResult.winProbability.home}%, Hòa ${poissonResult.winProbability.draw}%, Đội khách thắng ${poissonResult.winProbability.away}%.
* Xác suất giả lập Monte Carlo 10,000 lần: Đội nhà thắng ${monteCarloResult.winProbability.home}%, Hòa ${monteCarloResult.winProbability.draw}%, Đội khách thắng ${monteCarloResult.winProbability.away}%.
* Xác suất kèo Tài Xỉu 2.5 (Monte Carlo): Tài (Over) ${monteCarloResult.ouProbability.over}%, Xỉu (Under) ${monteCarloResult.ouProbability.under}%.
* Xác suất cả hai đội cùng ghi bàn (BTTS - Monte Carlo): ${monteCarloResult.bttsProbability}%.
* Top 3 tỉ số có xác suất cao nhất (Monte Carlo): ${monteCarloResult.topScores.map(s => `${s.score} (${s.probability}%)`).join(', ')}.`;

    // Ghép phần feedback loop lịch sử
    if (history && history.length > 0) {
      feedbackPromptSection = feedbackTemplate
        .replace(/{{historyTexts}}/g, historyTexts)
        .replace(/{{rate}}/g, historicalAccuracy.rate)
        .replace(/{{correct}}/g, correctCount)
        .replace(/{{total}}/g, history.length);
    }

    // Lắp ráp final system prompt
    let finalSystemPrompt = systemPromptTemplate
      .replace(/{{homeTeam}}/g, homeTeam)
      .replace(/{{awayTeam}}/g, awayTeam)
      .replace(/{{homeStats}}/g, homeStatsString)
      .replace(/{{awayStats}}/g, awayStatsString)
      .replace(/{{poissonMonteCarlo}}/g, poissonMonteCarloString)
      .replace(/{{feedbackSection}}/g, feedbackPromptSection);

    // --- THỰC HIỆN TRA CỨU THÔNG TIN RAG ---
    let searchContext = '';
    try {
      const q1 = `${homeTeam} vs ${awayTeam} H2H stats`;
      const q2 = `${homeTeam} vs ${awayTeam} team news injuries`;
      const q3 = `${homeTeam} vs ${awayTeam} average corners stats`;
      const q4 = `${homeTeam} vs ${awayTeam} cards fouls stats`;

      console.log(`   - 🔍 [RAG SEARCH] Chạy 4 truy vấn song song cho thông tin trước trận...`);
      const [r1, r2, r3, r4] = await Promise.all([
        searchInternet(q1),
        searchInternet(q2),
        searchInternet(q3),
        searchInternet(q4)
      ]);

      const allResults = [
        { name: 'ĐỐI ĐẦU & PHONG ĐỘ (H2H & Form)', data: r1 },
        { name: 'TIN TỨC & CHẤN THƯƠNG (News & Injuries)', data: r2 },
        { name: 'PHẠT GÓC TRUNG BÌNH (Average Corners)', data: r3 },
        { name: 'THẺ PHẠT & PHẠM LỖI (Cards & Fouls)', data: r4 }
      ];

      let rawSearchContext = '';
      allResults.forEach(res => {
        rawSearchContext += `\n\n[Dữ liệu: ${res.name}]`;
        if (res.data && res.data.length > 0) {
          res.data.forEach((s) => {
            rawSearchContext += `\n- ${s}`;
          });
        } else {
          rawSearchContext += `\n- Không có dữ liệu trực tuyến.`;
        }
      });

      // Thay thế searchContext vào RAG Template
      searchContext = ragTemplate.replace(/{{searchContext}}/g, rawSearchContext);
    } catch (searchErr) {
      console.warn('⚠️ Lỗi khi tra cứu internet cho dự đoán:', searchErr.message);
      searchContext = ragTemplate.replace(/{{searchContext}}/g, '\n- Lỗi hoặc không có dữ liệu tra cứu trực tuyến.');
    }

    const finalPrompt = finalSystemPrompt + '\n' + searchContext;

    // Làm sạch JSON helper
    const cleanJsonText = (rawText) => {
      if (!rawText) return '';
      let cleaned = rawText.trim();
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        cleaned = codeBlockMatch[1].trim();
      }
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
      
      if (start !== -1 && end !== -1 && end > start) {
        return cleaned.substring(start, end + 1);
      }
      return cleaned;
    };

    let predictionData = null;
    let modelUsed = '';
    let keyIndexUsed = 0;
    let response = null;
    let isConsensus = false;

    // --- OPTION 3: CRITIC & REFINER LOOP (ĐỒNG THUẬN TUẦN TỰ) ---
    // Lọc các model đang không trong trạng thái Cool Down và chọn model đầu tiên (tốt nhất)
    const usableModels = MODELS.filter(m => !modelCoolDown[m] || modelCoolDown[m] < Date.now());
    const targetModel = usableModels[0] || 'gemini-2.5-flash';

    // Consensus Engine hoạt động nếu có tối thiểu 1 model và 1 API key
    const canRunConsensus = usableModels.length >= 1 && apiKeys.length >= 1;

    if (canRunConsensus) {
      console.log(`🤖 [CONSENSUS - OPTION 3] Bắt đầu Critic & Refiner Loop sử dụng model: ${targetModel}`);
      const startTime = Date.now();
      let draftClean = null;
      let draftResult = null;
      try {
        // Phân chia API keys giữa 2 bước tuần tự nếu có nhiều hơn 1 key
        const mid = Math.ceil(apiKeys.length / 2);
        const keysForDraft = apiKeys.slice(0, mid);
        const keysForCritic = apiKeys.length > 1 ? apiKeys.slice(mid) : apiKeys;

        // --- BƯỚC 1: TẠO BẢN NHÁP DỰ ĐOÁN (DRAFT) ---
        console.log(`   - [DRAFT PHASE] Đang tạo nhận định sơ bộ...`);
        draftResult = await callSingleModel(targetModel, keysForDraft, finalPrompt);
        const draftText = draftResult.response.text;
        draftClean = cleanJsonText(draftText);
        console.log(`   - [DRAFT PHASE] Đã có bản nháp JSON dự đoán.`);

        // --- BƯỚC 2: PHẢN BIỆN & TINH CHỈNH (CRITIC & REFINER) ---
        const criticPrompt = criticTemplate
          .replace(/{{homeTeam}}/g, homeTeam)
          .replace(/{{awayTeam}}/g, awayTeam)
          .replace(/{{draftPrediction}}/g, draftClean)
          .replace(/{{poissonMonteCarlo}}/g, poissonMonteCarloString)
          .replace(/{{searchContext}}/g, searchContext);

        // Chờ 1.5 giây nếu chỉ có 1 API key để tránh chạm Rate Limit Per Minute
        if (apiKeys.length === 1) {
          console.log(`   - [COOL DOWN] Chờ 1.5 giây giảm tải API Key duy nhất...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log(`   - [CRITIC PHASE] Đang gửi bản nháp cho tác nhân phản biện tinh chỉnh...`);
        const criticResult = await callSingleModel(targetModel, keysForCritic, criticPrompt);
        const criticText = criticResult.response.text;
        const criticClean = cleanJsonText(criticText);
        
        predictionData = JSON.parse(criticClean);
        modelUsed = `${targetModel} (Tác nhân phản biện tinh chỉnh)`;
        keyIndexUsed = criticResult.keyIndexUsed;
        response = criticResult.response;
        isConsensus = true;
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🟢 [CONSENSUS - OPTION 3] Thành công sau ${duration}s!`);
      } catch (err) {
        console.error('❌ Lỗi trong Critic & Refiner Loop:', err.message);
        
        // Fallback: Nếu phản biện tuần tự lỗi nhưng bước 1 (bản nháp) đã chạy thành công, ta sử dụng kết quả bản nháp
        if (draftClean) {
          try {
            predictionData = JSON.parse(draftClean);
            modelUsed = `${targetModel} (Bản nháp - Phản biện lỗi)`;
            keyIndexUsed = draftResult.keyIndexUsed;
            response = draftResult.response;
            console.log('⚠️ [FALLBACK] Đã cứu hộ thành công sử dụng kết quả bản nháp.');
          } catch (parseDraftErr) {
            console.error('Lỗi parse bản nháp khi cứu hộ:', parseDraftErr.message);
          }
        }
      }
    }

    // Nếu không chạy đồng thuận hoặc đồng thuận thất bại, chạy xoay vòng tuần tự như cũ
    if (!predictionData) {
      console.log(`🤖 [SINGLE ENGINE] Chạy dự đoán đơn lẻ (xoay vòng tuần tự)...`);
      let callResult = null;
      let lastError = null;

      // Lọc các model không bị cool down cho Single Engine
      const usableSingleModels = MODELS.filter(m => !modelCoolDown[m] || modelCoolDown[m] < Date.now());
      for (let modelIdx = 0; modelIdx < usableSingleModels.length; modelIdx++) {
        const currentModel = usableSingleModels[modelIdx];
        for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
          const currentKey = apiKeys[keyIdx];
          const startTime = Date.now();
          try {
            console.log(`🤖 [AI REQUEST] Gửi yêu cầu dự đoán: ${currentModel}`);
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const res = await ai.models.generateContent({
              model: currentModel,
              contents: finalPrompt,
              config: {
                abortSignal: AbortSignal.timeout(45000),
              },
            });
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`🟢 [AI RESPONSE] Thành công! Model: ${currentModel} (sau ${duration}s)`);
            callResult = {
              response: res,
              modelUsed: currentModel,
              keyIndexUsed: keyIdx
            };
            break;
          } catch (err) {
            console.warn(`⚠️ [Single AI Call] Model ${currentModel} thất bại với Key #${keyIdx + 1}:`, err.message);
            const errMsg = err.message || '';
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
              console.warn(`🛑 Model ${currentModel} gặp lỗi Quota/Unavailable. Đưa vào Cool Down 5 phút.`);
              modelCoolDown[currentModel] = Date.now() + 5 * 60 * 1000;
            }
            lastError = err;
          }
        }
        if (callResult) break;
      }

      if (!callResult) {
        throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
      }

      response = callResult.response;
      modelUsed = callResult.modelUsed;
      keyIndexUsed = callResult.keyIndexUsed;
      
      try {
        predictionData = JSON.parse(cleanJsonText(response.text));
      } catch (parseError) {
        console.error('Lỗi parse JSON từ Gemini:', response.text);
        return NextResponse.json(
          getMockPrediction(homeTeam, awayTeam, false, 'Dữ liệu AI trả về không đúng định dạng. Đang sử dụng thuật toán dự phòng.', historicalAccuracy)
        );
      }
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

    const responsePayload = {
      ...predictionData,
      sources,
      isMock: false,
      modelUsed,
      keyIndexUsed,
      historicalAccuracy,
      isConsensus,
      poissonBaseline: poissonResult,
      monteCarlo: monteCarloResult,
      isCached: false
    };

    // 7. Lưu dự đoán thành công vào SQLite
    if (db) {
      try {
        await db.run(
          `INSERT INTO predictions (
            match_id, home_team, away_team, 
            predicted_home_score, predicted_away_score, 
            win_prob_home, win_prob_draw, win_prob_away,
            recommendation_1x2, recommendation_ou, recommendation_handicap,
            recommendation_btts, recommendation_corners, recommendation_cards,
            raw_prediction_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            matchId || null, homeTeam, awayTeam,
            predictionData.predictedScore.home, predictionData.predictedScore.away,
            predictionData.winProbability.home, predictionData.winProbability.draw, predictionData.winProbability.away,
            predictionData.bets.oneXTwo.recommendation, predictionData.bets.overUnder.recommendation, predictionData.bets.handicap.recommendation,
            predictionData.bets.btts?.recommendation || 'No', predictionData.bets.corners?.recommendation || 'Under 8.5 Corners', predictionData.bets.cards?.recommendation || 'Under 3.5 Cards',
            JSON.stringify(responsePayload)
          ]
        );
      } catch (saveError) {
        console.error('Lỗi lưu dự đoán thật vào SQLite:', saveError);
      }
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Lỗi máy chủ trong API dự đoán:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xử lý dự đoán', details: error.message },
      { status: 500 }
    );
  }
}

function getMockPrediction(homeTeam, awayTeam, isMissingKey = false, customReason = '', historicalAccuracy = null, homeStats = {}, awayStats = {}, isHomeAdvantage = false) {
  const hash = (homeTeam.length + awayTeam.length) % 3;
  let winProb, score;

  // Chạy giả lập Monte Carlo thật dựa trên stats có sẵn
  const monteCarlo = runMonteCarloSimulation(homeStats, awayStats, isHomeAdvantage, 10000);

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
      },
      btts: {
        recommendation: (score.home > 0 && score.away > 0) ? 'Yes' : 'No',
        reason: (score.home > 0 && score.away > 0)
          ? 'Cả hai hàng công đều đang nổ súng đều đặn.'
          : 'Có ít nhất một đội bóng sẽ chơi phòng ngự lùi sâu và giữ sạch lưới.'
      },
      corners: {
        recommendation: hash === 0 ? 'Over 8.5 Corners' : 'Under 8.5 Corners',
        reason: hash === 0
          ? 'Lối chơi tập trung đánh biên nhiều sẽ tạo ra nhiều quả phạt góc.'
          : 'Trận đấu chậm và bóng chủ yếu luân chuyển khu vực trung lộ.'
      },
      cards: {
        recommendation: hash === 1 ? 'Over 3.5 Cards' : 'Under 3.5 Cards',
        reason: hash === 1
          ? 'Trận đấu quyết định gay cấn khiến hai bên có nhiều pha phạm lỗi chiến thuật.'
          : 'Lối chơi đẹp mắt, tôn trọng kỷ luật và ít tranh chấp quá tay.'
      }
    },
    sources: [
      { title: 'FIFA World Cup 2026 Official Site', uri: 'https://www.fifa.com/fifaworldcup/en' },
      { title: 'ESPN Soccer Analysis', uri: 'https://www.espn.com/soccer/' }
    ],
    isMock: true,
    modelUsed: 'Dự phòng / Mock',
    warning: isMissingKey ? 'Vui lòng điền GEMINI_API_KEY hoặc GEMINI_API_KEYS vào file `.env.local` để chạy dự đoán thật.' : null,
    historicalAccuracy,
    monteCarlo,
    isCached: false
  };
}
