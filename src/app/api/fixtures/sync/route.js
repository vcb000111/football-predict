import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';
import { searchInternet } from '@/lib/search';
import { getDB } from '@/lib/db';
import { callOpenRouterModel } from '@/lib/openrouter';
import {
  isWorldCup2026Request
} from '@/lib/world-cup-schedule';
import { fetchFifaSchedule } from '@/lib/schedule/sources/fifa';
import { fetchRoadtripsSchedule } from '@/lib/schedule/sources/roadtrips';
import {
  createSyncRun,
  ensureScheduleSchema,
  finishSyncRun,
  getCanonicalFixtures,
  saveCandidate,
  saveSourceSnapshot,
  upsertScheduleSource
} from '@/lib/schedule/repository';
import { candidateToPreview, validateFixtureCandidate } from '@/lib/schedule/validator';

function normalizeTeamName(name) {
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
}

function getFirstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDateValue(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return '';
}

function normalizeTimeValue(value) {
  const raw = cleanText(value).toLowerCase().replace('h', ':');
  if (!raw) return '';

  const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!timeMatch) return '';

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3];

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeSyncedFixture(rawFixture, defaults) {
  const homeTeam = cleanText(getFirstValue(rawFixture, ['homeTeam', 'home_team', 'home', 'teamHome']));
  const awayTeam = cleanText(getFirstValue(rawFixture, ['awayTeam', 'away_team', 'away', 'teamAway']));
  const date = normalizeDateValue(getFirstValue(rawFixture, ['date', 'matchDate', 'match_date']));

  if (!homeTeam || !awayTeam || normalizeTeamName(homeTeam) === normalizeTeamName(awayTeam) || !date) {
    return null;
  }

  return {
    id: cleanText(getFirstValue(rawFixture, ['id', 'matchId', 'match_id'])),
    homeTeam,
    awayTeam,
    date,
    time: normalizeTimeValue(getFirstValue(rawFixture, ['time', 'matchTime', 'match_time', 'kickoff'])) || '20:00',
    group: cleanText(getFirstValue(rawFixture, ['group', 'groupName', 'group_name', 'round', 'stage'])) || 'Group stage',
    venue: cleanText(getFirstValue(rawFixture, ['venue', 'stadium', 'location'])) || 'TBA',
    tournament: cleanText(getFirstValue(rawFixture, ['tournament', 'competition', 'league'])) || defaults.tournament,
    season: cleanText(getFirstValue(rawFixture, ['season', 'year'])) || defaults.season,
    sourceName: defaults.sourceName || 'AI/RAG field validator',
    isValidated: true
  };
}

function getFixtureIdentity(fixture) {
  const homeTeam = fixture.homeTeam ?? fixture.home_team;
  const awayTeam = fixture.awayTeam ?? fixture.away_team;
  const date = fixture.date ?? fixture.match_date;
  const teams = [normalizeTeamName(homeTeam), normalizeTeamName(awayTeam)].sort().join('|');
  return `${teams}|${date || ''}`;
}

