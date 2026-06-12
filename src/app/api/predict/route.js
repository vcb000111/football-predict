import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { updateMatchResult, evaluateBetOutcome } from '@/lib/results-updater';
import { searchInternet } from '@/lib/search';
import { calculateMatchPoisson, runMonteCarloSimulation, calculateCornersAndCards } from '@/lib/poisson';
import { callGroqModel } from '@/lib/groq';
import { calculateMLBaseline } from '@/lib/ml-baseline';
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

// Hàm tái dựng phong độ và bàn thắng trung bình lịch sử từ fixtures.json để chống rò rỉ dữ liệu (Look-ahead Bias)
function reconstructHistoricalStats(homeTeam, awayTeam, matchId) {
  try {
    const fixturesPath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
    if (!fs.existsSync(fixturesPath)) return null;
    
    const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    const allFixtures = fixturesData.fixtures || [];
    
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
        result = await callGroqModel(model, apiKeys, prompt);
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
    const { homeTeam, awayTeam, matchId, forceRefresh, fastMode = false, isBacktest = false, marketHandicap = 0.0 } = await request.json();

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
    let groqKeys = [];
    let geminiModels = [];
    let groqModels = [];

    // Mở SQLite lấy cấu hình hoạt động
    try {
      db = await getDB();
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      groqKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'groq').map(row => row.key_value.trim())));
      
      geminiModels = activeModelsRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.model_name.trim());
      groqModels = activeModelsRows.filter(r => r.provider === 'groq').map(row => row.model_name.trim());
      
      apiKeys = geminiKeys;
      MODELS = geminiModels;
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // Xác định xem trận đấu này đã kết thúc và có tỷ số thực tế hay chưa
    let hasActualResult = false;
    let fixture = null;
    
    // 1. Kiểm tra từ file cấu hình fixtures.json
    if (matchId) {
      try {
        const fixturesPath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
        if (fs.existsSync(fixturesPath)) {
          const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
          fixture = fixturesData.fixtures?.find(f => f.id === matchId);
          if (fixture && fixture.actualHomeScore !== null && fixture.actualHomeScore !== undefined) {
            hasActualResult = true;
          }
        }
      } catch (err) {
        console.error('Lỗi khi đọc fixtures.json để kiểm tra tỉ số thực tế:', err);
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
      const historicalStats = reconstructHistoricalStats(homeTeam, awayTeam, matchId);
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
    const monteCarloResult = runMonteCarloSimulation(homeTeamData, awayTeamData, isHomeAdvantage, 10000, ou_line);

    // Tính toán mốc phạt góc và thẻ phạt động cùng xác suất tương ứng
    const ccResult = calculateCornersAndCards(homeTeamData, awayTeamData, 10000);
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
    if (hasActualResult) {
      try {
        const fixturesPath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
        if (fs.existsSync(fixturesPath)) {
          const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
          const f = fixturesData.fixtures?.find(x => x.id === matchId || (x.homeTeam === homeTeam && x.awayTeam === awayTeam));
          if (f && f.actualHomeScore !== null && f.actualHomeScore !== undefined) {
            actualHomeScore = parseInt(f.actualHomeScore, 10);
            actualAwayScore = parseInt(f.actualAwayScore, 10);
            console.log(`🏆 [Predict Route Score Retrieval] Đọc được tỷ số thực tế từ fixtures.json: ${actualHomeScore}-${actualAwayScore}`);
          }
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
          if (actualHomeScore !== null && actualAwayScore !== null) {
            evalResultsMock = evaluateBetOutcome(
              mockData.bets.oneXTwo.recommendation,
              mockData.bets.overUnder.recommendation,
              mockData.bets.handicap.recommendation,
              mockData.bets.btts.recommendation,
              mockData.bets.corners.recommendation,
              mockData.bets.cards.recommendation,
              { home: mockData.predictedScore.home, away: mockData.predictedScore.away },
              actualHomeScore,
              actualAwayScore,
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
              bet_evaluation_details, raw_prediction_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    let criticTemplate = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- DỰ ĐOÁN BAN ĐẦU TỪ CÁC MODEL AI ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng các dự đoán trên. Tìm ra các lỗi logic suy luận (ví dụ: dự đoán đội nhà thắng ELO cao hơn nhưng lại đưa ra kèo Draw hoặc Away có tỷ lệ thắng cao hơn phi lý, hoặc dự kiến ít bàn thắng nhưng kèo Tài Xỉu khuyến nghị Over...).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem các model trên có bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards).

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). 
Trong phần analysis.predictionReasoning, hãy ghi rõ: "[TINH CHỈNH PHẢN BIỆN]: <Lý do phản biện và những điểm đã tối ưu hóa so với các model>". 
LƯU Ý QUAN TRỌNG: Khi lập luận trong predictionReasoning, bạn PHẢI gọi tên cụ thể của từng model AI tham chiếu (ví dụ: 'gemini-3.1-flash-lite', 'meta-llama/llama-4-scout-17b-16e-instruct'...) thay vì sử dụng các từ chung chung như 'bản nháp 1', 'bản nháp 2', 'bản nháp trước'.

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
      finalSystemPrompt = `Thời điểm hiện tại của hệ thống: ${systemTimeStr} (Sử dụng mốc thời gian này để đối chiếu với thời gian diễn ra trận đấu thực tế).\n\n` + finalSystemPrompt;
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

    finalPrompt += '\n' + oddsInstruction;

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
      console.log(`🤖 [CONSENSUS - MULTI-AGENT] Bắt đầu gọi song song Gemini và Groq bằng cơ chế xoay vòng model...`);
      const startTime = Date.now();
      let geminiDraftClean = null;
      let groqDraftClean = null;
      let geminiResultObj = null;
      let groqResultObj = null;
      let geminiModelUsed = '';
      let groqModelUsed = '';
      
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
        
        // Khởi chạy luồng nháp Groq (xoay vòng model nếu có key/model hoạt động)
        if (groqKeys.length > 0 && groqModels.length > 0) {
          draftPromises.push(
            callProviderModelsFallback('groq', groqModels, groqKeys, finalPrompt)
              .then(res => {
                groqDraftClean = cleanJsonText(res.text);
                groqResultObj = res.resObj;
                groqModelUsed = res.model;
              })
              .catch(err => {
                console.warn('⚠️ Luồng nháp Groq thất bại hoàn toàn:', err.message);
              })
          );
        }
        
        await Promise.all(draftPromises);
        
        // Ghép bản nháp thu được vào Critic
        let draftsCombinedText = '';
        if (geminiDraftClean && groqDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT PREDICTION (${geminiModelUsed})]:\n${geminiDraftClean}\n\n[GROQ DRAFT PREDICTION (${groqModelUsed})]:\n${groqDraftClean}`;
        } else if (geminiDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT PREDICTION (${geminiModelUsed})]:\n${geminiDraftClean}\n\n[GROQ DRAFT]: (Thất bại hoặc không cấu hình)`;
        } else if (groqDraftClean) {
          draftsCombinedText = `[GEMINI DRAFT]: (Thất bại)\n\n[GROQ DRAFT PREDICTION (${groqModelUsed})]:\n${groqDraftClean}`;
        } else {
          throw new Error('Cả hai luồng nháp Gemini và Groq đều thất bại hoàn toàn.');
        }

        // --- BƯỚC 2: PHẢN BIỆN & TINH CHỈNH (CRITIC & REFINER PHÁT BỞI GEMINI) ---
        let criticPrompt = criticTemplate
          .replace(/{{homeTeam}}/g, homeTeam)
          .replace(/{{awayTeam}}/g, awayTeam)
          .replace(/{{draftPrediction}}/g, draftsCombinedText)
          .replace(/{{poissonMonteCarlo}}/g, poissonMonteCarloString)
          .replace(/{{searchContext}}/g, searchContext);

        if (!criticPrompt.includes('Thời điểm hiện tại của hệ thống')) {
          criticPrompt = `Thời điểm hiện tại của hệ thống: ${systemTimeStr} (Sử dụng mốc thời gian này để đối chiếu với thời gian diễn ra trận đấu thực tế).\n\n` + criticPrompt;
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
        modelUsed = `${geminiModelName} (Critic Phản Biện) + [Gemini: ${geminiModelUsed || 'Failed'}${groqDraftClean ? ` / Groq: ${groqModelUsed}` : ''}]`;
        keyIndexUsed = criticResult.keyIndexUsed;
        response = criticResult.response;
        isConsensus = true;
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🟢 [CONSENSUS - MULTI-AGENT] Thành công sau ${duration}s!`);
      } catch (err) {
        console.error('❌ Lỗi trong Consensus Engine:', err.message);
        
        // Cứu hộ Fallback: Dùng bản nháp của Gemini hoặc Groq nếu có
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
        } else if (groqDraftClean) {
          try {
            predictionData = JSON.parse(groqDraftClean);
            modelUsed = `${groqModelName} (Bản nháp Groq - Phản biện lỗi)`;
            keyIndexUsed = groqResultObj.keyIndexUsed;
            response = { text: groqDraftClean };
            console.log('⚠️ [FALLBACK] Đã cứu hộ thành công sử dụng bản nháp Groq.');
          } catch (e) {
            console.error('Lỗi parse bản nháp Groq khi cứu hộ:', e.message);
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
      isCached: false
    };

    // 7. Lưu dự đoán thành công vào SQLite
    if (db) {
      try {
        // Lấy tournament từ fixture (nếu có)
        let tournamentName = null;
        if (matchId) {
          try {
            const fixturesPath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
            if (fs.existsSync(fixturesPath)) {
              const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
              const fixtureMeta = fixturesData.fixtures?.find(f => f.id === matchId);
              if (fixtureMeta?.tournament) tournamentName = fixtureMeta.tournament;
            }
          } catch (e) { /* bỏ qua lỗi đọc tournament */ }
        }

        let evalResults = null;
        if (actualHomeScore !== null && actualAwayScore !== null) {
          evalResults = evaluateBetOutcome(
            predictionData.bets.oneXTwo.recommendation,
            predictionData.bets.overUnder.recommendation,
            predictionData.bets.handicap.recommendation,
            predictionData.bets.btts?.recommendation || 'No',
            predictionData.bets.corners?.recommendation || 'Under 8.5 Corners',
            predictionData.bets.cards?.recommendation || 'Under 3.5 Cards',
            { home: predictionData.predictedScore.home, away: predictionData.predictedScore.away },
            actualHomeScore,
            actualAwayScore,
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
            bet_evaluation_details, raw_prediction_json, tournament
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            tournamentName
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
