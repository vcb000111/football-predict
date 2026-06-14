import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { evaluateBetOutcome } from '@/lib/results-updater';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, actualHomeScore, actualAwayScore, matchId, actualFirstHalfHomeScore = null, actualFirstHalfAwayScore = null } = await request.json();

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

    const pHome = predictionRecord.predicted_home_score;
    const pAway = predictionRecord.predicted_away_score;
    const aHome = parseInt(actualHomeScore, 10);
    const aAway = parseInt(actualAwayScore, 10);
    const aFirstHalfHome = actualFirstHalfHomeScore !== null && actualFirstHalfHomeScore !== undefined ? parseInt(actualFirstHalfHomeScore, 10) : null;
    const aFirstHalfAway = actualFirstHalfAwayScore !== null && actualFirstHalfAwayScore !== undefined ? parseInt(actualFirstHalfAwayScore, 10) : null;

    const isFirstHalf = predictionRecord.predict_type === 'first_half';
    const compareHome = isFirstHalf ? aFirstHalfHome : aHome;
    const compareAway = isFirstHalf ? aFirstHalfAway : aAway;

    let evalResults = null;
    const canEvaluate = !isFirstHalf || (aFirstHalfHome !== null && aFirstHalfAway !== null);

    if (canEvaluate) {
      evalResults = evaluateBetOutcome(
        predictionRecord.recommendation_1x2,
        predictionRecord.recommendation_ou,
        predictionRecord.recommendation_handicap,
        predictionRecord.recommendation_btts,
        predictionRecord.recommendation_corners,
        predictionRecord.recommendation_cards,
        { home: pHome, away: pAway },
        compareHome,
        compareAway,
        null, // corners
        null, // cards
        homeTeam,
        awayTeam,
        predictionRecord.ou_line || 2.5,
        predictionRecord.corners_line || 8.5,
        predictionRecord.cards_line || 3.5,
        predictionRecord.handicap_line || 0.0
      );
    }

    const evalDetails = evalResults ? {
      ...evalResults.evalDetails,
      summary: `Cập nhật thủ công: Trận đấu kết thúc với tỷ số ${aHome}-${aAway}${aFirstHalfHome !== null ? `, Hiệp 1: ${aFirstHalfHome}-${aFirstHalfAway}` : ''}.`
    } : {
      oneXTwo: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      overUnder: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      handicap: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      btts: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      corners: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      cards: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
      summary: 'Không thể đánh giá cược do thiếu kết quả Hiệp 1.'
    };

    const isCorrect = evalResults ? evalResults.isCorrect_1x2 : null;
    const isCorrectOu = evalResults ? evalResults.isCorrect_ou : null;
    const isCorrectHandicap = evalResults ? evalResults.isCorrect_handicap : null;
    const isCorrectBtts = evalResults ? evalResults.isCorrect_btts : null;

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
           bet_evaluation_details = ?,
           actual_first_half_home_score = ?,
           actual_first_half_away_score = ?
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
        aFirstHalfHome,
        aFirstHalfAway,
        predictionRecord.id
      ]
    );

    // Cập nhật database fixtures và fixtures.json
    try {
      // 1. Cập nhật DB
      await db.run(
        `UPDATE fixtures 
         SET actual_home_score = ?, 
             actual_away_score = ?, 
             actual_first_half_home_score = ?, 
             actual_first_half_away_score = ? 
         WHERE id = ? OR (home_team = ? AND away_team = ?)`,
        [aHome, aAway, aFirstHalfHome, aFirstHalfAway, predictionRecord.match_id, homeTeam, awayTeam]
      );
      console.log(`🟢 [DB fixtures - MANUAL] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}`);

      // Helper normalize để so sánh tên đội
      const normalizeTeamName = (name) => {
        if (!name) return '';
        const lower = name.trim().toLowerCase();
        const aliases = {
          'usa': 'united states',
          'türkiye': 'turkey',
          'côte d\'ivoire': 'ivory coast',
          'cote d\'ivoire': 'ivory coast',
          'korea republic': 'south korea',
          'republic of korea': 'south korea'
        };
        return aliases[lower] || lower;
      };

      // 2. Cập nhật file JSON
      const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
      if (fs.existsSync(fixturesFilePath)) {
        const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
        const fixtureIndex = fileData.fixtures.findIndex(
          (f) => f.id === predictionRecord.match_id || (normalizeTeamName(f.homeTeam) === normalizeTeamName(homeTeam) && normalizeTeamName(f.awayTeam) === normalizeTeamName(awayTeam))
        );
        if (fixtureIndex !== -1) {
          fileData.fixtures[fixtureIndex].actualHomeScore = aHome;
          fileData.fixtures[fixtureIndex].actualAwayScore = aAway;
          if (aFirstHalfHome !== null && aFirstHalfAway !== null) {
            fileData.fixtures[fixtureIndex].actualFirstHalfScore = {
              home: aFirstHalfHome,
              away: aFirstHalfAway
            };
          }
          fs.writeFileSync(fixturesFilePath, JSON.stringify(fileData, null, 2), 'utf8');
          console.log(`🟢 [fixtures.json - MANUAL] Đã cập nhật tỉ số cho trận đấu ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}, Hiệp 1: ${aFirstHalfHome}-${aFirstHalfAway}`);
        }
      }
    } catch (fsError) {
      console.error('Lỗi khi cập nhật fixtures (DB/File - MANUAL):', fsError);
    }

    // --- OPTION 2: SELF-RETROSPECTIVE LESSON GENERATION ---
    const incorrectBets = [];
    if (isCorrect === 0) incorrectBets.push('1X2 (Thắng/Hòa/Thua)');
    if (isCorrectOu === 0) incorrectBets.push('Tài/Xỉu');
    if (isCorrectHandicap === 0) incorrectBets.push('Kèo chấp Handicap');
    if (isCorrectBtts === 0) incorrectBets.push('Cả hai đội ghi bàn (BTTS)');

    if (incorrectBets.length > 0 && evalResults) {
      console.log(`🔁 [Self-Retrospective - Manual] Phát hiện ${incorrectBets.length} kèo dự đoán sai. Gọi AI viết bài học kinh nghiệm...`);
      try {
        const activeKeysRows = await db.all("SELECT key_value FROM api_keys WHERE status = 1 AND (provider IS NULL OR provider = 'gemini')");
        const activeModelsRows = await db.all("SELECT model_name FROM ai_models WHERE status = 1 AND (provider IS NULL OR provider = 'gemini') ORDER BY priority ASC");
        
        if (activeKeysRows.length > 0 && activeModelsRows.length > 0) {
          const geminiKey = activeKeysRows[0].key_value.trim();
          const geminiModel = activeModelsRows[0].model_name.trim();
          
          const lessonPrompt = `
Trận đấu giữa ${homeTeam} và ${awayTeam} kết thúc với tỷ số thực tế là ${compareHome}-${compareAway}.
Dự đoán ban đầu của bạn là: Tỷ số ${pHome}-${pAway}.
Các đề xuất kèo bị sai lệch bao gồm: ${incorrectBets.join(', ')}.
${isFirstHalf ? 'Lưu ý: Đây là trận đấu được dự đoán riêng cho HIỆP 1.' : ''}

Nhiệm vụ: Hãy viết một bài học kinh nghiệm cực kỳ ngắn gọn (dưới 50 từ) giải thích lý do tại sao mô hình dự đoán sai các kèo này (ví dụ: đánh giá quá cao hàng công, đánh giá sai tính chất thực dụng của giải đấu, bỏ qua tin tức chấn thương...).
Hãy trả về duy nhất nội dung bài học bằng tiếng Việt. Không thêm bất cứ tag hay ký tự dẫn dắt nào. Do NOT include markdown blocks.
`;
          
          const aiInstance = new GoogleGenAI({ apiKey: geminiKey });
          const lessonRes = await aiInstance.models.generateContent({
            model: geminiModel,
            contents: lessonPrompt,
            config: { abortSignal: AbortSignal.timeout(15000) }
          });
          
          const lessonContent = lessonRes.text?.trim() || '';
          if (lessonContent) {
            console.log(`💾 [Self-Retrospective] Đã tạo bài học: "${lessonContent}"`);
            await db.run(
              `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
              [predictionRecord.match_id || null, homeTeam, incorrectBets.join('/'), lessonContent]
            );
            await db.run(
              `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
              [predictionRecord.match_id || null, awayTeam, incorrectBets.join('/'), lessonContent]
            );
            console.log(`🟢 [Self-Retrospective] Đã lưu bài học vào CSDL.`);
          }
        }
      } catch (lessonErr) {
        console.warn('⚠️ Lỗi khi tự tạo bài học kinh nghiệm AI:', lessonErr.message);
      }
    }

    // Xóa cache Next.js cho trang chủ và các trang chi tiết liên quan
    try {
      revalidatePath('/');
      if (predictionRecord.match_id) {
        revalidatePath(`/match/${predictionRecord.match_id}`);
      }
      revalidatePath('/match/[id]');
    } catch (cacheErr) {
      console.warn('⚠️ Lỗi revalidatePath:', cacheErr.message);
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
