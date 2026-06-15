import { getDB } from './db.js';
import { searchInternet } from './search.js';
import { updateMatchResult } from './results-updater.js';
import { POST as predictPost } from '../app/api/predict/route.js';

// Bảng map tên đội tuyển từ tiếng Việt sang tiếng Anh chuẩn để truy vấn DB
const VI_EN_TEAMS_MAP = {
  "đức": "Germany", "pháp": "France", "tây ban nha": "Spain", "ý": "Italy",
  "anh": "England", "bồ đào nha": "Portugal", "hà lan": "Netherlands", "bỉ": "Belgium",
  "croatia": "Croatia", "thổ nhĩ kỳ": "Turkey", "türkiye": "Turkey",
  "argentina": "Argentina", "brazil": "Brazil", "uruguay": "Uruguay", "colombia": "Colombia",
  "ecuador": "Ecuador", "chile": "Chile", "paraguay": "Paraguay",
  "mexico": "Mexico", "mỹ": "USA", "hoa kỳ": "USA", "usa": "USA", "canada": "Canada",
  "nhật bản": "Japan", "nhật": "Japan", "hàn quốc": "South Korea", "hàn": "South Korea",
  "saudi arabia": "Saudi Arabia", "ả rập xê út": "Saudi Arabia", "qatar": "Qatar",
  "úc": "Australia", "australia": "Australia", "iran": "Iran", "iraq": "Iraq",
  "nam phi": "South Africa", "maroc": "Morocco", "ma rốc": "Morocco",
  "bờ biển ngà": "Ivory Coast", "senegal": "Senegal"
};

// Hàm loại bỏ dấu tiếng Việt để so khớp mềm dẻo
function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
}

function normalizeTeamName(name) {
  if (!name) return '';
  const clean = name.trim().toLowerCase();
  
  // 1. Thử so khớp trực tiếp qua map cứng
  if (VI_EN_TEAMS_MAP[clean]) {
    return VI_EN_TEAMS_MAP[clean];
  }
  
  // 2. Thử so khớp sau khi xóa dấu
  const noTone = removeVietnameseTones(clean);
  if (VI_EN_TEAMS_MAP[noTone]) {
    return VI_EN_TEAMS_MAP[noTone];
  }
  
  return name; // Giữ nguyên nếu không khớp
}

// 1. Tool tìm kiếm internet tổng quát
export async function toolSearchInternet({ query }) {
  try {
    const results = await searchInternet(query);
    if (!results || results.length === 0) {
      return { result: "Không tìm thấy thông tin mới nào trên internet." };
    }
    return { result: results.slice(0, 5).join('\n') };
  } catch (err) {
    return { error: `Lỗi tìm kiếm internet: ${err.message}` };
  }
}

// 2. Tool tìm kiếm tỷ lệ kèo nhà cái trực tuyến
export async function toolSearchBookmakerOdds({ homeTeam, awayTeam }) {
  try {
    const query = `${homeTeam} vs ${awayTeam} bookmaker odds 1X2 handicap over under`;
    const results = await searchInternet(query);
    if (!results || results.length === 0) {
      return { result: "Không tìm thấy thông tin tỷ lệ kèo thực tế nào trên internet." };
    }
    return { result: results.slice(0, 5).join('\n') };
  } catch (err) {
    return { error: `Lỗi tìm kiếm tỷ lệ kèo: ${err.message}` };
  }
}

// 3. Tool truy vấn lịch thi đấu và tỷ số thực tế
export async function toolQueryFixtures({ searchTerm }) {
  try {
    const db = await getDB();
    const normalized = normalizeTeamName(searchTerm);
    const sql = `
      SELECT id, home_team, away_team, match_date, match_time, group_name, venue, tournament, actual_home_score, actual_away_score 
      FROM fixtures 
      WHERE home_team LIKE ? OR away_team LIKE ? 
      ORDER BY match_date DESC, match_time DESC 
      LIMIT 5
    `;
    const rows = await db.all(sql, [`%${normalized}%`, `%${normalized}%`]);
    if (!rows || rows.length === 0) {
      return { result: `Không tìm thấy thông tin lịch thi đấu hay kết quả nào cho "${searchTerm}".` };
    }
    return { fixtures: rows };
  } catch (err) {
    return { error: `Lỗi truy vấn lịch thi đấu: ${err.message}` };
  }
}

