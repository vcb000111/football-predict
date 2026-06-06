import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { searchInternet } from '@/lib/search';
import fixturesData from '@/data/fixtures.json';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng để tự động cập nhật kết quả.' },
        { status: 400 }
      );
    }

    let db = null;
    let apiKeys = [];
    let MODELS = [];

    // Mở cơ sở dữ liệu SQLite trước để lấy cấu hình
    try {
      db = await getDB();
      
      // Đọc các API Keys hoạt động từ DB
      const activeKeysRows = await db.all("SELECT key_value FROM api_keys WHERE status = 1");
      apiKeys = Array.from(new Set(activeKeysRows.map(row => row.key_value.trim())));
      
      // Đọc các AI Models hoạt động từ DB theo độ ưu tiên
      const activeModelsRows = await db.all("SELECT model_name FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      MODELS = activeModelsRows.map(row => row.model_name.trim());
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

    // 3. Mở database để tìm bản ghi dự đoán gần nhất
    if (!db) db = await getDB();
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

    // 4. CHẾ ĐỘ GIẢ LẬP (MOCK MODE) khi không có API Key hoặc Model hoạt động
    if (apiKeys.length === 0 || MODELS.length === 0) {
      console.log(`\n💡 [MOCK MODE - AUTO UPDATE] Không có API Key hoặc Model hoạt động trong DB. Chạy giả lập chấm điểm cho: ${homeTeam} vs ${awayTeam}`);

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

      // Đánh giá Kèo Chấp (Kèo Châu Á)
      let isCorrect_handicap = 0; // Đơn giản hóa trong mock
      if (isCorrect_1x2) isCorrect_handicap = 1;

      // Giả lập phạt góc, thẻ phạt và BTTS
      const mockCorners = (homeTeam.length * 3 + awayTeam.length * 2) % 6 + 6;
      const mockCards = (homeTeam.length + awayTeam.length) % 5 + 1;
      const actualBtts = (mockHomeScore > 0 && mockAwayScore > 0) ? 'yes' : 'no';

      const recBtts = (predictionRecord.recommendation_btts || '').toLowerCase();
      let isCorrect_btts = 0;
      if (recBtts.includes(actualBtts)) isCorrect_btts = 1;

      const recCorners = (predictionRecord.recommendation_corners || '').toLowerCase();
      let isCorrect_corners = 0;
      if (recCorners.includes('over') && mockCorners > 8.5) isCorrect_corners = 1;
      if (recCorners.includes('under') && mockCorners < 8.5) isCorrect_corners = 1;

      const recCards = (predictionRecord.recommendation_cards || '').toLowerCase();
      let isCorrect_cards = 0;
      if (recCards.includes('over') && mockCards > 3.5) isCorrect_cards = 1;
      if (recCards.includes('under') && mockCards < 3.5) isCorrect_cards = 1;

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
        btts: {
          outcome: isCorrect_btts === 1 ? 'correct' : 'incorrect',
          reason: `Cả hai đội ghi bàn thực tế: ${actualBtts === 'yes' ? 'Có' : 'Không'}. Dự đoán của bạn: ${predictionRecord.recommendation_btts || 'N/A'}.`
        },
        corners: {
          outcome: isCorrect_corners === 1 ? 'correct' : 'incorrect',
          reason: `Tổng số phạt góc thực tế: ${mockCorners} quả. Dự đoán của bạn: ${predictionRecord.recommendation_corners || 'N/A'}.`
        },
        cards: {
          outcome: isCorrect_cards === 1 ? 'correct' : 'incorrect',
          reason: `Tổng số thẻ phạt thực tế: ${mockCards} thẻ. Dự đoán của bạn: ${predictionRecord.recommendation_cards || 'N/A'}.`
        },
        summary: `[Mock AI Grounding] Trận đấu kết thúc với tỷ số ${mockHomeScore}-${mockAwayScore}, phạt góc ${mockCorners} quả, thẻ phạt ${mockCards} thẻ. AI đã chấm điểm các kèo tự động thành công.`,
        modelUsed: 'Dự phòng / Mock'
      };

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
          isCorrect_1x2,
          isCorrect_ou,
          isCorrect_handicap,
          isCorrect_btts,
          isCorrect_corners,
          isCorrect_cards,
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
        betEvaluations: evalDetails,
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

    // 5. CHẾ ĐỘ REAL MODE: Gọi Gemini AI cùng Search Grounding
    const prompt = `Hãy phân tích kết quả tỷ số thực tế và trạng thái của trận đấu bóng đá giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}
${matchDate ? `Ngày diễn ra trận đấu: ${matchDate} (${searchDateStr})` : ''}
${matchVenue ? `Địa điểm/Sân vận động: ${matchVenue}` : ''}

Hãy sử dụng thông tin kết quả tra cứu từ internet được cung cấp dưới đây về trận đấu thực tế diễn ra vào ngày ${searchDateStr || 'gần đây nhất'}. Hãy lấy kết quả thực tế của trận đấu đó (tỉ số, phạt góc, thẻ phạt) để chấm điểm và trả về trạng thái "finished".

Nhiệm vụ của bạn:
1. Phân tích thông tin tìm kiếm từ internet được cung cấp dưới đây để tìm kết quả thực tế của trận đấu diễn ra vào ngày ${searchDateStr || 'gần đây nhất'}.
2. Trả về kết quả thực tế của trận đấu (tỷ số thực tế, số quả phạt góc, số thẻ phạt) và chấm điểm tự động các dự đoán kèo sau:
   - Kèo châu Âu (1X2) dự đoán: "${predictionRecord.recommendation_1x2}"
   - Kèo tài xỉu 2.5 dự đoán: "${predictionRecord.recommendation_ou}"
   - Kèo chấp châu Á dự đoán: "${predictionRecord.recommendation_handicap}"
   - Kèo cả hai đội ghi bàn (BTTS) dự đoán: "${predictionRecord.recommendation_btts || 'N/A'}"
   - Kèo phạt góc dự đoán: "${predictionRecord.recommendation_corners || 'N/A'}"
   - Kèo thẻ phạt dự đoán: "${predictionRecord.recommendation_cards || 'N/A'}"

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
      
      // Tạo 3 query song song tập trung đúng trọng tâm
      const q1 = `${homeTeam} vs ${awayTeam}${dateSuffix} score goals match result`;
      const q2 = `${homeTeam} vs ${awayTeam}${dateSuffix} corners stats`;
      const q3 = `${homeTeam} vs ${awayTeam}${dateSuffix} cards stats`;

      console.log(`   - 🔍 [RAG SEARCH] Chạy 3 truy vấn song song cho kết quả trận đấu...`);
      console.log(`     [Q1]: "${q1}"`);
      console.log(`     [Q2]: "${q2}"`);
      console.log(`     [Q3]: "${q3}"`);

      const [r1, r2, r3] = await Promise.all([
        searchInternet(q1),
        searchInternet(q2),
        searchInternet(q3)
      ]);

      const allResults = [
        { name: 'KẾT QUẢ & TỶ SỐ (Score/Goals)', data: r1 },
        { name: 'PHẠT GÓC (Corners)', data: r2 },
        { name: 'THẺ PHẠT (Cards)', data: r3 }
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
      const currentModel = MODELS[modelIdx];
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const currentKey = apiKeys[keyIdx];
        const startTime = Date.now();
        try {
          console.log(`\n🤖 [AI REQUEST - AUTO UPDATE] Tra cứu kết quả trận đấu: ${homeTeam} vs ${awayTeam}`);
          console.log(`   - Model: ${currentModel}`);
          console.log(`   - API Key: #${keyIdx + 1}/${apiKeys.length}`);
          console.log(`   - Custom Search RAG: Bật (DuckDuckGo/Tavily)`);
          
          const ai = new GoogleGenAI({ apiKey: currentKey });

          const response = await ai.models.generateContent({
            model: currentModel,
            contents: finalPrompt,
            config: {
              abortSignal: AbortSignal.timeout(300000), // 5 minutes timeout
            },
          });

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`🟢 [AI RESPONSE - AUTO UPDATE] Thành công!`);
          console.log(`   - Model đã trả lời: ${currentModel}`);
          console.log(`   - Thời gian phản hồi: ${duration}s`);
          console.log(`   - Độ dài phản hồi: ${response.text?.length || 0} ký tự`);

          callResult = {
            response,
            modelUsed: currentModel,
            keyIndexUsed: keyIdx
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
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const { response, modelUsed } = callResult;
    const text = response.text;
    let updateResultData;

    const cleanJsonText = (rawText) => {
      if (!rawText) return '';
      let cleaned = rawText.trim();
      
      // Try to extract content inside markdown code block if present
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        cleaned = codeBlockMatch[1].trim();
      }
      
      // Find the first and last structural characters matching {} or []
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
          evalData.btts?.outcome === 'correct' ? 1 : 0,
          evalData.corners?.outcome === 'correct' ? 1 : 0,
          evalData.cards?.outcome === 'correct' ? 1 : 0,
          JSON.stringify({
            oneXTwo: evalData.oneXTwo || { outcome: 'n/a', reason: '' },
            overUnder: evalData.overUnder || { outcome: 'n/a', reason: '' },
            handicap: evalData.handicap || { outcome: 'n/a', reason: '' },
            btts: evalData.btts || { outcome: 'n/a', reason: '' },
            corners: evalData.corners || { outcome: 'n/a', reason: '' },
            cards: evalData.cards || { outcome: 'n/a', reason: '' },
            summary: updateResultData.summary || '',
            modelUsed: modelUsed || 'Dự phòng / Mock'
          }),
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
            console.log(`🟢 [fixtures.json - REAL] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}`);
          }
        }
      } catch (fsError) {
        console.error('Lỗi khi cập nhật fixtures.json:', fsError);
      }


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
