import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { updateMatchResult, evaluateBetOutcome } from '@/lib/results-updater';
import { searchInternet } from '@/lib/search';
import { calculateMatchPoisson, runMonteCarloSimulation, calculateCornersAndCards } from '@/lib/poisson';
import { callOpenRouterModel } from '@/lib/openrouter';
import { calculateMLBaseline } from '@/lib/ml-baseline';
import { getVNTime } from '@/lib/timezone';
import fs from 'fs';
import path from 'path';

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

// Hàm tái dựng phong độ và bàn thắng trung bình lịch sử từ database để chống rò rỉ dữ liệu (Look-ahead Bias)
async function reconstructHistoricalStats(homeTeam, awayTeam, matchId, db) {
  try {
    if (!db) return null;
    const dbFixtures = await db.all("SELECT * FROM fixtures");
    const allFixtures = dbFixtures.map(f => ({
      id: f.id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      date: f.match_date,
      time: f.match_time,
      group: f.group_name,
      venue: f.venue,
      tournament: f.tournament,
      season: f.season,
      actualHomeScore: f.actual_home_score,
      actualAwayScore: f.actual_away_score,
      actualFirstHalfScore: f.actual_first_half_home_score !== null && f.actual_first_half_away_score !== null ? {
        home: f.actual_first_half_home_score,
        away: f.actual_first_half_away_score
      } : null
    }));
    
    // Tìm trận đấu hiện tại
    const currentMatch = allFixtures.find(f => f.id === matchId) || 
                         allFixtures.find(f => f.homeTeam === homeTeam && f.awayTeam === awayTeam);
                         
    if (!currentMatch) return null;
    
    const matchDate = currentMatch.date;
    
    // Lọc các trận đấu đã diễn ra trước trận này (có kết quả thực tế)
    const pastMatches = allFixtures.filter(f => 
      f.date < matchDate && 
      f.actualHomeScore !== null && 
      f.actualHomeScore !== undefined
    );
    
    const getStatsForTeam = (teamName) => {
      const teamMatches = pastMatches.filter(f => f.homeTeam === teamName || f.awayTeam === teamName);
      
      // Sắp xếp ngày giảm dần
      teamMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const recentMatches = teamMatches.slice(0, 5);
      const formArray = [];
      const handicapFormArray = [];
      
      recentMatches.forEach(m => {
        const isHome = m.homeTeam === teamName;
        const goalsFor = isHome ? m.actualHomeScore : m.actualAwayScore;
        const goalsAgainst = isHome ? m.actualAwayScore : m.actualHomeScore;
        
        if (goalsFor > goalsAgainst) formArray.push('W');
        else if (goalsFor === goalsAgainst) formArray.push('D');
        else formArray.push('L');
        
        if (m.marketHandicap !== undefined && m.marketHandicap !== null) {
          const hLine = parseFloat(m.marketHandicap);
          const diff = m.actualHomeScore - m.actualAwayScore;
          const homeHandicapResult = diff + hLine;
          
          if (isHome) {
            if (homeHandicapResult > 0) handicapFormArray.push('W');
            else if (homeHandicapResult === 0) handicapFormArray.push('D');
            else handicapFormArray.push('L');
          } else {
            if (homeHandicapResult < 0) handicapFormArray.push('W');
            else if (homeHandicapResult === 0) handicapFormArray.push('D');
            else handicapFormArray.push('L');
          }
        } else {
          handicapFormArray.push('D');
        }
      });
      
      while (formArray.length < 5) formArray.push('D');
      while (handicapFormArray.length < 5) handicapFormArray.push('D');
      
      const matches10 = teamMatches.slice(0, 10);
      let totalGoalsFor = 0;
      let totalGoalsAgainst = 0;
      
      matches10.forEach(m => {
        const isHome = m.homeTeam === teamName;
        totalGoalsFor += isHome ? m.actualHomeScore : m.actualAwayScore;
        totalGoalsAgainst += isHome ? m.actualAwayScore : m.actualHomeScore;
      });
      
      const avgGoalsFor = matches10.length > 0 ? parseFloat((totalGoalsFor / matches10.length).toFixed(2)) : 1.2;
      const avgGoalsAgainst = matches10.length > 0 ? parseFloat((totalGoalsAgainst / matches10.length).toFixed(2)) : 1.2;
      
      return {
        recent_form: formArray.join(','),
        asian_handicap_form: handicapFormArray.join(','),
        avg_goals_scored: avgGoalsFor,
        avg_goals_conceded: avgGoalsAgainst
      };
    };
    
    return {
      home: getStatsForTeam(homeTeam),
      away: getStatsForTeam(awayTeam)
    };
  } catch (err) {
    console.error('Lỗi khi reconstructHistoricalStats:', err);
    return null;
  }
}

// Hàm tự động cào ELO và FIFA Rank bằng RAG Search và cập nhật SQLite
async function scrapeAndUpdateElo(homeTeam, awayTeam, db, apiKeys, MODELS) {
  try {
    const eloSearchQuery = `${homeTeam} vs ${awayTeam} current ELO rating FIFA ranking 2026`;
    console.log(`🔍 [ELO Scraper] Chạy tìm kiếm ELO/Rank: "${eloSearchQuery}"`);
    const searchData = await searchInternet(eloSearchQuery);
    
    if (!searchData || searchData.length === 0) return null;
    
    const scraperPrompt = `
Dưới đây là thông tin tìm kiếm trên Internet về ELO rating và FIFA ranking của hai đội bóng: ${homeTeam} và ${awayTeam}.
Hãy trích xuất thông tin ELO và FIFA rank mới nhất hiện tại của 2 đội bóng này.

--- KẾT QUẢ TÌM KIẾM ---
${searchData.join('\n')}

Hãy trả về chuỗi JSON thô có định dạng cấu trúc chính xác như sau:
{
  "home": { "elo": 1820, "fifaRank": 12 },
  "away": { "elo": 1650, "fifaRank": 35 }
}
Nếu không tìm thấy ELO hay FIFA rank, hãy sử dụng chỉ số hợp lý hoặc giữ nguyên chỉ số cũ. Trả về duy nhất JSON thô. Do NOT include markdown blocks.
`;

    const targetModel = MODELS[0] || 'gemini-2.5-flash';
    const aiRes = await callSingleModel(targetModel, apiKeys, scraperPrompt);
    const cleanJson = cleanJsonText(aiRes.response.text);
    const parsed = JSON.parse(cleanJson);
    
      if (parsed.home && parsed.away) {
        console.log(`📈 [ELO Scraper] Trích xuất thành công:`, parsed);
        const nowStr = new Date().toISOString();
        
        if (parsed.home.elo && parsed.home.fifaRank) {
          const homeExists = await db.get("SELECT id FROM teams WHERE team_name = ?", [homeTeam]);
          if (homeExists) {
            await db.run(
              `UPDATE teams SET elo_rating = ?, fifa_rank = ?, last_updated = ? WHERE team_name = ?`,
              [parsed.home.elo, parsed.home.fifaRank, nowStr, homeTeam]
            );
          } else {
            await db.run(
              `INSERT INTO teams (team_name, elo_rating, fifa_rank, recent_form, avg_goals_scored, avg_goals_conceded, key_players, tactical_analysis, last_updated) VALUES (?, ?, ?, 'D,D,D,D,D', 1.2, 1.2, 'Chưa có thông tin', 'Đang cập nhật', ?)`,
              [homeTeam, parsed.home.elo, parsed.home.fifaRank, nowStr]
            );
          }
        }
        if (parsed.away.elo && parsed.away.fifaRank) {
          const awayExists = await db.get("SELECT id FROM teams WHERE team_name = ?", [awayTeam]);
          if (awayExists) {
            await db.run(
              `UPDATE teams SET elo_rating = ?, fifa_rank = ?, last_updated = ? WHERE team_name = ?`,
              [parsed.away.elo, parsed.away.fifaRank, nowStr, awayTeam]
            );
          } else {
            await db.run(
              `INSERT INTO teams (team_name, elo_rating, fifa_rank, recent_form, avg_goals_scored, avg_goals_conceded, key_players, tactical_analysis, last_updated) VALUES (?, ?, ?, 'D,D,D,D,D', 1.2, 1.2, 'Chưa có thông tin', 'Đang cập nhật', ?)`,
              [awayTeam, parsed.away.elo, parsed.away.fifaRank, nowStr]
            );
          }
        }
        console.log(`💾 [ELO Scraper] Đã cập nhật (Upsert) SQLite cho ${homeTeam} và ${awayTeam}`);
        return parsed;
      }
  } catch (err) {
    console.warn('⚠️ Lỗi khi tự động cào ELO/Rank:', err.message);
  }
  return null;
}

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
          temperature: 0,
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
      if (
        errMsg.includes('429') || 
        errMsg.includes('RESOURCE_EXHAUSTED') || 
        errMsg.includes('503') || 
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('413') ||
        errMsg.includes('rate_limit_exceeded')
      ) {
        console.warn(`🛑 Model ${model} gặp lỗi Quota/Unavailable/RateLimit. Đưa vào Cool Down 5 phút.`);
        modelCoolDown[model] = Date.now() + 5 * 60 * 1000;
      }
      
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