// 4. Tool truy vấn lịch sử dự đoán AI
export async function toolQueryPredictions({ searchTerm }) {
  try {
    const db = await getDB();
    const normalized = normalizeTeamName(searchTerm);
    const sql = `
      SELECT id, home_team, away_team, predicted_home_score, predicted_away_score, win_prob_home, win_prob_draw, win_prob_away, recommendation_1x2, recommendation_ou, recommendation_handicap, actual_home_score, actual_away_score, is_correct, created_at 
      FROM predictions 
      WHERE home_team LIKE ? OR away_team LIKE ? 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    const rows = await db.all(sql, [`%${normalized}%`, `%${normalized}%`]);
    if (!rows || rows.length === 0) {
      return { result: `Không tìm thấy dữ liệu dự đoán nào liên quan đến "${searchTerm}".` };
    }
    return { predictions: rows };
  } catch (err) {
    return { error: `Lỗi truy vấn dự đoán: ${err.message}` };
  }
}

// 5. Tool truy vấn thông tin chi tiết đội tuyển
export async function toolQueryTeamDetails({ searchTerm }) {
  try {
    const db = await getDB();
    const normalized = normalizeTeamName(searchTerm);
    const sql = `SELECT * FROM teams WHERE team_name LIKE ?`;
    const row = await db.get(sql, [`%${normalized}%`]);
    if (!row) {
      return { result: `Không tìm thấy dữ liệu chi tiết của đội tuyển "${searchTerm}".` };
    }
    return { team: row };
  } catch (err) {
    return { error: `Lỗi truy vấn chi tiết đội tuyển: ${err.message}` };
  }
}

// 6. Tool chạy dự đoán AI thời gian thực cho trận đấu
export async function toolPredictMatch({ homeTeam, awayTeam, predictType = 'full_time' }) {
  try {
    const mockRequest = {
      json: async () => ({
        homeTeam: normalizeTeamName(homeTeam),
        awayTeam: normalizeTeamName(awayTeam),
        predictType,
        forceRefresh: true
      })
    };
    const response = await predictPost(mockRequest);
    const data = await response.json();
    if (data.error) {
      return { error: data.error };
    }
    return { prediction: data };
  } catch (err) {
    return { error: `Lỗi khi thực thi dự đoán AI: ${err.message}` };
  }
}

// 7. Tool tự động cào và cập nhật kết quả trận đấu
export async function toolUpdateMatchResult({ matchId }) {
  try {
    const db = await getDB();
    
    // Tìm thông tin trận đấu trong DB trước
    const fixture = await db.get('SELECT home_team, away_team, id FROM fixtures WHERE id = ?', [matchId]);
    if (!fixture) {
      return { error: `Không tìm thấy trận đấu nào có ID là "${matchId}".` };
    }

    console.log(`[CHAT TOOL] Bắt đầu gọi cập nhật kết quả cho trận: ${fixture.home_team} vs ${fixture.away_team} (${matchId})`);
    const result = await updateMatchResult({
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      matchId: fixture.id,
      force: true,
      db
    });

    return result;
  } catch (err) {
    return { error: `Lỗi khi cập nhật kết quả trận đấu: ${err.message}` };
  }
}

// 8. Tool truy vấn thống kê tỷ lệ thắng của AI
export async function toolQueryAiAccuracyStats() {
  try {
    const db = await getDB();
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN CAST(is_correct AS INTEGER) = 1 THEN 1 ELSE 0 END) as correct_1x2,
        SUM(CASE WHEN CAST(is_correct_ou AS INTEGER) = 1 THEN 1 ELSE 0 END) as correct_ou,
        SUM(CASE WHEN CAST(is_correct_handicap AS INTEGER) = 1 THEN 1 ELSE 0 END) as correct_handicap
      FROM predictions 
      WHERE is_correct IS NOT NULL
    `;
    const stats = await db.get(sql);
    if (!stats || stats.total === 0) {
      return { result: "Chưa có dữ liệu thống kê dự đoán hoàn thành trong hệ thống." };
    }
    return { stats };
  } catch (err) {
    return { error: `Lỗi tính toán thống kê: ${err.message}` };
  }
}

// 9. Tool lấy dữ liệu sâu của trận đấu đang xem
export async function toolQueryCurrentMatchContext({ matchId }) {
  try {
    const db = await getDB();
    
    // Lấy thông tin fixture
    const fixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [matchId]);
    if (!fixture) {
      return { error: `Không tìm thấy trận đấu đang xem có ID "${matchId}"` };
    }

    // Lấy dự đoán gần nhất của trận đấu này
    const prediction = await db.get(
      'SELECT * FROM predictions WHERE match_id = ? ORDER BY created_at DESC LIMIT 1', 
      [matchId]
    );

    return {
      fixture,
      prediction: prediction || null
    };
  } catch (err) {
    return { error: `Lỗi truy vấn ngữ cảnh trận đấu hiện tại: ${err.message}` };
  }
}

// 10. Tool lấy các trận đấu hot sắp diễn ra
export async function toolQueryHotMatches() {
  try {
    const db = await getDB();
    
    // Lấy thời gian UTC hiện tại và cộng thêm 7 tiếng thành giờ Việt Nam
    const nowGmt7 = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const dateStr = nowGmt7.toISOString().split('T')[0]; // Định dạng YYYY-MM-DD
    
    // Lấy tối đa 5 trận hot diễn ra từ hôm nay trở đi, ưu tiên giải đấu chính thức và ELO cao
    const sql = `
      SELECT f.id, f.home_team, f.away_team, f.match_date, f.match_time, f.group_name, f.venue, f.tournament,
             t1.elo_rating as home_elo, t2.elo_rating as away_elo
      FROM fixtures f
      LEFT JOIN teams t1 ON f.home_team = t1.team_name
      LEFT JOIN teams t2 ON f.away_team = t2.team_name
      WHERE f.match_date >= ? AND f.actual_home_score IS NULL
      ORDER BY f.match_date ASC, f.match_time ASC, (COALESCE(t1.elo_rating, 0) + COALESCE(t2.elo_rating, 0)) DESC
      LIMIT 5
    `;
    const rows = await db.all(sql, [dateStr]);
    if (!rows || rows.length === 0) {
      return { result: "Không có trận đấu hot sắp diễn ra nào được lên lịch." };
    }
    return { hotMatches: rows };
  } catch (err) {
    return { error: `Lỗi truy vấn trận đấu hot: ${err.message}` };
  }
}