function normalizeSyncedFixtures(rawFixtures, defaults, existingFixtures = []) {
  const existingKeys = new Set(existingFixtures.map(getFixtureIdentity));
  const seenKeys = new Set();

  return rawFixtures
    .map((fixture) => normalizeSyncedFixture(fixture, defaults))
    .filter(Boolean)
    .filter((fixture) => {
      const key = getFixtureIdentity(fixture);
      if (existingKeys.has(key) || seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

const FIXTURES_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'fixtures.json');

// Hàm helper gọi đơn lẻ một model Gemini
async function callGeminiModel(model, apiKeys, prompt) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(45000), // Timeout sau 45 giây
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
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

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

export async function POST(request) {
  try {
    // 1. Phân tích tham số Giải đấu và Mùa giải
    let requestData = {};
    try {
      requestData = await request.json();
    } catch (e) {}
    
    const { tournament = 'World Cup 2026', season = '2026' } = requestData;

    // 2. Phân tích danh sách API Keys và Models từ SQLite
    let db = null;
    let geminiKeys = [];
    let openrouterKeys = [];
    let combinedModels = [];

    try {
      db = await getDB();
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      openrouterKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'openrouter').map(row => row.key_value.trim())));
      
      combinedModels = activeModelsRows.map(row => ({
        name: row.model_name.trim(),
        provider: row.provider || 'gemini'
      }));
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // Fallback: nếu db rỗng thì đọc từ biến môi trường
    if (geminiKeys.length === 0 && openrouterKeys.length === 0) {
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
      geminiKeys = Array.from(new Set(apiKeysList));
      
      if (geminiKeys.length > 0) {
        combinedModels = [
          { name: 'gemini-2.5-flash', provider: 'gemini' },
          { name: 'gemini-1.5-flash', provider: 'gemini' }
        ];
      }
    }

    if (isWorldCup2026Request(tournament, season)) {
      if (!db) db = await getDB();
      await ensureScheduleSchema(db);

      const syncRunId = await createSyncRun(db, { tournament, season });
      let savedCandidates = [];

      try {
        const sourceResults = await Promise.all([
          fetchFifaSchedule({ tournament, season }),
          fetchRoadtripsSchedule({ tournament, season })
        ]);

        const canonicalRows = await getCanonicalFixtures(db, { tournament, season });
        const byMatchNumber = new Map();

        for (const result of sourceResults) {
          await upsertScheduleSource(db, result.source);
          const sourceHash = await saveSourceSnapshot(db, {
            source: result.source,
            tournament,
            season,
            rawExcerpt: result.rawExcerpt,
            fixtures: result.fixtures
          });

          for (const fixture of result.fixtures) {
            const current = byMatchNumber.get(fixture.matchNumber);
            const enrichedFixture = {
              ...fixture,
              sourceHash,
              confidence: Math.max(fixture.confidence || 0, result.source.confidence || 0)
            };

            if (!current || (result.source.priority || 100) < (current.sourcePriority || 100)) {
              byMatchNumber.set(fixture.matchNumber, {
                ...enrichedFixture,
                sourcePriority: result.source.priority || 100
              });
            }
          }
        }

        for (const fixture of Array.from(byMatchNumber.values()).sort((a, b) => a.matchNumber - b.matchNumber)) {
          const validation = validateFixtureCandidate(fixture, canonicalRows);
          const candidate = await saveCandidate(db, syncRunId, {
            payload: fixture,
            validationStatus: validation.validationStatus,
            validationReason: validation.validationReason,
            diffType: validation.diffType,
            confidence: fixture.confidence,
            sourceKey: fixture.sourceKey
          });
          savedCandidates.push(candidate);
        }

        const counts = savedCandidates.reduce((acc, candidate) => {
          if (candidate.diffType === 'added') acc.addedCount++;
          else if (candidate.diffType === 'updated') acc.updatedCount++;
          else if (candidate.diffType === 'rejected') acc.rejectedCount++;
          else acc.unchangedCount++;
          return acc;
        }, { addedCount: 0, updatedCount: 0, rejectedCount: 0, unchangedCount: 0 });

        await finishSyncRun(db, syncRunId, {
          status: 'completed',
          ...counts
        });

        const previewCandidates = savedCandidates
          .map(candidateToPreview)
          .filter((candidate) => candidate.diffType !== 'unchanged');

        return NextResponse.json({
          success: true,
          isMock: false,
          isDeterministic: true,
          syncRunId,
          candidates: previewCandidates,
          newFixtures: previewCandidates,
          totalCandidates: savedCandidates.length,
          addedCount: counts.addedCount,
          updatedCount: counts.updatedCount,
          rejectedCount: counts.rejectedCount,
          unchangedCount: counts.unchangedCount,
          modelUsed: 'Canonical schedule engine',
          message: `Đồng bộ canonical schedule hoàn tất: ${counts.addedCount} mới, ${counts.updatedCount} cập nhật, ${counts.rejectedCount} bị chặn.`
        });
      } catch (syncError) {
        await finishSyncRun(db, syncRunId, {
          status: 'failed',
          addedCount: 0,
          updatedCount: 0,
          rejectedCount: 0,
          unchangedCount: 0,
          errorMessage: syncError.message
        });
        throw syncError;
      }
    }

    // 3. Chế độ Giả lập (Mock Mode) khi không có API Key nào khả dụng
    if (geminiKeys.length === 0 && openrouterKeys.length === 0) {
      console.log(`\n💡 [MOCK MODE - SYNC FIXTURES] Không tìm thấy API Key. Chạy giả lập lấy lịch thi đấu.`);

      const mockNewFixtures = [
        {
          "id": "m13",
          "homeTeam": "Mexico",
          "awayTeam": "South Korea",
          "date": "2026-06-17",
          "time": "18:00",
          "group": "Group A",
          "venue": "Estadio Azteca, Mexico City"
        },
        {
          "id": "m14",
          "homeTeam": "South Africa",
          "awayTeam": "Czechia",
          "date": "2026-06-17",
          "time": "21:00",
          "group": "Group A",
          "venue": "BMO Field, Toronto"
        },
        {
          "id": "m15",
          "homeTeam": "Canada",
          "awayTeam": "Qatar",
          "date": "2026-06-18",
          "time": "17:00",
          "group": "Group B",
          "venue": "BMO Field, Toronto"
        },
        {
          "id": "m16",
          "homeTeam": "USA",
          "awayTeam": "Australia",
          "date": "2026-06-19",
          "time": "20:00",
          "group": "Group D",
          "venue": "SoFi Stadium, Los Angeles"
        },
        {
          "id": "m17",
          "homeTeam": "Brazil",
          "awayTeam": "Morocco",
          "date": "2026-06-20",
          "time": "15:00",
          "group": "Group C",
          "venue": "MetLife Stadium, East Rutherford"
        },
        {
          "id": "m18",
          "homeTeam": "Argentina",
          "awayTeam": "Austria",
          "date": "2026-06-20",
          "time": "18:00",
          "group": "Group J",
          "venue": "Hard Rock Stadium, Miami"
        },
        {
          "id": "m19",
          "homeTeam": "Germany",
          "awayTeam": "Côte d'Ivoire",
          "date": "2026-06-21",
          "time": "14:00",
          "group": "Group E",
          "venue": "Mercedes-Benz Stadium, Atlanta"
        },
        {
          "id": "m20",
          "homeTeam": "France",
          "awayTeam": "Norway",
          "date": "2026-06-21",
          "time": "17:00",
          "group": "Group I",
          "venue": "Lincoln Financial Field, Philadelphia"
        },
        {
          "id": "m21",
          "homeTeam": "Argentina",
          "awayTeam": "Portugal",
          "date": "2026-07-02",
          "time": "20:00",
          "group": "Round of 32",
          "venue": "SoFi Stadium, Los Angeles"
        },
        {
          "id": "m22",
          "homeTeam": "Brazil",
          "awayTeam": "Spain",
          "date": "2026-07-03",
          "time": "17:00",
          "group": "Round of 32",
          "venue": "MetLife Stadium, East Rutherford"
        },
        {
          "id": "m23",
          "homeTeam": "Germany",
          "awayTeam": "England",
          "date": "2026-07-04",
          "time": "16:00",
          "group": "Round of 32",
          "venue": "AT&T Stadium, Arlington"
        },
        {
          "id": "m24",
          "homeTeam": "France",
          "awayTeam": "Netherlands",
          "date": "2026-07-05",
          "time": "19:00",
          "group": "Round of 32",
          "venue": "Hard Rock Stadium, Miami"
        }
      ];

      // Gắn thông tin giải đấu và mùa giải động được yêu cầu
      const processedMock = mockNewFixtures.map(f => ({
        ...f,
        tournament,
        season
      }));

      // Lấy danh sách trận đấu hiện tại từ database để lọc trùng
      let existingFixtures = [];
      try {
        if (!db) db = await getDB();
        existingFixtures = await db.all("SELECT * FROM fixtures");
      } catch (dbErr) {
        console.warn('⚠️ Lỗi lấy fixtures từ DB, dùng local fallback:', dbErr.message);
        existingFixtures = currentData.fixtures.map(f => ({
          home_team: f.homeTeam,
          away_team: f.awayTeam,
          match_date: f.date
        }));
      }

      const newFixtures = normalizeSyncedFixtures(processedMock, { tournament, season }, existingFixtures);

      return NextResponse.json({
        success: true,
        isMock: true,
        newFixtures,
        modelUsed: 'Dự phòng / Mock',
        message: `Lấy lịch thi đấu giả lập thành công (Đã tìm thấy ${newFixtures.length} trận đấu mới).`
      });
    }

    // 4. Chế độ Real Mode: Gọi AI cùng RAG Search Grounding
    let aiPrompt = '';
    const fallbackPrompt = `Hãy tìm kiếm lịch thi đấu chính thức đầy đủ và kết quả các trận đấu bóng đá của giải đấu ${tournament} mùa giải ${season}.
Nhiệm vụ của bạn:
1. Sử dụng thông tin tra cứu thực tế từ Internet bên dưới để lấy thông tin lịch thi đấu chính thức.
2. Đối chiếu chéo các nguồn tin để loại bỏ hoàn toàn lịch thi đấu giả định (simulated), dự báo (predicted) hoặc lịch cũ chưa chính thức.
3. Trích xuất Ngày (date) và Giờ (time) BẮT BUỘC phải là GIỜ ĐỊA PHƯƠNG (Local Time) tại sân vận động diễn ra trận đấu. TUYỆT ĐỐI không tự ý quy đổi sang giờ Việt Nam hay giờ quốc tế UTC.
4. Trả về danh sách các trận đấu mới dưới định dạng JSON thô duy nhất theo cấu trúc sau (giới hạn tối đa 20-30 trận tiêu biểu của giải đấu để tránh quá giới hạn Token phản hồi):
{
  "fixtures": [
    {
      "id": "m_cụ_thể", // ví dụ: m1, m2... hoặc chuỗi id tự sinh không trùng
      "homeTeam": "<Tên tiếng Anh chuẩn của đội nhà, ví dụ: Arsenal, Chelsea, Real Madrid, Mexico, USA, Brazil...>",
      "awayTeam": "<Tên tiếng Anh chuẩn của đội khách, ví dụ: South Africa, Spain, England...>",
      "date": "<Ngày diễn ra theo GIỜ ĐỊA PHƯƠNG định dạng YYYY-MM-DD, ví dụ: 2026-06-11>",
      "time": "<Giờ thi đấu theo GIỜ ĐỊA PHƯƠNG định dạng HH:MM, ví dụ: 15:00>",
      "group": "<Tên bảng hoặc vòng đấu, ví dụ: 'Group A', 'Group B', hoặc 'Round of 32', 'Matchweek 1', 'Round of 16'>",
      "venue": "<Tên sân vận động và thành phố>"
    }
  ]
}

Chú ý: Chỉ trả về chuỗi JSON thô, không chứa markdown, không có chữ thừa. Hãy giữ nguyên các tên quốc gia/đội bóng chuẩn tiếng Anh.`;

    try {
      if (!db) {
        db = await getDB();
      }
      const dbPrompt = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'sync_fixtures_template'");
      
      if (!dbPrompt || !dbPrompt.prompt_content || !dbPrompt.prompt_content.includes('GIỜ ĐỊA PHƯƠNG')) {
        console.log('🔄 [Database Autoupdate] Phát hiện prompt sync_fixtures_template phiên bản cũ hoặc rỗng. Đang tự động cập nhật bản mới...');
        
        const dbSavePrompt = fallbackPrompt
          .replace(new RegExp(tournament, 'g'), '{{tournament}}')
          .replace(new RegExp(season, 'g'), '{{season}}');
          
        await db.run(
          `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, description) 
           VALUES ('sync_fixtures_template', ?, 'Khung prompt hướng dẫn AI tìm kiếm (RAG Search) và trích xuất lịch thi đấu / kết quả bóng đá.')`,
          [dbSavePrompt]
        );
        aiPrompt = fallbackPrompt;
      } else {
        aiPrompt = dbPrompt.prompt_content
          .replace(/\{\{tournament\}\}/g, tournament)
          .replace(/\{\{season\}\}/g, season);
      }
    } catch (dbPromptError) {
      console.warn('⚠️ Lỗi khi đọc/cập nhật prompt sync_fixtures_template từ DB, sử dụng fallback:', dbPromptError.message);
      aiPrompt = fallbackPrompt;
    }

    let searchContext = '';
    let searchQuery = `${tournament} ${season} official match schedule dates venues matches`;
    const lowerTournament = tournament.toLowerCase();
    if (lowerTournament.includes('world cup')) {
      searchQuery += ' site:wikipedia.org OR site:fifa.com';
    } else if (lowerTournament.includes('premier league') || lowerTournament.includes('ngoại hạng anh')) {
      searchQuery += ' site:wikipedia.org OR site:premierleague.com';
    } else if (lowerTournament.includes('la liga')) {
      searchQuery += ' site:wikipedia.org OR site:laliga.com';
    } else {
      searchQuery += ' site:wikipedia.org';
    }

    try {
      let searchResults = await searchInternet(searchQuery);
      if ((!searchResults || searchResults.length === 0) && searchQuery.includes(' site:')) {
        const fallbackQuery = `${tournament} ${season} official match schedule dates venues matches`;
        console.log(`⚠️ Không tìm thấy kết quả với bộ lọc site, chạy fallback query: "${fallbackQuery}"`);
        searchResults = await searchInternet(fallbackQuery);
      }
      console.log(`   - 🔍 [RAG SEARCH RESULTS] Đã tìm thấy ${searchResults?.length || 0} kết quả lịch thi đấu:`);
      if (searchResults && searchResults.length > 0) {
        searchContext = `
--- THÔNG TIN LỊCH THI ĐẤU TRA CỨU TỪ INTERNET (THỰC TẾ) ---
Dưới đây là các kết quả tìm kiếm thực tế về lịch thi đấu từ internet:
${searchResults.slice(0, 6).map((s, idx) => `[${idx + 1}] ${s}`).join('\n')}
`;
      } else {
        console.log(`     ⚠️ Cảnh báo: Không tìm thấy lịch thi đấu chính thức nào trực tuyến.`);
      }
    } catch (searchErr) {
      console.warn('⚠️ Lỗi khi tra cứu internet cho đồng bộ lịch đấu:', searchErr.message);
    }

    const finalPrompt = aiPrompt + '\n' + searchContext;

    let callResult = null;
    let lastError = null;

    for (const modelInfo of combinedModels) {
      const { name: modelName, provider } = modelInfo;
      const startTime = Date.now();
      try {
        console.log(`\n🤖 [AI REQUEST - SYNC FIXTURES] Gọi AI đồng bộ lịch thi đấu`);
        console.log(`   - Model: ${modelName} (${provider})`);
        
        let responseText = '';
        if (provider === 'gemini' && geminiKeys.length > 0) {
          const result = await callGeminiModel(modelName, geminiKeys, finalPrompt);
          responseText = result.response.text;
          callResult = { text: responseText, modelUsed: modelName, provider };
        } else if (provider === 'openrouter' && openrouterKeys.length > 0) {
          const result = await callOpenRouterModel(modelName, openrouterKeys, finalPrompt);
          responseText = result.response.text;
          callResult = { text: responseText, modelUsed: modelName, provider };
        }
        
        if (callResult) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`🟢 [AI RESPONSE - SYNC FIXTURES] Thành công!`);
          console.log(`   - Model: ${modelName} (${provider}) trong ${duration}s`);
          break;
        }
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.warn(`🔴 [AI ERROR - SYNC FIXTURES] Thất bại với model ${modelName} (${provider}) sau ${duration}s:`, err.message);
        lastError = err;
      }
    }

    if (!callResult) {
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const text = callResult.text;
    let syncData;

    try {
      syncData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      console.error('Lỗi parse JSON lịch thi đấu đồng bộ:', text);
      return NextResponse.json(
        { error: 'Dữ liệu lịch thi đấu trả về từ AI không đúng định dạng JSON.', raw: text },
        { status: 500 }
      );
    }

    const aiFixtures = syncData.fixtures || [];
    if (aiFixtures.length === 0) {
      return NextResponse.json({
        success: false,
        newFixtures: [],
        message: 'AI không trả về trận đấu mới nào từ Google Search.'
      });
    }

    // Lấy danh sách trận đấu hiện tại từ database để lọc trùng
    let existingFixtures = [];
    try {
      if (!db) db = await getDB();
      existingFixtures = await db.all("SELECT * FROM fixtures");
    } catch (dbErr) {
      console.warn('⚠️ Lỗi lấy fixtures từ DB, dùng local fallback:', dbErr.message);
      existingFixtures = currentData.fixtures.map(f => ({
        home_team: f.homeTeam,
        away_team: f.awayTeam,
        match_date: f.date
      }));
    }

    // Chuẩn hóa, loại bản ghi thiếu dữ liệu và lọc trùng trước khi preview/import.
    const newFixtures = normalizeSyncedFixtures(aiFixtures, { tournament, season }, existingFixtures);

    return NextResponse.json({
      success: true,
      isMock: false,
      newFixtures,
      modelUsed: callResult.modelUsed,
      message: `Quét thành công! Tìm thấy ${newFixtures.length} trận đấu mới.`
    });

  } catch (error) {
    console.error('Lỗi khi đồng bộ lịch thi đấu:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi đồng bộ lịch thi đấu', details: error.message },
      { status: 500 }
    );
  }
}