// Hàm helper gọi xoay vòng qua danh sách model của nhà cung cấp cho đến khi thành công
async function callProviderModelsFallback(provider, modelsList, apiKeys, prompt) {
  let lastError = null;
  
  for (const model of modelsList) {
    // Kiểm tra xem model có đang bị Cool Down không
    if (modelCoolDown[model] && modelCoolDown[model] > Date.now()) {
      console.log(`⏳ [Model Rotation] Model ${model} đang trong thời gian Cool Down, bỏ qua.`);
      continue;
    }
    
    try {
      console.log(`🤖 [Model Rotation] Đang thử gọi ${provider.toUpperCase()} với model: ${model}`);
      let result;
      if (provider === 'gemini') {
        result = await callSingleModel(model, apiKeys, prompt);
      } else {
        result = await callOpenRouterModel(model, apiKeys, prompt);
      }
      
      // Trả về kết quả ngay khi thành công
      return {
        provider,
        model,
        text: result.response.text,
        resObj: result
      };
    } catch (err) {
      console.warn(`⚠️ [Model Rotation] Model ${model} của ${provider} thất bại:`, err.message);
      lastError = err;
      
      // Nếu dính lỗi Quota / Request quá lớn / Unavailable, đưa model vào Cool Down 5 phút
      const errMsg = err.message || '';
      if (
        errMsg.includes('429') || 
        errMsg.includes('RESOURCE_EXHAUSTED') || 
        errMsg.includes('503') || 
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('413') || // Request too large
        errMsg.includes('rate_limit_exceeded')
      ) {
        console.warn(`🛑 Đưa model ${model} vào danh sách Cool Down 5 phút.`);
        modelCoolDown[model] = Date.now() + 5 * 60 * 1000;
      }
    }
  }
  
  throw lastError || new Error(`Tất cả các mô hình của ${provider} đều thất bại.`);
}

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId, forceRefresh, fastMode = false, isBacktest = false, marketHandicap = 0.0, predictType = 'full_time', firstHalfHomeScore = null, firstHalfAwayScore = null } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng' },
        { status: 400 }
      );
    }

    let db = null;
    let apiKeys = [];
    let MODELS = [];
    let geminiKeys = [];
    let openrouterKeys = [];
    let geminiModels = [];
    let openrouterModels = [];

    // Mở SQLite lấy cấu hình hoạt động
    try {
      db = await getDB();
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      openrouterKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'openrouter').map(row => row.key_value.trim())));
      
      geminiModels = activeModelsRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.model_name.trim());
      openrouterModels = activeModelsRows.filter(r => r.provider === 'openrouter').map(row => row.model_name.trim());
      
      apiKeys = geminiKeys;
      MODELS = geminiModels;
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // Xác định xem trận đấu này đã kết thúc và có tỷ số thực tế hay chưa
    let hasActualResult = false;
    let fixture = null;
    
    // 1. Kiểm tra từ database (bảng fixtures)
    if (db) {
      try {
        let dbFixture = null;
        if (matchId) {
          dbFixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [matchId]);
        } else {
          dbFixture = await db.get('SELECT * FROM fixtures WHERE home_team = ? AND away_team = ?', [homeTeam, awayTeam]);
        }
        if (dbFixture) {
          fixture = {
            id: dbFixture.id,
            homeTeam: dbFixture.home_team,
            awayTeam: dbFixture.away_team,
            date: dbFixture.match_date,
            time: dbFixture.match_time,
            group: dbFixture.group_name,
            venue: dbFixture.venue,
            tournament: dbFixture.tournament,
            season: dbFixture.season,
            actualHomeScore: dbFixture.actual_home_score,
            actualAwayScore: dbFixture.actual_away_score,
            actualFirstHalfScore: dbFixture.actual_first_half_home_score !== null && dbFixture.actual_first_half_away_score !== null ? {
              home: dbFixture.actual_first_half_home_score,
              away: dbFixture.actual_first_half_away_score
            } : null
          };
          if (fixture.actualHomeScore !== null && fixture.actualHomeScore !== undefined) {
            hasActualResult = true;
          }
        }
      } catch (err) {
        console.error('Lỗi khi truy vấn DB để kiểm tra tỉ số thực tế:', err);
      }
    }
    
    // 2. Kiểm tra từ database SQLite (nếu fixtures.json chưa cập nhật nhưng database đã cập nhật)
    if (!hasActualResult && db) {
      try {
        const dbResult = await db.get(
          `SELECT id FROM predictions 
           WHERE (match_id = ? OR (home_team = ? AND away_team = ?)) 
             AND actual_home_score IS NOT NULL 
           LIMIT 1`,
          [matchId || null, homeTeam, awayTeam]
        );
        if (dbResult) {
          hasActualResult = true;
        }
      } catch (err) {
        console.error('Lỗi kiểm tra tỉ số thực tế trong SQLite:', err);
      }
    }

    // --- TỰ ĐỘNG CẬP NHẬT KẾT QUẢ CHO CÁC TRẬN ĐẤU ĐÃ DIỄN RA ---
    const currentTime = new Date();
    let isPastMatch = false;
    if (fixture && fixture.date) {
      const matchDateStr = fixture.date;
      const matchTimeStr = fixture.time || '12:00';
      const fixtureTime = new Date(`${matchDateStr}T${matchTimeStr}:00`);
      if (fixtureTime < currentTime) {
        isPastMatch = true;
      }
    }

    if (isPastMatch && !hasActualResult && db && !isBacktest) {
      console.log(`🔁 [Auto Result Update on Predict] Trận đấu ${homeTeam} vs ${awayTeam} đã diễn ra nhưng chưa có tỷ số thực tế. Tự động lấy kết quả...`);
      const autoResult = await updateMatchResult({ homeTeam, awayTeam, matchId, force: false, db });
      if (autoResult && autoResult.success) {
        hasActualResult = true;
        console.log(`🟢 [Auto Result Update on Predict] Tự động cập nhật kết quả thành công: ${autoResult.actualScore.home}-${autoResult.actualScore.away}`);
      }
    }

    // --- TỰ ĐỘNG CẬP NHẬT ELO QUA RAG TRƯỚC TRẬN ĐẤU ---
    // Bỏ qua khi chạy Backtest để tránh rò rỉ dữ liệu và tiết kiệm tài nguyên
    if (!isBacktest && db && geminiKeys.length > 0 && geminiModels.length > 0) {
      await scrapeAndUpdateElo(homeTeam, awayTeam, db, geminiKeys, geminiModels);
    }

    // --- OPTION 1: TRUY VẤN DỮ LIỆU ĐỊNH LƯỢNG (ELO & FIFA RANK) TỪ SQLITE ---
    let homeTeamData = { 
      team_name: homeTeam,
      fifa_rank: 50, 
      elo_rating: 1600, 
      recent_form: "D,D,D,D,D", 
      avg_goals_scored: 1.2, 
      avg_goals_conceded: 1.2, 
      avg_corners_won: 4.5,
      avg_corners_conceded: 4.5,
      asian_handicap_form: "D,D,D,D,D",
      play_style: "mixed",
      key_players: "Chưa có thông tin", 
      tactical_analysis: "Đang cập nhật" 
    };
    let awayTeamData = { 
      team_name: awayTeam,
      fifa_rank: 50, 
      elo_rating: 1600, 
      recent_form: "D,D,D,D,D", 
      avg_goals_scored: 1.2, 
      avg_goals_conceded: 1.2, 
      avg_corners_won: 4.5,
      avg_corners_conceded: 4.5,
      asian_handicap_form: "D,D,D,D,D",
      play_style: "mixed",
      key_players: "Chưa có thông tin", 
      tactical_analysis: "Đang cập nhật" 
    };

    if (db) {
      try {
        const homeStats = await db.get("SELECT * FROM teams WHERE team_name = ?", [homeTeam]);
        const awayStats = await db.get("SELECT * FROM teams WHERE team_name = ?", [awayTeam]);
        if (homeStats) homeTeamData = { ...homeTeamData, ...homeStats };
        if (awayStats) awayTeamData = { ...awayTeamData, ...awayStats };
      } catch (err) {
        console.error('Lỗi khi đọc chỉ số đội tuyển từ SQLite:', err);
      }
    }

    // --- KHẮC PHỤC RÒ RỈ DỮ LIỆU LỊCH SỬ (LOOK-AHEAD BIAS) KHI BACKTEST / QUÁ KHỨ ---
    // Nếu ở chế độ Backtest hoặc giải đấu thuộc quá khứ (Euro 2024, Premier League/La Liga 2024-2025)
    // ta tự động tái thiết lập phong độ, bàn thắng trung bình thực tế tại thời điểm trước trận đấu.
    const isPastSeason = fixture?.season === '2024' || fixture?.season === '2024-2025';
    if (isBacktest || isPastSeason) {
      const historicalStats = await reconstructHistoricalStats(homeTeam, awayTeam, matchId, db);
      if (historicalStats) {
        console.log(`🛡️ [Historical Reconstructor] Tái dựng chỉ số lịch sử cho ${homeTeam} vs ${awayTeam} (Tránh Look-ahead bias)`);
        if (historicalStats.home) {
          homeTeamData = { ...homeTeamData, ...historicalStats.home };
        }
        if (historicalStats.away) {
          awayTeamData = { ...awayTeamData, ...historicalStats.away };
        }
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
    let venue = fixture?.venue || '';

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
    
    // Tính toán mốc cược bàn thắng (ou_line) khuyến nghị dựa trên bàn thắng kỳ vọng
    const expectedGoals = poissonResult.expectedGoals.home + poissonResult.expectedGoals.away;
    let ou_line = 2.5;
    if (expectedGoals < 2.0) {
      ou_line = 2.0;
    } else if (expectedGoals >= 2.0 && expectedGoals < 2.3) {
      ou_line = 2.25;
    } else if (expectedGoals >= 2.3 && expectedGoals < 2.7) {
      ou_line = 2.5;
    } else if (expectedGoals >= 2.7 && expectedGoals < 3.0) {
      ou_line = 2.75;
    } else {
      ou_line = 3.0;
    }

    // Chạy Monte Carlo với mốc cược ou_line động vừa tính
    const monteCarloResult = runMonteCarloSimulation(homeTeamData, awayTeamData, isHomeAdvantage, 10000, ou_line, predictType, firstHalfHomeScore, firstHalfAwayScore);

    // Tính toán mốc phạt góc và thẻ phạt động cùng xác suất tương ứng
    const ccResult = calculateCornersAndCards(homeTeamData, awayTeamData, 10000, predictType);
    const corners_line = ccResult.corners_line;
    const cards_line = ccResult.cards_line;

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

    // --- LẤY TỶ SỐ THỰC TẾ ĐỂ CHẤM ĐIỂM NẾU TRẬN ĐẤU ĐÃ KẾT THÚC ---
    let actualHomeScore = null;
    let actualAwayScore = null;
    let actualFirstHalfHomeScore = null;
    let actualFirstHalfAwayScore = null;
    if (hasActualResult) {
      try {
        if (fixture && fixture.actualHomeScore !== null && fixture.actualHomeScore !== undefined) {
          actualHomeScore = parseInt(fixture.actualHomeScore, 10);
          actualAwayScore = parseInt(fixture.actualAwayScore, 10);
          if (fixture.actualFirstHalfScore) {
            actualFirstHalfHomeScore = parseInt(fixture.actualFirstHalfScore.home, 10);
            actualFirstHalfAwayScore = parseInt(fixture.actualFirstHalfScore.away, 10);
          }
          console.log(`🏆 [Predict Route Score Retrieval] Đọc được tỷ số thực tế từ Database: ${actualHomeScore}-${actualAwayScore}, Hiệp 1: ${actualFirstHalfHomeScore}-${actualFirstHalfAwayScore}`);
        }
      } catch (e) {
        console.error('Lỗi khi đọc tỷ số thực tế từ fixtures.json:', e);
      }
    }

    // Chế độ giả lập (Mock Mode) nếu thiếu cấu hình
    if (apiKeys.length === 0 || MODELS.length === 0) {
      console.log(`💡 [MOCK MODE] Không có API Key/Model hoạt động. Chạy giả lập cho: ${homeTeam} vs ${awayTeam}`);
      const mockData = getMockPrediction(homeTeam, awayTeam, true, 'Thiếu cấu hình API Key hoặc Model trong DB. Đang chạy giả lập.', historicalAccuracy, homeTeamData, awayTeamData, isHomeAdvantage);
      if (db) {
        try {
          let evalResultsMock = null;
          const canEvaluateMock = predictType === 'first_half'
            ? (actualFirstHalfHomeScore !== null && actualFirstHalfAwayScore !== null)
            : (actualHomeScore !== null && actualAwayScore !== null);

          if (canEvaluateMock) {
            const compareHome = predictType === 'first_half' ? actualFirstHalfHomeScore : actualHomeScore;
            const compareAway = predictType === 'first_half' ? actualFirstHalfAwayScore : actualAwayScore;

            evalResultsMock = evaluateBetOutcome(
              mockData.bets.oneXTwo.recommendation,
              mockData.bets.overUnder.recommendation,
              mockData.bets.handicap.recommendation,
              mockData.bets.btts.recommendation,
              mockData.bets.corners.recommendation,
              mockData.bets.cards.recommendation,
              { home: mockData.predictedScore.home, away: mockData.predictedScore.away },
              compareHome,
              compareAway,
              null,
              null,
              homeTeam,
              awayTeam,
              parseFloat(mockData.bets.overUnder.line),
              parseFloat(mockData.bets.corners.line),
              parseFloat(mockData.bets.cards.line),
              parseFloat(marketHandicap || 0.0)
            );
          }

          await db.run(
            `INSERT INTO predictions (
              match_id, home_team, away_team, 
              predicted_home_score, predicted_away_score, 
              win_prob_home, win_prob_draw, win_prob_away,
              recommendation_1x2, recommendation_ou, recommendation_handicap,
              recommendation_btts, recommendation_corners, recommendation_cards,
              ou_line, corners_line, cards_line, handicap_line,
              actual_home_score, actual_away_score,
              is_correct, is_correct_ou, is_correct_handicap,
              is_correct_btts, is_correct_corners, is_correct_cards,
              bet_evaluation_details, raw_prediction_json,
              predict_type, first_half_home_score, first_half_away_score,
              actual_first_half_home_score, actual_first_half_away_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              matchId || null, homeTeam, awayTeam,
              mockData.predictedScore.home, mockData.predictedScore.away,
              mockData.winProbability.home, mockData.winProbability.draw, mockData.winProbability.away,
              mockData.bets.oneXTwo.recommendation, mockData.bets.overUnder.recommendation, mockData.bets.handicap.recommendation,
              mockData.bets.btts.recommendation, mockData.bets.corners.recommendation, mockData.bets.cards.recommendation,
              parseFloat(mockData.bets.overUnder.line),
              parseFloat(mockData.bets.corners.line),
              parseFloat(mockData.bets.cards.line),
              parseFloat(marketHandicap || 0.0),
              actualHomeScore, actualAwayScore,
              evalResultsMock ? evalResultsMock.isCorrect_1x2 : null,
              evalResultsMock ? evalResultsMock.isCorrect_ou : null,
              evalResultsMock ? evalResultsMock.isCorrect_handicap : null,
              evalResultsMock ? evalResultsMock.isCorrect_btts : null,
              evalResultsMock ? evalResultsMock.isCorrect_corners : null,
              evalResultsMock ? evalResultsMock.isCorrect_cards : null,
              evalResultsMock ? JSON.stringify({ ...evalResultsMock.evalDetails, summary: 'Giả lập chấm điểm tự động', modelUsed: 'Dự phòng / Mock' }) : null,
              JSON.stringify(mockData),
              predictType, firstHalfHomeScore, firstHalfAwayScore,
              actualFirstHalfHomeScore, actualFirstHalfAwayScore
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

--- YÊU CẦU QUAN TRỌNG VỀ NHẬN ĐỊNH CHI TIẾT (MARKDOWN & BẢNG SO SÁNH) ---
1. Phần "analysis.homeTeam" và "analysis.awayTeam" của bạn phải là những phân tích chuyên sâu dài từ 4 đến 6 câu chi tiết, nêu rõ sơ đồ chiến thuật dự kiến, phong độ nhân sự chủ chốt, cách vận hành lối chơi và tác động định tính (chấn thương, thẻ phạt từ internet). KHÔNG ĐƯỢC viết chung chung hoặc quá ngắn.
2. Phần "analysis.keyFactors" BẮT BUỘC phải chứa tối thiểu 5 yếu tố quyết định trận đấu cốt lõi. Mỗi yếu tố phải đi kèm phân tích hoặc lý giải ngắn gọn lý do tại sao nó ảnh hưởng trực tiếp đến trận đấu, không ghi các dòng ngắn cũn cỡn.
3. Phần "analysis.predictionReasoning" của bạn phải cực kỳ chi tiết, nhiều thông tin và có bằng chứng thuyết phục. Bạn BẮT BUỘC phải sử dụng định dạng Markdown phong phú để cấu trúc bài viết của mình, bao gồm:
   - Tiêu đề phụ dạng "### <Tiêu đề>" để phân chia các phần (ví dụ: ### Tương quan lực lượng, ### Phân tích chiến thuật, ### Dự đoán diễn biến).
   - Chữ đậm "**" để làm nổi bật các con số, tên cầu thủ hoặc các luận điểm quan trọng.
   - Danh sách gạch đầu dòng "-" hoặc "•".
   - Tạo một bảng so sánh H2H hoặc đội hình dự kiến dạng bảng Markdown chi tiết để tăng độ thuyết phục (ví dụ: | Chỉ số | Đội nhà | Đội khách |).
4. BẮT BUỘC tất cả dấu nháy kép bên trong nội dung phân tích (đặc biệt là trong các trường chuỗi của JSON) phải được viết dưới dạng thoát ký tự \\\" (gạch chéo nháy kép) nếu cần thiết, hoặc không dùng dấu nháy kép thô bên trong chuỗi để tránh làm hỏng cấu trúc JSON.

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
    "homeTeam": "Đội nhà đang vận hành cực kỳ ổn định dưới sơ đồ 4-3-3 tấn công áp đảo với Rodri giữ nhịp ở tuyến giữa và Lamine Yamal bùng nổ bên cánh phải. Sự vắng mặt của hậu vệ trái chính do chấn thương cơ đùi có thể là mắt xích yếu bị khai thác, tuy nhiên chiều sâu đội hình vượt trội giúp họ duy trì được tỷ lệ kiểm soát bóng trên 60% ở 5 trận sân nhà gần nhất, mang về 4 chiến thắng thuyết phục.",
    "awayTeam": "Đội khách trung thành với lối đá thực dụng 4-5-1 lùi sâu và chuyển trạng thái chớp nhoáng dựa trên tốc độ của tiền đạo cánh. Tinh thần kỷ luật phòng ngự và đẳng cấp ELO tiệm cận (1780) giúp họ duy trì chuỗi 4 trận giữ sạch lưới liên tiếp gần đây. Điểm hạn chế lớn nhất là khả năng áp đặt thế trận yếu và phụ thuộc quá nhiều vào các tình huống cố định hoặc phản công đơn điệu.",
    "keyFactors": [
      "Khả năng kiểm soát nhịp độ của Rodri trước tuyến tiền vệ dày đặc 5 người của đội khách.",
      "Cuộc đối đầu tay đôi ở hành lang biên giữa tốc độ của Lamine Yamal và hậu vệ cánh giàu kinh nghiệm của đội khách.",
      "Mắt xích yếu ở vị trí hậu vệ trái đóng thế của đội nhà có bị đòn phản công nhanh của đội khách khai thác triệt để?",
      "Hiệu suất tận dụng các cơ hội cố định (phạt góc, đá phạt trực tiếp) của đội khách trong thế trận bị dồn ép.",
      "Động lực bảng đấu thúc đẩy đội nhà buộc phải giành trọn vẹn 3 điểm để sớm giành vé đi tiếp."
    ],
    "predictionReasoning": "### Tương quan lực lượng & Phong độ\\nPhân tích chỉ số **ELO** cho thấy đội nhà (**1820**) vượt trội đội khách (**1650**). Đội nhà có tỷ lệ thắng sân nhà đạt **70%** trong khi đội khách chỉ thắng **30%** khi đá sân khách gần đây.\\n\\n### Bảng so sánh chỉ số chính\\n| Chỉ số | Đội nhà | Đội khách |\\n| :--- | :---: | :---: |\\n| ELO Rating | **1820** | 1650 |\\n| FIFA Rank | **#12** | #35 |\\n| Bàn thắng TB/trận | **2.10** | 1.10 |\\n| Bàn thua TB/trận | **0.80** | 1.50 |\\n\\n### Phân tích chiến thuật\\n- **Đội nhà**: Lối chơi kiểm soát bóng ngắn, áp đảo trung lộ. Thiếu vắng trung vệ trụ cột do chấn thương.\\n- **Đội khách**: Chơi phòng ngự lùi sâu phản công biên. Tiền đạo cánh đang đạt phong độ cực cao.\\n\\n### Nhận định trận đấu\\nMô hình Poisson dự báo tỉ số lý thuyết là **2-0**. Tuy nhiên, do đội nhà khuyết trung vệ chủ chốt, đội khách có khả năng ghi được **1 bàn** từ đòn phản công sắc bén. Do đó, kết quả dự đoán được tinh chỉnh thành **2-1** nghiêng về đội nhà."
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

Chú ý: Tổng phần trăm trong "winProbability" (home + draw + away) phải bằng chính xác 100. Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    let ragTemplate = `--- THÔNG TIN TRA CỨU TỪ INTERNET (TIN TỨC & THỐNG KÊ THỰC TẾ) ---\n{{searchContext}}`;
    let feedbackTemplate = `--- LỊCH SỬ DỰ ĐOÁN & SAI SỐ TRƯỚC ĐÂY CỦA BẠN (HỌC MÁY NGỮ CẢNH) ---\nHệ thống đã lưu lại các dự đoán trước đây của bạn đối với 2 đội bóng này. Hãy phân tích kỹ các lỗi dự đoán trước đây để tránh lặp lại sai lầm và tăng độ chính xác lần này:\n{{historyTexts}}\nTỷ lệ dự đoán đúng kết quả chung cuộc (1X2) gần đây của bạn với 2 đội này là: {{rate}}% ({{correct}}/{{total}} trận đúng).`;
    let criticTemplate = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- DỰ ĐOÁN BAN ĐẦU TỪ CÁC MODEL AI ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng các dự đoán trên. Phát hiện và sửa đổi toàn bộ các lỗi mâu thuẫn logic suy luận (BẮT BUỘC TUÂN THỦ CÁC NGUYÊN TẮC NHẤT QUÁN LOGIC DƯỚI ĐÂY):
   - **Quy tắc Nhất quán 1X2 và Tỉ số:** Nếu tỉ số dự đoán của bạn chỉ ra một bên thắng (ví dụ: 1-0, 2-1 nghiêng về Home), thì khuyến nghị kèo 1X2 (recommendation_1x2) BẮT BUỘC phải là "Home" hoặc "Home or Draw", tuyệt đối không được phép là "Draw" hay "Away". Ngược lại, nếu tỉ số dự đoán là hòa (1-1, 0-0), kèo 1X2 phải chọn "Draw".
   - **Quy tắc Nhất quán kèo Tài Xỉu (Over/Under):** Nếu tổng số bàn thắng dự đoán nhỏ hơn mốc chấp (ví dụ: tỉ số 1-0, tổng = 1 bàn, mốc Over/Under là 2.25 hoặc 2.5), thì khuyến nghị kèo Tài Xỉu (recommendation_ou) BẮT BUỘC phải là "Under". Không bao giờ khuyên chọn "Over" khi tổng số bàn thắng thấp hơn mốc chấp.
   - **Quy tắc Nhất quán kèo chấp châu Á (Handicap):** Hãy so sánh tỉ số dự đoán của bạn với mốc chấp của nhà cái để xác định bên thắng kèo. Ví dụ: Nếu Mexico chấp 0.75 bàn (Mexico -0.75), và bạn dự đoán tỉ số là Mexico thắng 1-0 (chênh lệch 1 bàn, lớn hơn mức chấp 0.75), thì Mexico thắng kèo (ăn nửa tiền). Khuyến nghị cược Handicap phải khuyên chọn "Home" (hoặc "Mexico -0.75"), tuyệt đối không được khuyên chọn "Away" (South Africa +0.75).
   - **Quy tắc Phạt góc và Thẻ phạt:** Nhận định phạt góc và thẻ phạt phải nhất quán với lối chơi (ví dụ: đội hình 4-1-4-1 đánh trung lộ và lối chơi thận trọng của trận khai mạc thì nên ưu tiên Under phạt góc).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem các model trên có bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards) dựa trên thực tế.
4. Phần "analysis.homeTeam" và "analysis.awayTeam" phải là những phân tích chuyên sâu dài từ 4 đến 6 câu chi tiết cho mỗi đội bóng.
5. Phần "analysis.keyFactors" BẮT BUỘC phải chứa tối thiểu 5 yếu tố quyết định trận đấu cốt lõi, được lý giải sâu sắc và dài dặn.
6. Phần "analysis.predictionReasoning" của bạn phải cực kỳ chi tiết, nhiều thông tin và có bằng chứng thuyết phục. Bạn BẮT BUỘC phải sử dụng định dạng Markdown phong phú (Tiêu đề phụ ###, chữ đậm **, danh sách gạch đầu dòng, bảng so sánh Markdown) và tuân thủ cấu trúc phân chia sau:
   - Đề mục "### Tương quan lực lượng & Phong độ": BẮT BUỘC chỉ viết tóm tắt cực kỳ ngắn gọn từ 2 đến 3 câu về các số liệu cốt lõi như ELO, thứ hạng FIFA, và tỉ số Poisson cơ bản giữa hai đội tuyển để làm thông tin nền. TUYỆT ĐỐI không viết dài dòng phần này.
   - Đề mục "### Tinh chỉnh phản biện": Bắt đầu bằng "[TINH CHỈNH PHẢN BIỆN]: <Phân tích phản biện chi tiết, chỉ rõ lý do đồng tình hoặc phản bác các model nháp ban đầu, và lý giải các điểm tối ưu hóa dựa trên chiến thuật, chấn thương, phong độ>".
7. BẮT BUỘC tất cả dấu nháy kép bên trong nội dung phân tích (đặc biệt là trong các trường chuỗi của JSON) phải được viết dưới dạng thoát ký tự \\\" (gạch chéo nháy kép) nếu cần thiết, hoặc không dùng dấu nháy kép thô bên trong chuỗi để tránh làm hỏng cấu trúc JSON.

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). 
LƯU Ý QUAN TRỌNG: Khi lập luận trong predictionReasoning, bạn PHẢI gọi tên cụ thể của từng model AI tham chiếu (ví dụ: 'gemini-3.1-flash-lite', 'meta-llama/llama-4-scout-17b-16e-instruct'...) thay vì sử dụng các từ chung chung như 'bản nháp 1', 'bản nháp 2', 'bản nháp trước'.

Lưu ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

    if (db) {
      try {
        // // Tự động đồng bộ hóa prompt mới từ code vào SQLite / Turso DB Production
        // await db.run("UPDATE system_prompts SET prompt_content = ? WHERE prompt_key = ?", [systemPromptTemplate, 'predict_system']);
        // await db.run("UPDATE system_prompts SET prompt_content = ? WHERE prompt_key = ?", [criticTemplate, 'predict_critic_template']);
        // console.log("🟢 [DB Prompt Sync] Đã đồng bộ hóa thành công prompt mới vào Turso DB.");

        const rowSys = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_system'");
        const rowRag = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_rag_template'");
        const rowFb = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_feedback_template'");
        const rowCritic = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'predict_critic_template'");
        if (rowSys) systemPromptTemplate = rowSys.prompt_content;
        if (rowRag) ragTemplate = rowRag.prompt_content;
        if (rowFb) feedbackTemplate = rowFb.prompt_content;
        if (rowCritic) criticTemplate = rowCritic.prompt_content;
      } catch (err) {
        console.error('Lỗi khi đồng bộ hoặc đọc prompt template từ DB:', err);
      }
    }

    // --- OPTION 4: HYBRID ML BASELINE ---
    const mlBaseline = calculateMLBaseline(homeTeamData, awayTeamData, isHomeAdvantage);

    // --- OPTION 2: HỌC MÁY NGỮ CẢNH - BÀI HỌC KINH NGHIỆM ---
    let lessonsString = '';
    if (db) {
      try {
        const lessons = await db.all(
          `SELECT * FROM ai_lessons 
           WHERE team_name IN (?, ?) 
           ORDER BY id DESC LIMIT 3`,
          [homeTeam, awayTeam]
        );
        if (lessons && lessons.length > 0) {
          lessonsString = lessons.map(lesson => {
            return `- Đội [${lesson.team_name}]: Bài học về kèo [${lesson.bet_type}]: ${lesson.lesson_content}`;
          }).join('\n');
        }
      } catch (err) {
        console.error('Lỗi khi truy vấn ai_lessons:', err);
      }
    }

    // --- CHUẨN BỊ DỮ LIỆU ĐỘNG ---
    const getPlayStyleName = (style) => {
      if (style === 'wing_play') return 'Tạt cánh đánh biên (Wing play)';
      if (style === 'tiki_taka') return 'Kiểm soát bóng ngắn (Tiki-taka)';
      if (style === 'counter_attack') return 'Phòng ngự phản công (Counter attack)';
      return 'Lối chơi đa dạng (Mixed style)';
    };

    const homeStatsString = `FIFA Rank: #${homeTeamData.fifa_rank}, ELO Rating: ${homeTeamData.elo_rating}. Phong độ gần đây: ${homeTeamData.recent_form}. Phong độ Handicap châu Á (5 trận gần nhất): ${homeTeamData.asian_handicap_form || 'D,D,D,D,D'}. Số bàn thắng ghi được TB: ${homeTeamData.avg_goals_scored}/trận, Bàn thua TB: ${homeTeamData.avg_goals_conceded}/trận. Phạt góc kiếm được TB: ${homeTeamData.avg_corners_won || 4.5}/trận, chịu phạt góc TB: ${homeTeamData.avg_corners_conceded || 4.5}/trận. Lối đá chủ đạo: ${getPlayStyleName(homeTeamData.play_style)}. Ngôi sao: ${homeTeamData.key_players}. Lối chơi chiến thuật: ${homeTeamData.tactical_analysis}.`;
    const awayStatsString = `FIFA Rank: #${awayTeamData.fifa_rank}, ELO Rating: ${awayTeamData.elo_rating}. Phong độ gần đây: ${awayTeamData.recent_form}. Phong độ Handicap châu Á (5 trận gần nhất): ${awayTeamData.asian_handicap_form || 'D,D,D,D,D'}. Số bàn thắng ghi được TB: ${awayTeamData.avg_goals_scored}/trận, Bàn thua TB: ${awayTeamData.avg_goals_conceded}/trận. Phạt góc kiếm được TB: ${awayTeamData.avg_corners_won || 4.5}/trận, chịu phạt góc TB: ${awayTeamData.avg_corners_conceded || 4.5}/trận. Lối đá chủ đạo: ${getPlayStyleName(awayTeamData.play_style)}. Ngôi sao: ${awayTeamData.key_players}. Lối chơi chiến thuật: ${awayTeamData.tactical_analysis}.`;

    const poissonMonteCarloString = `* Số bàn thắng kỳ vọng (xG): Đội nhà ${poissonResult.expectedGoals.home} vs Đội khách ${poissonResult.expectedGoals.away}.
* Mốc kèo Tài Xỉu khuyến nghị: ${ou_line} bàn.
* Xác suất 1X2 Poisson cơ bản: Đội nhà thắng ${poissonResult.winProbability.home}%, Hòa ${poissonResult.winProbability.draw}%, Đội khách thắng ${poissonResult.winProbability.away}%.
* Xác suất giả lập Monte Carlo 10,000 lần: Đội nhà thắng ${monteCarloResult.winProbability.home}%, Hòa ${monteCarloResult.winProbability.draw}%, Đội khách thắng ${monteCarloResult.winProbability.away}%.
* Xác suất kèo Tài Xỉu ${ou_line} (Monte Carlo): Tài (Over) ${monteCarloResult.ouProbability.over}%, Xỉu (Under) ${monteCarloResult.ouProbability.under}%.
* Xác suất cả hai đội cùng ghi bàn (BTTS - Monte Carlo): ${monteCarloResult.bttsProbability}%.
* Mốc phạt góc khuyến nghị: O/U ${corners_line} quả. Xác suất phạt góc (Monte Carlo): Tài (Over) ${ccResult.cornersProbability.over}%, Xỉu (Under) ${ccResult.cornersProbability.under}%.
* Mốc thẻ phạt khuyến nghị: O/U ${cards_line} thẻ. Xác suất thẻ phạt (Monte Carlo): Tài (Over) ${ccResult.cardsProbability.over}%, Xỉu (Under) ${ccResult.cardsProbability.under}%.
* Top 3 tỉ số có xác suất cao nhất (Monte Carlo): ${monteCarloResult.topScores.map(s => `${s.score} (${s.probability}%)`).join(', ')}.
* Xác suất từ mô hình định lượng Hybrid ML (Logistic Regression): Thắng ${mlBaseline.winProbability.home}%, Hòa ${mlBaseline.winProbability.draw}%, Thua ${mlBaseline.winProbability.away}%.
* Dự báo Tài Xỉu từ Hybrid ML: Over 2.5 ${mlBaseline.overUnder25.over}%, Under 2.5 ${mlBaseline.overUnder25.under}%.
* Dự báo BTTS từ Hybrid ML: Có (Yes) ${mlBaseline.btts.yes}%, Không (No) ${mlBaseline.btts.no}%.`;

    // Ghép phần feedback loop lịch sử
    if (history && history.length > 0) {
      feedbackPromptSection = feedbackTemplate
        .replace(/{{historyTexts}}/g, historyTexts)
        .replace(/{{rate}}/g, historicalAccuracy.rate)
        .replace(/{{correct}}/g, correctCount)
        .replace(/{{total}}/g, history.length);
    }

    const systemTimeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const kickoffTimeStr = fixture 
      ? `${fixture.time} ${fixture.date} (Giờ địa phương) / ${getVNTime(fixture.date, fixture.time, fixture.venue)?.formatted || ''} (Giờ VN)` 
      : 'Chưa có lịch thi đấu cụ thể';
    const timeContextStr = `Thời điểm hiện tại của hệ thống: ${systemTimeStr} (Giờ Việt Nam).
Thời gian bắt đầu trận đấu (Kickoff): ${kickoffTimeStr}.
LƯU Ý QUAN TRỌNG VỀ THỜI GIAN: Đối chiếu kỹ thời điểm hiện tại của hệ thống với thời gian bắt đầu trận đấu. Nếu thời điểm hiện tại đã SAU thời gian bắt đầu trận đấu, nghĩa là trận đấu đang diễn ra hoặc đã kết thúc. Nếu thời điểm hiện tại TRƯỚC thời gian bắt đầu trận đấu, nghĩa là trận đấu CHƯA diễn ra. Bạn tuyệt đối không được đưa ra tỷ số thực tế khi trận đấu chưa diễn ra.\n\n`;

    // Lắp ráp final system prompt
    let finalSystemPrompt = systemPromptTemplate
      .replace(/{{homeTeam}}/g, homeTeam)
      .replace(/{{awayTeam}}/g, awayTeam)
      .replace(/{{homeStats}}/g, homeStatsString)
      .replace(/{{awayStats}}/g, awayStatsString)
      .replace(/{{poissonMonteCarlo}}/g, poissonMonteCarloString)
      .replace(/{{feedbackSection}}/g, feedbackPromptSection);

    // Tiêm mốc thời gian hệ thống nếu không có sẵn trong template
    if (!finalSystemPrompt.includes('Thời điểm hiện tại của hệ thống')) {
      finalSystemPrompt = timeContextStr + finalSystemPrompt;
    }

    if (lessonsString) {
      finalSystemPrompt += `\n\n--- CÁC BÀI HỌC RÚT KINH NGHIỆM TỪ CÁC DỰ ĐOÁN SAI TRONG QUÁ KHỨ ---\n${lessonsString}\nLưu ý: Hãy đặc biệt chú ý đến các bài học rút kinh nghiệm trên để tinh chỉnh nhận định tránh sai lầm cũ.`;
    }

    // --- THỰC HIỆN TRA CỨU THÔNG TIN RAG ---
    // Bỏ qua RAG Search khi chạy Backtest để ngăn AI đọc tỷ số thực tế (Anti-Leakage)
    let searchContext = '';
    if (isBacktest) {
      console.log(`   - ⏭️ [RAG SEARCH BYPASS] Chế độ Backtest: Bỏ qua RAG Search để chống rò rỉ dữ liệu (Data Leakage).`);
      searchContext = ragTemplate.replace(/{{searchContext}}/g, '\n- [Backtest Mode] Tìm kiếm trực tuyến bị vô hiệu hóa để đảm bảo tính khách quan của dự đoán. AI suy luận dựa trên ELO/Poisson thô.');
    } else {
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

        searchContext = ragTemplate.replace(/{{searchContext}}/g, rawSearchContext);
      } catch (searchErr) {
        console.warn('⚠️ Lỗi khi tra cứu internet cho dự đoán:', searchErr.message);
        searchContext = ragTemplate.replace(/{{searchContext}}/g, '\n- Lỗi hoặc không có dữ liệu tra cứu trực tuyến.');
      }
    }

    let finalPrompt = finalSystemPrompt + '\n' + searchContext;

    // Tích hợp Odds Handicap và Game States chi tiết vào prompt cuối cùng
    const oddsInstruction = `
--- THÔNG TIN KÈO CHẤP THỰC TẾ (ODDS HANDICAP) ---
Tỷ lệ chấp thực tế của nhà cái cho trận đấu này là: ${marketHandicap > 0 ? `Đội khách chấp Đội nhà -${marketHandicap}` : marketHandicap < 0 ? `Đội nhà chấp Đội khách -${Math.abs(marketHandicap)}` : 'Đồng banh (0)'} (Mức handicap_line: ${marketHandicap}).
Bạn bắt buộc phải đối chiếu tỷ số dự đoán của bạn với tỷ lệ chấp này để đưa ra khuyến nghị Handicap tối ưu trong mục "bets.handicap" (Chọn "Home" nếu tin tưởng đội nhà thắng kèo chấp, chọn "Away" nếu tin tưởng đội khách thắng kèo chấp).
- Ghi nhớ: Với mốc cược chấp phân nửa như 0.25, 0.75, nếu trận đấu kết thúc với kết quả sát nút vừa đủ mốc sẽ có trường hợp "thắng nửa tiền" hoặc "thua nửa tiền". Ví dụ nếu bạn dự đoán kết quả hòa 1-1 và đội khách được chấp +0.25, bạn bắt buộc phải chọn cửa Away (thắng nửa tiền).

--- CHỈ THỊ NEO TỶ SỐ TOÁN HỌC POISSON (MỐC NEO CỨNG) ---
Mô hình toán học Poisson dự báo tỷ số cơ sở lý thuyết là: Đội nhà **${poissonResult.predictedScore.home} - ${poissonResult.predictedScore.away}** Đội khách.
Bạn bắt buộc phải sử dụng tỷ số Poisson thô này làm mốc neo thực lực chính. Mọi điều chỉnh tỷ số cuối cùng của bạn dựa trên tin tức RAG chỉ được phép dao động trong khoảng tối đa ±1 bàn thắng so với tỷ số Poisson thô (Ví dụ: nếu Poisson là 2-0, bạn chỉ được phép dự đoán tỷ số cuối cùng là 2-1, 1-0, 3-0, hoặc giữ nguyên 2-0. Tuyệt đối không đưa ra kết quả không tưởng như 4-0, 3-2 hay 0-1).

--- HƯỚNG DẪN DỰ ĐOÁN KÈO PHỤ (GAME STATES & LỐI CHƠI) ---
Hãy phân tích phong cách lối chơi (play_style) và phạt góc trung bình để đưa ra dự đoán Phạt góc và Thẻ phạt chính xác nhất:
1. Phạt góc: Đội tuyển có lối chơi tạt cánh đánh biên (wing_play) và số phạt góc kiếm được trung bình cao thường xuyên tạo ra nhiều quả phạt góc hơn hẳn. Ngược lại, đội chơi kiểm soát bóng ngắn (tiki_taka) có xu hướng đột phá trung lộ và tạt cánh ít hơn, dẫn đến lượng phạt góc thấp. Hãy so sánh lối chơi của hai đội với mốc phạt góc nhà cái: corners_line = ${corners_line}.
2. Thẻ phạt: Các trận đấu có tính chất sống còn (vòng knock-out, trận chung kết hoặc derby lớn) thường diễn ra căng thẳng hơn, số lượng thẻ phạt sẽ tăng vọt so với các trận đấu vòng bảng thong thả. Hãy phân tích tính chất này để so sánh với mốc thẻ phạt: cards_line = ${cards_line}.
`;

    const predictTypeInstruction = `
--- CHỈ THỊ VỀ PHẠM VI DỰ ĐOÁN (PREDICT TYPE) ---
Trận đấu đang được yêu cầu dự đoán cho: **${predictType === 'first_half' ? 'Hiệp 1 (First Half) - Chỉ tính kết quả trong 45 phút đầu tiên' : predictType === 'second_half' ? `Hiệp 2 (Second Half) - Dựa trên tỷ số hiệp 1 hiện tại là ${firstHalfHomeScore} - ${firstHalfAwayScore}` : 'Cả trận (Full Time)'}**.
${predictType === 'first_half' ? `
- Bạn chỉ được phân tích và dự đoán tỉ số, kèo cược (1X2, Over/Under, Handicap, BTTS, Phạt góc, Thẻ phạt) cho riêng HIỆP 1. 
- Mốc cược Tài Xỉu ${ou_line}, góc ${corners_line}, thẻ ${cards_line} ở trên đã được điều chỉnh riêng cho Hiệp 1. Tỉ số dự đoán (predictedScore) phải là tỉ số khi kết thúc Hiệp 1.` : ''}
${predictType === 'second_half' ? `
- Bạn cần phân tích trận đấu trong hiệp 2. Tỷ số hiệp 1 thực tế đã diễn ra là: Đội nhà ${firstHalfHomeScore} - Đội khách ${firstHalfAwayScore}.
- Lưu ý: Tỉ số dự đoán cuối cùng (predictedScore) của bạn BẮT BUỘC phải là TỶ SỐ CẢ TRẬN (bằng tỷ số hiệp 1 thực tế + số bàn thắng ghi thêm trong hiệp 2). 
- Các khuyến nghị cược (oneXTwo, overUnder, handicap, btts) cũng được tính cho cả trận sau khi cộng dồn tỷ số hiệp 1 thực tế.` : ''}
`;

    finalPrompt += '\n' + oddsInstruction + '\n' + predictTypeInstruction;

    // Nếu là trận đấu đã có kết quả (chế độ kiểm thử/backtesting)
    if (hasActualResult) {
      finalPrompt += `\n\n--- [CHỈ THỊ KIỂM THỬ KHÁCH QUAN] ---
Trận đấu này đã kết thúc trên thực tế. Nếu trong thông tin tra cứu internet (RAG Search) ở trên có chứa tỷ số thực tế hoặc kết quả chi tiết của trận đấu, bạn BẮT BUỘC phải BỎ QUA và KHÔNG ĐƯỢC phép sử dụng hay tham chiếu đến kết quả đó.
Hãy tự lập luận logic dựa trên các chỉ số định lượng ELO, Poisson, Monte Carlo và tin tức lực lượng/chấn thương trước trận đấu để đưa ra tỷ số dự kiến và nhận định của riêng bạn. Tuyệt đối không sao chép kết quả thực tế.`;
      console.log(`🛡️ [Anti Leakage] Đã kích hoạt chỉ thị chống rò rỉ dữ liệu cho trận đấu: ${homeTeam} vs ${awayTeam}`);
    }

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

    // --- OPTION 1 & 3: CRITIC & REFINER LOOP (ĐỒNG THUẬN SONG SONG ĐA TÁC NHÂN) ---
    // Chọn model tốt nhất của Gemini cho vai trò Critic cuối cùng
    const geminiModelName = geminiModels[0] || 'gemini-2.5-flash';
    
    // Fast Mode: Bỏ qua Consensus, chỉ gọi 1 model Gemini để tiết kiệm 70% API cost
    if (fastMode) {
      console.log(`⚡ [FAST MODE] Bỏ qua Consensus đa tác nhân, gọi trực tiếp ${geminiModelName}...`);
      try {
        const fastResult = await callSingleModel(geminiModelName, geminiKeys, finalPrompt);
        predictionData = JSON.parse(cleanJsonText(fastResult.response.text));
        modelUsed = `${geminiModelName} (Fast Mode)`;
        keyIndexUsed = fastResult.keyIndexUsed;
        response = fastResult.response;
      } catch (fastErr) {
        console.error('❌ [FAST MODE] Lỗi khi gọi model nhanh:', fastErr.message);
        throw fastErr;
      }
    }

    // Yêu cầu tối thiểu phải có Gemini để làm tác nhân phản biện Critic cuối cùng
    const canRunConsensus = !fastMode && !predictionData && geminiKeys.length >= 1 && geminiModels.length >= 1;

    if (canRunConsensus) {
      console.log(`🤖 [CONSENSUS - MULTI-AGENT] Bắt đầu gọi song song Gemini và OpenRouter bằng cơ chế xoay vòng model...`);
      const startTime = Date.now();
      let geminiDraftClean = null;
      let openrouterDraftClean = null;
      let geminiResultObj = null;
      let openrouterResultObj = null;
      let geminiModelUsed = '';
      let openrouterModelUsed = '';
      
      try {
        const draftPromises = [];
        
        // Khởi chạy luồng nháp Gemini (xoay vòng model)
        draftPromises.push(
          callProviderModelsFallback('gemini', geminiModels, geminiKeys, finalPrompt)
            .then(res => {
              geminiDraftClean = cleanJsonText(res.text);
              geminiResultObj = res.resObj;
              geminiModelUsed = res.model;
            })
            .catch(err => {
              console.warn('⚠️ Luồng nháp Gemini thất bại hoàn toàn:', err.message);
            })
        );
        
        // Khởi chạy luồng nháp OpenRouter (xoay vòng model nếu có key/model hoạt động)
        if (openrouterKeys.length > 0 && openrouterModels.length > 0) {
          draftPromises.push(
            callProviderModelsFallback('openrouter', openrouterModels, openrouterKeys, finalPrompt)
              .then(res => {
                openrouterDraftClean = cleanJsonText(res.text);
                openrouterResultObj = res.resObj;
                openrouterModelUsed = res.model;
              })
              .catch(err => {
                console.warn('⚠️ Luồng nháp OpenRouter thất bại hoàn toàn:', err.message);
              })
          );
        }
        
        await Promise.all(draftPromises);
        
        // Ghép bản nháp thu được vào Critic
        let draftsCombinedText = '';
        if (geminiDraftClean && openrouterDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT PREDICTION (${geminiModelUsed})]:\n${geminiDraftClean}\n\n[OPENROUTER DRAFT PREDICTION (${openrouterModelUsed})]:\n${openrouterDraftClean}`;
        } else if (geminiDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT PREDICTION (${geminiModelUsed})]:\n${geminiDraftClean}\n\n[OPENROUTER DRAFT]: (Thất bại hoặc không cấu hình)`;
        } else if (openrouterDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT]: (Thất bại)\n\n[OPENROUTER DRAFT PREDICTION (${openrouterModelUsed})]:\n${openrouterDraftClean}`;
        } else {
          throw new Error('Cả hai luồng nháp Gemini và OpenRouter đều thất bại hoàn toàn.');
        }

        // --- BƯỚC 2: PHẢN BIỆN & TINH CHỈNH (CRITIC & REFINER PHÁT BỞI GEMINI) ---
        let criticPrompt = criticTemplate
          .replace(/{{homeTeam}}/g, homeTeam)
          .replace(/{{awayTeam}}/g, awayTeam)
          .replace(/{{draftPrediction}}/g, draftsCombinedText)
          .replace(/{{poissonMonteCarlo}}/g, poissonMonteCarloString)
          .replace(/{{searchContext}}/g, searchContext);

        if (!criticPrompt.includes('Thời điểm hiện tại của hệ thống')) {
          criticPrompt = timeContextStr + criticPrompt;
        }

        if (hasActualResult) {
          criticPrompt += `\n\n--- [CHỈ THỊ KIỂM THỬ KHÁCH QUAN] ---
Trận đấu này đã kết thúc trên thực tế. Nếu trong thông tin tra cứu internet (RAG Search) ở trên có chứa tỷ số thực tế hoặc kết quả chi tiết của trận đấu, bạn BẮT BUỘC phải BỎ QUA và KHÔNG ĐƯỢC phép sử dụng hay tham chiếu đến kết quả đó để sửa đổi bản nháp.
Hãy đánh giá bản nháp và tự lập luận logic dựa trên các chỉ số định lượng ELO, Poisson, Monte Carlo và tin tức lực lượng/chấn thương trước trận đấu để đưa ra nhận định của riêng bạn. Tuyệt đối không sao chép kết quả thực tế.`;
        }

        console.log(`   - [CRITIC PHASE] Đang gọi Gemini làm trọng tài phản biện tinh chỉnh nhận định...`);
        // Critic sẽ dùng model Gemini đầu tiên làm trọng tài chính
        const criticResult = await callSingleModel(geminiModelName, geminiKeys, criticPrompt);
        const criticText = criticResult.response.text;
        const criticClean = cleanJsonText(criticText);
        
        predictionData = JSON.parse(criticClean);
        modelUsed = `${geminiModelName} (Critic Phản Biện) + [Gemini: ${geminiModelUsed || 'Failed'}${openrouterDraftClean ? ` / OpenRouter: ${openrouterModelUsed}` : ''}]`;
        keyIndexUsed = criticResult.keyIndexUsed;
        response = criticResult.response;
        isConsensus = true;
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🟢 [CONSENSUS - MULTI-AGENT] Thành công sau ${duration}s!`);
      } catch (err) {
        console.error('❌ Lỗi trong Consensus Engine:', err.message);
        
        // Cứu hộ Fallback: Dùng bản nháp của Gemini hoặc OpenRouter nếu có
        if (geminiDraftClean) {
          try {
            predictionData = JSON.parse(geminiDraftClean);
            modelUsed = `${geminiModelName} (Bản nháp Gemini - Phản biện lỗi)`;
            keyIndexUsed = geminiResultObj.keyIndexUsed;
            response = geminiResultObj.response;
            console.log('⚠️ [FALLBACK] Đã cứu hộ thành công sử dụng bản nháp Gemini.');
          } catch (e) {
            console.error('Lỗi parse bản nháp Gemini khi cứu hộ:', e.message);
          }
        } else if (openrouterDraftClean) {
          try {
            predictionData = JSON.parse(openrouterDraftClean);
            modelUsed = `${openrouterModelUsed} (Bản nháp OpenRouter - Phản biện lỗi)`;
            keyIndexUsed = openrouterResultObj.keyIndexUsed;
            response = { text: openrouterDraftClean };
            console.log('⚠️ [FALLBACK] Đã cứu hộ thành công sử dụng bản nháp OpenRouter.');
          } catch (e) {
            console.error('Lỗi parse bản nháp OpenRouter khi cứu hộ:', e.message);
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

    // Đảm bảo cấu trúc bets
    if (!predictionData.bets) predictionData.bets = {};
    if (!predictionData.bets.overUnder) predictionData.bets.overUnder = {};
    if (!predictionData.bets.corners) predictionData.bets.corners = {};
    if (!predictionData.bets.cards) predictionData.bets.cards = {};

    predictionData.bets.overUnder.line = parseFloat(predictionData.bets.overUnder.line || ou_line);
    predictionData.bets.corners.line = parseFloat(predictionData.bets.corners.line || corners_line);
    predictionData.bets.cards.line = parseFloat(predictionData.bets.cards.line || cards_line);

    const responsePayload = {
      ...predictionData,
      ou_line: predictionData.bets.overUnder.line,
      corners_line: predictionData.bets.corners.line,
      cards_line: predictionData.bets.cards.line,
      sources,
      isMock: false,
      modelUsed,
      keyIndexUsed,
      historicalAccuracy,
      isConsensus,
      poissonBaseline: poissonResult,
      monteCarlo: monteCarloResult,
      isCached: false,
      predictType,
      firstHalfHomeScore,
      firstHalfAwayScore,
      actualFirstHalfHomeScore,
      actualFirstHalfAwayScore
    };

    // 7. Lưu dự đoán thành công vào SQLite
    if (db) {
      try {
        // Lấy tournament từ fixture (nếu có)
        let tournamentName = null;
        if (matchId) {
          try {
            if (fixture?.tournament) tournamentName = fixture.tournament;
          } catch (e) { /* bỏ qua lỗi đọc tournament */ }
        }

        let evalResults = null;
        const canEvaluate = predictType === 'first_half'
          ? (actualFirstHalfHomeScore !== null && actualFirstHalfAwayScore !== null)
          : (actualHomeScore !== null && actualAwayScore !== null);

        if (canEvaluate) {
          const compareHome = predictType === 'first_half' ? actualFirstHalfHomeScore : actualHomeScore;
          const compareAway = predictType === 'first_half' ? actualFirstHalfAwayScore : actualAwayScore;

          evalResults = evaluateBetOutcome(
            predictionData.bets.oneXTwo.recommendation,
            predictionData.bets.overUnder.recommendation,
            predictionData.bets.handicap.recommendation,
            predictionData.bets.btts?.recommendation || 'No',
            predictionData.bets.corners?.recommendation || 'Under 8.5 Corners',
            predictionData.bets.cards?.recommendation || 'Under 3.5 Cards',
            { home: predictionData.predictedScore.home, away: predictionData.predictedScore.away },
            compareHome,
            compareAway,
            null,
            null,
            homeTeam,
            awayTeam,
            predictionData.bets.overUnder.line,
            predictionData.bets.corners.line,
            predictionData.bets.cards.line,
            parseFloat(marketHandicap || 0.0)
          );
        }

        await db.run(
          `INSERT INTO predictions (
            match_id, home_team, away_team, 
            predicted_home_score, predicted_away_score, 
            win_prob_home, win_prob_draw, win_prob_away,
            recommendation_1x2, recommendation_ou, recommendation_handicap,
            recommendation_btts, recommendation_corners, recommendation_cards,
            ou_line, corners_line, cards_line, handicap_line,
            actual_home_score, actual_away_score,
            is_correct, is_correct_ou, is_correct_handicap,
            is_correct_btts, is_correct_corners, is_correct_cards,
            bet_evaluation_details, raw_prediction_json, tournament,
            predict_type, first_half_home_score, first_half_away_score,
            actual_first_half_home_score, actual_first_half_away_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            matchId || null, homeTeam, awayTeam,
            predictionData.predictedScore.home, predictionData.predictedScore.away,
            predictionData.winProbability.home, predictionData.winProbability.draw, predictionData.winProbability.away,
            predictionData.bets.oneXTwo.recommendation, predictionData.bets.overUnder.recommendation, predictionData.bets.handicap.recommendation,
            predictionData.bets.btts?.recommendation || 'No', predictionData.bets.corners?.recommendation || 'Under 8.5 Corners', predictionData.bets.cards?.recommendation || 'Under 3.5 Cards',
            predictionData.bets.overUnder.line,
            predictionData.bets.corners.line,
            predictionData.bets.cards.line,
            parseFloat(marketHandicap || 0.0),
            actualHomeScore, actualAwayScore,
            evalResults ? evalResults.isCorrect_1x2 : null,
            evalResults ? evalResults.isCorrect_ou : null,
            evalResults ? evalResults.isCorrect_handicap : null,
            evalResults ? evalResults.isCorrect_btts : null,
            evalResults ? evalResults.isCorrect_corners : null,
            evalResults ? evalResults.isCorrect_cards : null,
            evalResults ? JSON.stringify({ ...evalResults.evalDetails, summary: 'Chấm điểm tự động qua dự đoán', modelUsed }) : null,
            JSON.stringify(responsePayload),
            tournamentName,
            predictType, firstHalfHomeScore, firstHalfAwayScore,
            actualFirstHalfHomeScore, actualFirstHalfAwayScore
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

  // Tính toán mốc cược bàn thắng (ou_line) dựa trên stats
  const homeGoalsScored = homeStats.avg_goals_scored ?? 1.5;
  const awayGoalsScored = awayStats.avg_goals_scored ?? 1.3;
  const expectedGoals = (homeGoalsScored + awayGoalsScored) / 2;
  let ou_line = 2.5;
  if (expectedGoals < 2.0) {
    ou_line = 2.0;
  } else if (expectedGoals >= 2.0 && expectedGoals < 2.3) {
    ou_line = 2.25;
  } else if (expectedGoals >= 2.3 && expectedGoals < 2.7) {
    ou_line = 2.5;
  } else if (expectedGoals >= 2.7 && expectedGoals < 3.0) {
    ou_line = 2.75;
  } else {
    ou_line = 3.0;
  }

  // Chạy giả lập Monte Carlo thật dựa trên stats có sẵn
  const monteCarlo = runMonteCarloSimulation(homeStats, awayStats, isHomeAdvantage, 10000, ou_line);
  const ccResult = calculateCornersAndCards(homeStats, awayStats, 10000);
  const corners_line = ccResult.corners_line;
  const cards_line = ccResult.cards_line;
  
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

  const actualTotalGoals = score.home + score.away;
  const ouRec = actualTotalGoals > ou_line ? `Over ${ou_line}` : `Under ${ou_line}`;

  return {
    winProbability: winProb,
    predictedScore: score,
    ou_line,
    corners_line,
    cards_line,
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
        recommendation: ouRec,
        line: ou_line,
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
        recommendation: hash === 0 ? `Over ${corners_line}` : `Under ${corners_line}`,
        line: corners_line,
        reason: hash === 0
          ? 'Lối chơi tập trung đánh biên nhiều sẽ tạo ra nhiều quả phạt góc.'
          : 'Trận đấu chậm và bóng chủ yếu luân chuyển khu vực trung lộ.'
      },
      cards: {
        recommendation: hash === 1 ? `Over ${cards_line}` : `Under ${cards_line}`,
        line: cards_line,
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