// Cấu trúc khai báo Schema Tools (Function Declarations) gửi cho Gemini API
export const chatboxToolsDeclarations = [
  {
    functionDeclarations: [
      {
        name: 'search_internet',
        description: 'Tìm kiếm tin tức bóng đá tổng quát và thông tin trực tuyến mới nhất (như thời tiết, chấn thương cầu thủ...).',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Từ khóa tìm kiếm (Ví dụ: "Đức vs Curaçao ngày 15/6 chấn thương")'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'search_bookmaker_odds',
        description: 'Tìm kiếm tỷ lệ kèo cược (odds 1X2, handicap, over/under) thời gian thực của trận đấu từ các nhà cái uy tín.',
        parameters: {
          type: 'OBJECT',
          properties: {
            homeTeam: { type: 'STRING', description: 'Tên đội nhà (tiếng Anh)' },
            awayTeam: { type: 'STRING', description: 'Tên đội khách (tiếng Anh)' }
          },
          required: ['homeTeam', 'awayTeam']
        }
      },
      {
        name: 'query_fixtures',
        description: 'Truy vấn danh sách lịch thi đấu và kết quả thực tế các trận đấu bóng đá của đội bóng trong database hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội bóng cần tìm kiếm' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'query_predictions',
        description: 'Truy vấn lịch sử dự đoán kèo cược AI của đội bóng từ database hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội bóng cần tìm kiếm' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'query_team_details',
        description: 'Truy vấn thông tin thực lực chi tiết của đội tuyển (ELO, Rank FIFA, phong độ, đội hình, chiến thuật) từ database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội tuyển cần tra cứu' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'predict_match',
        description: 'Kích hoạt chạy phân tích dự đoán AI realtime cho một cặp đấu chưa diễn ra hoặc cần phân tích lại.',
        parameters: {
          type: 'OBJECT',
          properties: {
            homeTeam: { type: 'STRING', description: 'Tên đội nhà' },
            awayTeam: { type: 'STRING', description: 'Tên đội khách' },
            predictType: { type: 'STRING', enum: ['full_time', 'first_half', 'second_half'], description: 'Loại dự đoán' }
          },
          required: ['homeTeam', 'awayTeam']
        }
      },
      {
        name: 'update_match_result',
        description: 'Cập nhật kết quả tỷ số thực tế và tự động chấm điểm cược cho trận đấu đã kết thúc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            matchId: { type: 'STRING', description: 'ID của trận đấu (Ví dụ: "m1", "m2")' }
          },
          required: ['matchId']
        }
      },
      {
        name: 'query_ai_accuracy_stats',
        description: 'Truy vấn và tính toán tỷ lệ dự đoán chính xác tổng quan (kèo 1X2, handicap, over/under) của AI hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'query_current_match_context',
        description: 'Truy vấn dữ liệu chi tiết (Poisson, Monte Carlo, kèo cược) của trận đấu người dùng đang xem trên màn hình.',
        parameters: {
          type: 'OBJECT',
          properties: {
            matchId: { type: 'STRING', description: 'ID trận đấu đang xem' }
          },
          required: ['matchId']
        }
      },
      {
        name: 'query_hot_matches',
        description: 'Truy vấn danh sách các trận đấu tiêu điểm (ELO cao hoặc World Cup) sắp diễn ra trong vòng 48 giờ để gợi ý.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

// Hàm router thực thi các hàm local dựa trên yêu cầu gọi hàm của Gemini
export async function executeChatboxTool(name, args) {
  console.log(`[CHAT TOOL EXECUTE] Gọi hàm: ${name} với tham số:`, args);
  switch (name) {
    case 'search_internet':
      return await toolSearchInternet(args);
    case 'search_bookmaker_odds':
      return await toolSearchBookmakerOdds(args);
    case 'query_fixtures':
      return await toolQueryFixtures(args);
    case 'query_predictions':
      return await toolQueryPredictions(args);
    case 'query_team_details':
      return await toolQueryTeamDetails(args);
    case 'predict_match':
      return await toolPredictMatch(args);
    case 'update_match_result':
      return await toolUpdateMatchResult(args);
    case 'query_ai_accuracy_stats':
      return await toolQueryAiAccuracyStats();
    case 'query_current_match_context':
      return await toolQueryCurrentMatchContext(args);
    case 'query_hot_matches':
      return await toolQueryHotMatches();
    default:
      throw new Error(`Công cụ "${name}" không được hỗ trợ.`);
  }
}
