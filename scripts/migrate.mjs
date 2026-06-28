import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';
import { ensureScheduleSchema } from '../src/lib/schedule/repository.js';

// Load biến môi trường từ các tệp tin .env (như .env.local)
loadEnvConfig(process.cwd());

async function runMigration() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;

  let db;
  const isProduction = !!dbUrl;

  console.log(`🚀 Bắt đầu quá trình Migration cơ sở dữ liệu...`);
  console.log(`Môi trường: ${isProduction ? 'PRODUCTION (Turso DB)' : 'DEVELOPMENT (SQLite cục bộ)'}`);

  if (isProduction) {
    console.log(`Kết nối tới Turso DB: ${dbUrl}`);
    const client = createClient({
      url: dbUrl,
      authToken: dbToken
    });

    db = {
      get: async (sql, params = []) => {
        const res = await client.execute({ sql, args: params });
        return res.rows[0];
      },
      all: async (sql, params = []) => {
        const res = await client.execute({ sql, args: params });
        return res.rows;
      },
      run: async (sql, params = []) => {
        const res = await client.execute({ sql, args: params });
        return {
          lastID: Number(res.lastInsertRowid),
          changes: res.rowsAffected
        };
      },
      exec: async (sql) => {
        await client.executeMultiple(sql);
      },
      batch: async (statements) => {
        return await client.batch(statements, 'write');
      }
    };
  } else {
    // Dùng dynamic import cho driver SQLite local
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const path = (await import('path')).default;

    const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
    console.log(`Kết nối tới SQLite: ${dbPath}`);
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    db.batch = async function (statements) {
      await this.run('BEGIN TRANSACTION');
      try {
        for (const stmt of statements) {
          await this.run(stmt.sql, stmt.args || []);
        }
        await this.run('COMMIT');
      } catch (err) {
        await this.run('ROLLBACK');
        throw err;
      }
    };
  }

  console.log('0. Khởi tạo schema canonical schedule...');
  await ensureScheduleSchema(db);

  // 1. Tạo bảng predictions
  console.log('1. Khởi tạo bảng predictions...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      home_team TEXT,
      away_team TEXT,
      predicted_home_score INTEGER,
      predicted_away_score INTEGER,
      win_prob_home INTEGER,
      win_prob_draw INTEGER,
      win_prob_away INTEGER,
      recommendation_1x2 TEXT,
      recommendation_ou TEXT,
      recommendation_handicap TEXT,
      actual_home_score INTEGER DEFAULT NULL,
      actual_away_score INTEGER DEFAULT NULL,
      is_correct INTEGER DEFAULT NULL,
      tournament TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrations bổ sung cột cho bảng predictions
  const predictionsColumns = [
    { name: 'is_correct_ou', type: 'INTEGER DEFAULT NULL' },
    { name: 'is_correct_handicap', type: 'INTEGER DEFAULT NULL' },
    { name: 'bet_evaluation_details', type: 'TEXT DEFAULT NULL' },
    { name: 'recommendation_btts', type: 'TEXT DEFAULT NULL' },
    { name: 'recommendation_corners', type: 'TEXT DEFAULT NULL' },
    { name: 'recommendation_cards', type: 'TEXT DEFAULT NULL' },
    { name: 'is_correct_btts', type: 'INTEGER DEFAULT NULL' },
    { name: 'is_correct_corners', type: 'INTEGER DEFAULT NULL' },
    { name: 'is_correct_cards', type: 'INTEGER DEFAULT NULL' },
    { name: 'raw_prediction_json', type: 'TEXT DEFAULT NULL' },
    { name: 'ou_line', type: 'REAL DEFAULT 2.5' },
    { name: 'corners_line', type: 'REAL DEFAULT 8.5' },
    { name: 'cards_line', type: 'REAL DEFAULT 3.5' },
    { name: 'handicap_line', type: 'REAL DEFAULT 0.0' },
    { name: 'predict_type', type: "TEXT DEFAULT 'full_time'" },
    { name: 'first_half_home_score', type: 'INTEGER DEFAULT NULL' },
    { name: 'first_half_away_score', type: 'INTEGER DEFAULT NULL' },
    { name: 'actual_first_half_home_score', type: 'INTEGER DEFAULT NULL' },
    { name: 'actual_first_half_away_score', type: 'INTEGER DEFAULT NULL' }
  ];

  for (const col of predictionsColumns) {
    try {
      await db.exec(`ALTER TABLE predictions ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Bỏ qua nếu cột đã tồn tại
    }
  }

  // 2. Tạo bảng api_keys
  console.log('2. Khởi tạo bảng api_keys...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT UNIQUE,
      status INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'gemini',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.exec(`ALTER TABLE api_keys ADD COLUMN provider TEXT DEFAULT 'gemini'`);
  } catch (e) { }

  // 3. Tạo bảng ai_models
  console.log('3. Khởi tạo bảng ai_models...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT UNIQUE,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'gemini',
      supports_image INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.exec(`ALTER TABLE ai_models ADD COLUMN provider TEXT DEFAULT 'gemini'`);
  } catch (e) { }
  try {
    await db.exec(`ALTER TABLE ai_models ADD COLUMN supports_image INTEGER DEFAULT 0`);
  } catch (e) { }
  try {
    await db.exec(`UPDATE ai_models SET supports_image = 1 WHERE model_name LIKE '%gemini%' OR provider = 'gemini'`);
    console.log('✅ Đã tự động kích hoạt tính năng hỗ trợ ảnh cho các model Gemini trong DB.');
  } catch (e) { }

  // 4. Tạo bảng ai_lessons
  console.log('4. Khởi tạo bảng ai_lessons...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      team_name TEXT,
      bet_type TEXT,
      lesson_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Tạo bảng search_providers & search_api_keys
  console.log('5. Khởi tạo cấu hình search...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS search_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT UNIQUE,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS search_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT,
      key_value TEXT,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider_name, key_value)
    )
  `);

  // 6. Tạo bảng teams
  console.log('6. Khởi tạo bảng teams...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT UNIQUE,
      fifa_rank INTEGER,
      elo_rating INTEGER,
      recent_form TEXT,
      avg_goals_scored REAL,
      avg_goals_conceded REAL,
      avg_corners_won REAL DEFAULT 4.5,
      avg_corners_conceded REAL DEFAULT 4.5,
      avg_cards_received REAL DEFAULT 1.8,
      style_of_play TEXT DEFAULT 'Cân bằng',
      play_style TEXT DEFAULT 'mixed',
      key_players TEXT,
      tactical_analysis TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const teamsColumns = [
    { name: 'avg_corners_won', type: 'REAL DEFAULT 4.5' },
    { name: 'avg_corners_conceded', type: 'REAL DEFAULT 4.5' },
    { name: 'avg_cards_received', type: 'REAL DEFAULT 1.8' },
    { name: 'style_of_play', type: 'TEXT DEFAULT \'Cân bằng\'' },
    { name: 'play_style', type: 'TEXT DEFAULT \'mixed\'' }
  ];
  for (const col of teamsColumns) {
    try {
      await db.exec(`ALTER TABLE teams ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) { }
  }

  // 7. Tạo bảng system_prompts
  console.log('7. Khởi tạo bảng system_prompts...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_key TEXT UNIQUE,
      prompt_content TEXT,
      description TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. Tạo bảng match_chats
  console.log('8. Khởi tạo bảng match_chats...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS match_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      sender TEXT, -- 'user' hoặc 'ai'
      message TEXT,
      model_used TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.exec(`ALTER TABLE match_chats ADD COLUMN model_used TEXT`);
  } catch (e) { }
  try {
    await db.exec(`ALTER TABLE match_chats ADD COLUMN image_url TEXT`);
    console.log('✅ Đã bổ sung cột image_url vào bảng match_chats thành công.');
  } catch (e) { }
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_match_chats_match_id ON match_chats (match_id)
  `);

  // 9. Tạo bảng tournament_groups
  console.log('9. Khởi tạo bảng tournament_groups...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament TEXT,
      season TEXT,
      group_name TEXT,
      team_name TEXT,
      UNIQUE(tournament, season, group_name, team_name)
    )
  `);

  // 10. Tạo bảng fixtures
  console.log('10. Khởi tạo bảng fixtures...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY,
      home_team TEXT,
      away_team TEXT,
      match_date TEXT,
      match_time TEXT,
      group_name TEXT,
      venue TEXT,
      tournament TEXT,
      season TEXT,
      actual_home_score INTEGER DEFAULT NULL,
      actual_away_score INTEGER DEFAULT NULL,
      actual_first_half_home_score INTEGER DEFAULT NULL,
      actual_first_half_away_score INTEGER DEFAULT NULL,
      is_test INTEGER DEFAULT 0,
      match_timeline TEXT DEFAULT NULL
    )
  `);
  try {
    await db.exec(`ALTER TABLE fixtures ADD COLUMN is_test INTEGER DEFAULT 0`);
  } catch (e) { }
  try {
    await db.exec(`ALTER TABLE fixtures ADD COLUMN match_timeline TEXT DEFAULT NULL`);
  } catch (e) { }
  try {
    await db.exec(`UPDATE fixtures SET is_test = 1 WHERE id LIKE 't%' OR LOWER(tournament) LIKE '%friendly%'`);
  } catch (e) { }

  // 11. Tạo bảng users
  console.log('11. Khởi tạo bảng users...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      oauth_provider TEXT DEFAULT 'local',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 12. Tạo bảng assistant_chats
  console.log('12. Khởi tạo bảng assistant_chats...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      sender TEXT,
      message TEXT,
      model_used TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- SEEDING DỮ LIỆU MẶC ĐỊNH ---
  console.log('🌱 Bắt đầu seeding dữ liệu...');

  // Dọn dẹp dữ liệu Groq cũ (theo yêu cầu không cần giữ của sếp)
  try {
    await db.run("DELETE FROM api_keys WHERE provider = 'groq'");
    await db.run("DELETE FROM ai_models WHERE provider = 'groq'");
    console.log('🧹 Đã dọn dẹp API keys và models của Groq.');
  } catch (e) {
    console.warn('⚠️ Lỗi khi dọn dẹp dữ liệu Groq cũ:', e.message);
  }

  // Seed ai_models
  const defaultModels = [
    { name: 'gemini-3.5-flash', provider: 'gemini', priority: 1, supports_image: 1 },
    { name: 'gemini-3-flash-preview', provider: 'gemini', priority: 2, supports_image: 1 },
    { name: 'gemini-3.1-flash-lite', provider: 'gemini', priority: 3, supports_image: 1 },
    { name: 'gemini-2.5-flash', provider: 'gemini', priority: 4, supports_image: 1 },
    { name: 'gemini-2.5-flash-lite', provider: 'gemini', priority: 5, supports_image: 1 },
    { name: 'meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter', priority: 6, supports_image: 0 },
    { name: 'meta-llama/llama-3.1-8b-instruct:free', provider: 'openrouter', priority: 7, supports_image: 0 },
    { name: 'deepseek/deepseek-chat', provider: 'openrouter', priority: 8, supports_image: 0 }
  ];
  for (const model of defaultModels) {
    try {
      // Dùng INSERT OR IGNORE
      await db.run(
        `INSERT OR IGNORE INTO ai_models (model_name, priority, status, provider, supports_image) VALUES (?, ?, 1, ?, ?)`,
        [model.name, model.priority, model.provider, model.supports_image]
      );
    } catch (e) {
      console.warn(`Không thể seed model ${model.name}:`, e.message);
    }
  }


  // Seed api_keys từ biến môi trường
  const apiKeysList = [];
  if (process.env.GEMINI_API_KEY) {
    apiKeysList.push(process.env.GEMINI_API_KEY.trim());
  }
  if (process.env.GEMINI_API_KEYS) {
    const splitKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    apiKeysList.push(...splitKeys);
  }
  const numberedKeys = Object.keys(process.env)
    .filter(key => key.startsWith('GEMINI_API_KEY_'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('GEMINI_API_KEY_', ''), 10);
      const numB = parseInt(b.replace('GEMINI_API_KEY_', ''), 10);
      return numA - numB;
    });
  numberedKeys.forEach(key => {
    if (process.env[key]) {
      apiKeysList.push(process.env[key].trim());
    }
  });

  const uniqueKeys = Array.from(new Set(apiKeysList));
  for (const key of uniqueKeys) {
    try {
      await db.run(`INSERT OR IGNORE INTO api_keys (key_value, status, provider) VALUES (?, 1, 'gemini')`, [key]);
    } catch (e) { }
  }
  if (uniqueKeys.length > 0) {
    console.log(`Seeded ${uniqueKeys.length} API keys từ biến môi trường.`);
  }

  // Seed search_providers
  const defaultProviders = [
    { name: 'tavily', priority: 1 },
    { name: 'brave', priority: 2 },
    { name: 'serper', priority: 3 }
  ];
  for (const provider of defaultProviders) {
    try {
      await db.run(`INSERT OR IGNORE INTO search_providers (provider_name, priority, status) VALUES (?, ?, 1)`, [provider.name, provider.priority]);
    } catch (e) { }
  }

  // Seed search_api_keys
  const defaultSearchKeys = [
    { provider: 'tavily', envVar: 'TAVILY_API_KEY' },
    { provider: 'brave', envVar: 'BRAVE_SEARCH_API_KEY' },
    { provider: 'serper', envVar: 'SERPER_API_KEY' }
  ];
  for (const item of defaultSearchKeys) {
    const keyValue = process.env[item.envVar];
    if (keyValue && keyValue.trim()) {
      try {
        await db.run(`INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, 1)`, [item.provider, keyValue.trim()]);
        console.log(`Seeded search API key cho ${item.provider}.`);
      } catch (e) { }
    }
  }

  // Seed teams (49 đội tuyển)
  const defaultTeams = [
    { name: "Mexico", rank: 15, elo: 1785, form: "D,W,L,W,W", goals: 1.6, conceded: 1.1, players: "Santiago Giménez, Edson Álvarez", tactics: "4-3-3 kiểm soát bóng biên và tạt cánh" },
    { name: "South Africa", rank: 59, elo: 1610, form: "D,W,L,D,D", goals: 1.1, conceded: 1.2, players: "Percy Tau, Ronwen Williams", tactics: "4-2-3-1 phòng ngự phản công chủ động" },
    { name: "South Korea", rank: 22, elo: 1750, form: "W,W,D,L,W", goals: 2.0, conceded: 0.9, players: "Son Heung-min, Lee Kang-in", tactics: "4-2-3-1 tấn công áp đặt và khai thác khoảng trống" },
    { name: "Czechia", rank: 36, elo: 1720, form: "L,W,W,D,L", goals: 1.4, conceded: 1.2, players: "Patrik Schick, Tomas Soucek", tactics: "3-4-1-2 tranh chấp thể lực và bóng bổng" },
    { name: "Canada", rank: 49, elo: 1680, form: "D,L,W,W,D", goals: 1.3, conceded: 1.0, players: "Alphonso Davies, Jonathan David", tactics: "4-4-2 tốc độ phản công dọc biên" },
    { name: "Bosnia and Herzegovina", rank: 74, elo: 1540, form: "L,L,L,W,L", goals: 0.9, conceded: 1.8, players: "Edin Dzeko, Sead Kolasinac", tactics: "3-5-2 đội hình lùi sâu, tận dụng bóng dài" },
    { name: "Qatar", rank: 38, elo: 1640, form: "W,W,W,D,W", goals: 1.8, conceded: 0.8, players: "Akram Afif, Almoez Ali", tactics: "5-3-2 phòng ngự phản công biên sắc bén" },
    { name: "Switzerland", rank: 19, elo: 1795, form: "D,W,W,D,D", goals: 1.5, conceded: 0.9, players: "Granit Xhaka, Manuel Akanji", tactics: "3-4-2-1 kiểm soát chặt khu trung tuyến" },
    { name: "Brazil", rank: 5, elo: 1980, form: "W,D,L,W,D", goals: 1.9, conceded: 1.0, players: "Vinícius Júnior, Rodrygo", tactics: "4-3-3 tấn công phóng khoáng, kỹ thuật cá nhân" },
    { name: "Haiti", rank: 90, elo: 1460, form: "L,D,W,L,D", goals: 1.2, conceded: 1.6, players: "Duckens Nazon, Frantzdy Pierrot", tactics: "4-1-4-1 phòng ngự số đông kiên cường" },
    { name: "Morocco", rank: 12, elo: 1840, form: "W,W,D,W,L", goals: 1.7, conceded: 0.7, players: "Achraf Hakimi, Hakim Ziyech", tactics: "4-3-3 phòng ngự phản công tốc độ cao" },
    { name: "Scotland", rank: 39, elo: 1675, form: "L,L,D,W,L", goals: 1.1, conceded: 1.5, players: "Scott McTominay, Andy Robertson", tactics: "5-4-1 thể lực va chạm mạnh, bóng chết" },
    { name: "United States", rank: 11, elo: 1810, form: "W,L,W,D,W", goals: 1.8, conceded: 1.0, players: "Christian Pulisic, Weston McKennie", tactics: "4-3-3 pressing cường độ cao tầm xa" },
    { name: "USA", rank: 11, elo: 1810, form: "W,L,W,D,W", goals: 1.8, conceded: 1.0, players: "Christian Pulisic, Weston McKennie", tactics: "4-3-3 pressing cường độ cao tầm xa" },
    { name: "Paraguay", rank: 56, elo: 1625, form: "D,L,W,D,L", goals: 0.8, conceded: 0.9, players: "Miguel Almirón, Julio Enciso", tactics: "4-4-2 phòng ngự chặt chẽ khu vực" },
    { name: "Australia", rank: 24, elo: 1730, form: "W,W,D,W,W", goals: 1.9, conceded: 0.6, players: "Mathew Ryan, Harry Souttar", tactics: "4-2-3-1 lối đá thể lực, tận dụng tình huống cố định" },
    { name: "Turkey", rank: 40, elo: 1715, form: "W,L,D,L,W", goals: 1.3, conceded: 1.4, players: "Hakan Calhanoglu, Arda Güler", tactics: "4-2-3-1 tấn công trung lộ, phối hợp ngắn" },
    { name: "Germany", rank: 16, elo: 1890, form: "W,W,D,W,W", goals: 2.1, conceded: 1.1, players: "Jamal Musiala, Florian Wirtz", tactics: "4-2-3-1 Gegenpressing dồn dập, kiểm soát bóng" },
    { name: "Curaçao", rank: 86, elo: 1420, form: "L,L,W,D,L", goals: 1.0, conceded: 1.7, players: "Juninho Bacuna, Leandro Bacuna", tactics: "4-5-1 lùi sâu bảo toàn tỉ số" },
    { name: "Ivory Coast", rank: 37, elo: 1735, form: "W,W,D,W,W", goals: 1.5, conceded: 0.9, players: "Franck Kessié, Sébastien Haller", tactics: "4-3-3 giàu thể lực, càn lướt mạnh mẽ ở biên" },
    { name: "Ecuador", rank: 31, elo: 1830, form: "W,L,W,D,W", goals: 1.3, conceded: 0.8, players: "Moisés Caicedo, Enner Valencia", tactics: "3-5-2 pressing biên dồn dập" },
    { name: "Japan", rank: 18, elo: 1875, form: "W,W,W,W,W", goals: 2.4, conceded: 0.6, players: "Kaoru Mitoma, Wataru Endo", tactics: "4-2-3-1 kiểm soát nhịp độ, chuyển đổi trạng thái chớp nhoáng" },
    { name: "Netherlands", rank: 7, elo: 1910, form: "W,W,L,W,D", goals: 2.0, conceded: 1.0, players: "Virgil van Dijk, Frenkie de Jong", tactics: "3-4-3 áp đặt tấn công, tịnh tiến bóng" },
    { name: "Sweden", rank: 28, elo: 1765, form: "L,W,W,L,W", goals: 1.7, conceded: 1.3, players: "Alexander Isak, Viktor Gyökeres", tactics: "4-4-2 tấn công trực diện tốc độ cao" },
    { name: "Tunisia", rank: 35, elo: 1630, form: "D,D,W,L,D", goals: 0.9, conceded: 0.8, players: "Ellyes Skhiri, Youssef Msakni", tactics: "4-1-4-1 phòng ngự lùi sâu khoa học kỷ luật" },
    { name: "Belgium", rank: 3, elo: 1920, form: "W,D,D,W,L", goals: 1.8, conceded: 0.9, players: "Kevin De Bruyne, Romelu Lukaku", tactics: "4-2-3-1 triển khai bóng nhanh trung lộ sáng tạo" },
    { name: "Egypt", rank: 34, elo: 1690, form: "W,D,L,W,W", goals: 1.6, conceded: 1.0, players: "Mohamed Salah, Mostafa Mohamed", tactics: "4-3-3 bóng ngắn cánh, dồn bóng cho Salah" },
    { name: "Iran", rank: 20, elo: 1770, form: "W,W,D,W,W", goals: 2.2, conceded: 0.8, players: "Mehdi Taremi, Sardar Azmoun", tactics: "4-4-2 bóng dài, tận dụng khả năng không chiến" },
    { name: "New Zealand", rank: 104, elo: 1410, form: "L,D,L,W,D", goals: 0.8, conceded: 1.5, players: "Chris Wood, Liberato Cacace", tactics: "5-3-2 bóng dài trực diện hướng tới Wood" },
    { name: "Cape Verde", rank: 65, elo: 1585, form: "W,L,W,D,W", goals: 1.2, conceded: 1.1, players: "Ryan Mendes, Bebé", tactics: "4-3-3 phản công tốc độ dựa vào các cá nhân" },
    { name: "Saudi Arabia", rank: 53, elo: 1600, form: "W,D,L,W,L", goals: 1.1, conceded: 1.0, players: "Salem Al-Dawsari, Firas Al-Buraikan", tactics: "4-5-1 đội hình hẹp, pressing tầm trung" },
    { name: "Spain", rank: 8, elo: 2010, form: "W,W,D,W,L", goals: 2.3, conceded: 0.9, players: "Rodri, Lamine Yamal", tactics: "4-3-3 kiểm soát bóng định vị, ban bật nhỏ" },
    { name: "Uruguay", rank: 14, elo: 1895, form: "W,W,L,D,W", goals: 2.0, conceded: 0.9, players: "Federico Valverde, Darwin Núñez", tactics: "4-3-3 pressing rát cường độ cao, tấn công nhanh" },
    { name: "France", rank: 2, elo: 2045, form: "W,D,W,L,W", goals: 2.2, conceded: 0.8, players: "Kylian Mbappé, Antoine Griezmann", tactics: "4-2-3-1 kiểm soát nhịp độ, bứt tốc biên" },
    { name: "Iraq", rank: 58, elo: 1590, form: "W,W,W,L,W", goals: 1.5, conceded: 1.1, players: "Aymen Hussein, Ali Jasim", tactics: "4-2-3-1 thể lực va chạm tầm cao" },
    { name: "Norway", rank: 47, elo: 1710, form: "L,D,W,L,W", goals: 1.6, conceded: 1.3, players: "Erling Haaland, Martin Ødegaard", tactics: "4-3-3 luân chuyển nhanh tới Haaland" },
    { name: "Senegal", rank: 17, elo: 1805, form: "W,D,W,W,D", goals: 1.4, conceded: 0.7, players: "Sadio Mané, Nicolas Jackson", tactics: "4-3-3 thể lực càn lướt cánh" },
    { name: "Algeria", rank: 43, elo: 1695, form: "L,W,D,W,L", goals: 1.5, conceded: 1.2, players: "Riyad Mahrez, Houssem Aouar", tactics: "4-2-3-1 kỹ thuật, phản công cánh" },
    { name: "Argentina", rank: 1, elo: 2130, form: "W,W,W,W,D", goals: 2.1, conceded: 0.5, players: "Lionel Messi, Lautaro Martínez", tactics: "4-3-3 kiểm soát chặt chẽ, sáng tạo không gian nhỏ" },
    { name: "Austria", rank: 25, elo: 1820, form: "W,W,L,W,D", goals: 1.8, conceded: 1.0, players: "Marcel Sabitzer, Konrad Laimer", tactics: "4-2-2-2 Gegenpressing liên tục khắp mặt sân" },
    { name: "Jordan", rank: 71, elo: 1560, form: "W,W,D,W,L", goals: 1.4, conceded: 1.1, players: "Musa Al-Taamari, Yazan Al-Naimat", tactics: "5-4-1 phòng thủ kiên cố, phản công" },
    { name: "Colombia", rank: 13, elo: 1915, form: "W,W,W,D,W", goals: 1.8, conceded: 0.8, players: "Luis Díaz, James Rodríguez", tactics: "4-2-3-1 tấn công biên sáng tạo tốc độ" },
    { name: "DR Congo", rank: 63, elo: 1595, form: "D,W,L,D,W", goals: 1.0, conceded: 0.9, players: "Chancel Mbemba, Yoane Wissa", tactics: "4-2-3-1 kỷ luật đội hình lùi sâu, pressing" },
    { name: "Portugal", rank: 6, elo: 1990, form: "W,L,W,W,D", goals: 2.5, conceded: 0.8, players: "Cristiano Ronaldo, Bruno Fernandes", tactics: "4-3-3 áp đặt lối chơi, sút xa biên đa dạng" },
    { name: "Uzbekistan", rank: 64, elo: 1650, form: "W,D,W,W,D", goals: 1.6, conceded: 0.8, players: "Eldor Shomurodov, Abbosbek Fayzullaev", tactics: "3-4-3 bọc lót tốt, chặt chẽ" },
    { name: "Croatia", rank: 10, elo: 1850, form: "D,D,W,W,L", goals: 1.5, conceded: 1.1, players: "Luka Modric, Mateo Kovacic", tactics: "4-3-3 kiểm soát bóng trung lộ nhịp điệu cao" },
    { name: "England", rank: 4, elo: 1970, form: "D,W,D,L,W", goals: 1.8, conceded: 0.9, players: "Jude Bellingham, Harry Kane", tactics: "4-2-3-1 kiểm soát và áp đảo thế trận" },
    { name: "Ghana", rank: 68, elo: 1580, form: "W,W,L,D,L", goals: 1.2, conceded: 1.4, players: "Mohammed Kudus, Thomas Partey", tactics: "4-2-3-1 phản công dựa vào bứt tốc cá nhân" },
    { name: "Panama", rank: 45, elo: 1660, form: "W,L,L,W,W", goals: 1.4, conceded: 1.3, players: "Adalberto Carrasquilla, Michael Murillo", tactics: "5-4-1 phòng ngự kỷ luật vững chắc" },

    // Premier League 2024-2025 Clubs
    { name: "Manchester City", rank: 1, elo: 2040, form: "W,W,W,W,W", goals: 2.5, conceded: 1.0, players: "Erling Haaland, Kevin De Bruyne", tactics: "3-2-4-1 kiểm soát bóng áp đảo tuyệt đối" },
    { name: "Arsenal", rank: 2, elo: 2000, form: "W,W,D,W,W", goals: 2.3, conceded: 0.8, players: "Martin Odegaard, Bukayo Saka", tactics: "4-3-3 pressing tầm cao đồng bộ" },
    { name: "Liverpool", rank: 3, elo: 1980, form: "W,W,W,L,W", goals: 2.2, conceded: 0.9, players: "Mohamed Salah, Virgil van Dijk", tactics: "4-3-3 gegenpressing cường độ cao" },
    { name: "Chelsea", rank: 4, elo: 1850, form: "W,D,L,W,W", goals: 1.8, conceded: 1.3, players: "Cole Palmer, Enzo Fernandez", tactics: "4-2-3-1 tịnh tiến bóng nhanh biên" },
    { name: "Manchester United", rank: 5, elo: 1810, form: "L,L,W,D,L", goals: 1.4, conceded: 1.5, players: "Bruno Fernandes, Marcus Rashford", tactics: "4-2-3-1 phòng ngự phản công trực diện" },
    { name: "Tottenham", rank: 6, elo: 1830, form: "W,L,L,W,W", goals: 1.9, conceded: 1.4, players: "Son Heung-min, James Maddison", tactics: "4-3-3 dâng cao hàng thủ phản công nhanh" },

    // La Liga 2024-2025 Clubs
    { name: "Real Madrid", rank: 1, elo: 2050, form: "W,D,W,W,D", goals: 2.4, conceded: 0.7, players: "Jude Bellingham, Vinicius Junior", tactics: "4-3-1-2 chuyển đổi trạng thái chớp nhoáng" },
    { name: "Barcelona", rank: 2, elo: 1960, form: "W,W,W,W,L", goals: 2.5, conceded: 1.1, players: "Robert Lewandowski, Lamine Yamal", tactics: "4-3-3 kiểm soát bóng định vị cánh rộng" },
    { name: "Atletico Madrid", rank: 3, elo: 1890, form: "W,D,W,D,W", goals: 1.8, conceded: 0.9, players: "Antoine Griezmann, Koke", tactics: "5-3-2 phòng ngự khối sâu phản công nhanh" },
    { name: "Girona", rank: 4, elo: 1840, form: "L,W,L,D,W", goals: 2.0, conceded: 1.3, players: "Viktor Tsygankov, Yangel Herrera", tactics: "4-3-3 chồng biên linh hoạt" },
    { name: "Real Sociedad", rank: 5, elo: 1800, form: "L,D,W,L,D", goals: 1.2, conceded: 1.1, players: "Mikel Oyarzabal, Martin Zubimendi", tactics: "4-3-3 pressing tầm trung kỷ luật" },
    { name: "Athletic Bilbao", rank: 6, elo: 1830, form: "W,D,L,W,W", goals: 1.5, conceded: 1.2, players: "Inaki Williams, Nico Williams", tactics: "4-2-3-1 bóng dài phản công trực diện biên" }
  ];

  for (const team of defaultTeams) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO teams (team_name, fifa_rank, elo_rating, recent_form, avg_goals_scored, avg_goals_conceded, key_players, tactical_analysis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [team.name, team.rank, team.elo, team.form, team.goals, team.conceded, team.players, team.tactics]
      );
    } catch (e) { }
  }
  console.log(`Seeded ${defaultTeams.length} teams.`);

  // Seed system_prompts
  const predictSystemContent = `Bạn là một chuyên gia phân tích bóng đá thế giới hàng đầu, chuyên gia soi kèo bóng đá cho kỳ World Cup 2026.
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

Chú ý: Tổng phần trăm trong \"winProbability\" (home + draw + away) phải bằng chính xác 100. Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

  const predictCriticContent = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

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

  const syncFixturesContent = `Hãy tìm kiếm lịch thi đấu chính thức đầy đủ và kết quả các trận đấu bóng đá của giải đấu {{tournament}} mùa giải {{season}}.
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

  const matchChatSystemContent = `Bạn là một trợ lý AI phân tích kèo bóng đá chuyên sâu. Hãy hỗ trợ tư vấn nhận định kèo cược cho người chơi dựa trên các thông số dữ liệu ELO, Poisson, Monte Carlo và tình huống thực tế của trận đấu sau.

--- THÔNG TIN TRẬN ĐẤU ---
- Trận đấu: {{homeTeam}} vs {{awayTeam}}
- Giải đấu: {{tournament}} | Mùa giải: {{season}}
- Thời gian: {{date}} lúc {{time}}
- Địa điểm: {{venue}}
{{predictionContext}}

--- HƯỚNG DẪN TƯ VẤN ---
1. Chỉ trả lời các câu hỏi liên quan đến trận đấu này, phong độ, chiến thuật, tình hình chấn thương, phân tích kèo cược thể thao.
2. Từ chối lịch sự nếu người dùng hỏi các chủ đề ngoài bóng đá hoặc các trận đấu không liên quan.
3. Câu trả lời cần ngắn gọn, rõ ràng, tập trung phân tích logic kèo và thực tế trận đấu để gợi ý lựa chọn tối ưu cho người chơi.`;

  const defaultPrompts = [
    {
      key: 'predict_system',
      description: 'Khung prompt chính của chuyên gia phân tích bóng đá, phân tích kèo cược và Chain of Thought.',
      content: predictSystemContent
    },
    {
      key: 'match_chat_system',
      description: 'Khung prompt hướng dẫn trợ lý AI chat, tư vấn soi kèo và phân tích trận đấu chi tiết.',
      content: matchChatSystemContent
    },
    {
      key: 'predict_rag_template',
      description: 'Template hiển thị ngữ cảnh tìm kiếm Internet trước trận đấu (RAG Search).',
      content: `--- THÔNG TIN TRA CỨU TỪ INTERNET (TIN TỨC & THỐNG KÊ THỰC TẾ) ---
{{searchContext}}`
    },
    {
      key: 'predict_feedback_template',
      description: 'Template hiển thị lịch sử và tỉ lệ sai số dự đoán cũ của hai đội (Feedback Loop).',
      content: `--- LỊCH SỬ DỰ ĐOÁN & SAI SỐ TRƯỚC ĐÂY CỦA BẠN (HỌC MÁY NGỮ CẢNH) ---
Hệ thống đã lưu lại các dự đoán trước đây của bạn đối với 2 đội bóng này. Hãy phân tích kỹ các lỗi dự đoán trước đây để tránh lặp lại sai lầm và tăng độ chính xác lần này:
{{historyTexts}}
Tỷ lệ dự đoán đúng kết quả chung cuộc (1X2) gần đây của bạn với 2 đội này là: {{rate}}% ({{correct}}/{{total}} trận đúng).`
    },
    {
      key: 'predict_critic_template',
      description: 'Mẫu prompt cho Tác nhân Phản biện và Tinh chỉnh dự đoán (Consensus Engine Option 3).',
      content: predictCriticContent
    },
    {
      key: 'sync_fixtures_template',
      description: 'Khung prompt hướng dẫn AI tìm kiếm (RAG Search) và trích xuất lịch thi đấu / kết quả bóng đá.',
      content: syncFixturesContent
    }
  ];

  for (const promptItem of defaultPrompts) {
    try {
      await db.run(
        `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, description) VALUES (?, ?, ?)`,
        [promptItem.key, promptItem.content, promptItem.description]
      );
    } catch (e) { }
  }
  console.log('Seeded system prompts.');

  // Seed fixtures và groups từ fixtures.json
  console.log('🌱 Khởi tạo và seeding fixtures/tournament_groups...');
  try {
    // --- ĐỒNG BỘ DỰ ĐOÁN (PREDICTIONS) TỪ SQLITE LOCAL LÊN CLOUD ---
    if (isProduction) {
      console.log('🔄 Đang kiểm tra và đồng bộ predictions từ SQLite cục bộ lên Turso DB...');
      try {
        const sqlite3 = (await import('sqlite3')).default;
        const { open } = await import('sqlite');
        const path = (await import('path')).default;
        const fs = await import('fs');
        const localDbPath = path.join(process.cwd(), 'worldcup_predictions.db');

        if (fs.existsSync(localDbPath)) {
          const localDb = await open({
            filename: localDbPath,
            driver: sqlite3.Database
          });

          // Kiểm tra xem bảng predictions có tồn tại ở local không
          const tableCheck = await localDb.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'"
          );

          if (tableCheck) {
            const localPredictions = await localDb.all("SELECT * FROM predictions");
            console.log(`Tìm thấy ${localPredictions.length} bản ghi predictions cục bộ.`);

            if (localPredictions.length > 0) {
              // Chia nhỏ (chunk) để chèn theo mẻ 50 bản ghi
              const chunkSize = 50;
              let syncedCount = 0;

              for (let i = 0; i < localPredictions.length; i += chunkSize) {
                const chunk = localPredictions.slice(i, i + chunkSize);
                const statements = chunk.map(row => {
                  const keys = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null);
                  return {
                    sql: `INSERT OR REPLACE INTO predictions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
                    args: keys.map(k => row[k])
                  };
                });

                await db.batch(statements);
                syncedCount += chunk.length;
                console.log(`   - Đã chèn mẻ ${syncedCount}/${localPredictions.length} bản ghi.`);
              }
              console.log(`✅ Đồng bộ thành công ${syncedCount} bản ghi predictions lên Turso DB.`);
            }
          } else {
            console.log('⚠️ Bảng predictions không tồn tại trong SQLite cục bộ, bỏ qua đồng bộ.');
          }
          await localDb.close();
        } else {
          console.log('⚠️ Không tìm thấy tệp worldcup_predictions.db cục bộ để đồng bộ predictions.');
        }
      } catch (syncErr) {
        console.error('⚠️ Lỗi trong quá trình đồng bộ predictions cục bộ:', syncErr.message);
      }
    }

    // Kiểm tra độc lập từng bảng dữ liệu
    const fixtureCountRes = await db.get('SELECT COUNT(*) as count FROM fixtures');
    const hasFixtures = fixtureCountRes && fixtureCountRes.count > 0;

    const groupCountRes = await db.get('SELECT COUNT(*) as count FROM tournament_groups');
    const hasGroups = groupCountRes && groupCountRes.count > 0;

    if (hasFixtures && hasGroups) {
      console.log('ℹ️ Bảng fixtures và tournament_groups đều đã có dữ liệu. Bỏ qua bước seeding để bảo toàn dữ liệu thực tế.');
    } else {
      const fs = await import('fs');
      const path = await import('path');
      const fixturesFilePath = path.join(process.cwd(), 'src', 'data', 'fixtures.json');
      if (fs.existsSync(fixturesFilePath)) {
        const fileData = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
        const groupsStatements = [];
        const fixturesStatements = [];

        // Seed tournament_groups độc lập
        if (!hasGroups && fileData.groups && Array.isArray(fileData.groups)) {
          console.log('🌱 Thực hiện seeding bảng tournament_groups...');
          const defaultTournament = 'World Cup 2026';
          const defaultSeason = '2026';
          for (const grp of fileData.groups) {
            const groupName = grp.name;
            if (grp.teams && Array.isArray(grp.teams)) {
              for (const team of grp.teams) {
                groupsStatements.push({
                  sql: `INSERT OR REPLACE INTO tournament_groups (tournament, season, group_name, team_name) VALUES (?, ?, ?, ?)`,
                  args: [defaultTournament, defaultSeason, groupName, team]
                });
              }
            }
          }
        } else if (hasGroups) {
          console.log('ℹ️ Bảng tournament_groups đã có dữ liệu. Bỏ qua seeding bảng này.');
        }

        // Seed fixtures độc lập
        if (!hasFixtures && fileData.fixtures && Array.isArray(fileData.fixtures)) {
          console.log('🌱 Thực hiện seeding bảng fixtures...');
          for (const f of fileData.fixtures) {
            const actualHome = f.actualHomeScore !== undefined && f.actualHomeScore !== null ? parseInt(f.actualHomeScore, 10) : null;
            const actualAway = f.actualAwayScore !== undefined && f.actualAwayScore !== null ? parseInt(f.actualAwayScore, 10) : null;
            const firstHalfHome = f.actualFirstHalfScore && f.actualFirstHalfScore.home !== undefined && f.actualFirstHalfScore.home !== null ? parseInt(f.actualFirstHalfScore.home, 10) : null;
            const firstHalfAway = f.actualFirstHalfScore && f.actualFirstHalfScore.away !== undefined && f.actualFirstHalfScore.away !== null ? parseInt(f.actualFirstHalfScore.away, 10) : null;

            const isTestVal = f.isTest || (f.tournament && f.tournament.toLowerCase().includes('friendly')) ? 1 : 0;
            const matchTimelineVal = f.matchTimeline ? JSON.stringify(f.matchTimeline) : null;

            fixturesStatements.push({
              sql: `INSERT OR REPLACE INTO fixtures (id, home_team, away_team, match_date, match_time, group_name, venue, tournament, season, actual_home_score, actual_away_score, actual_first_half_home_score, actual_first_half_away_score, is_test, match_timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                f.id,
                f.homeTeam,
                f.awayTeam,
                f.date,
                f.time,
                f.group || '',
                f.venue || '',
                f.tournament || 'World Cup 2026',
                f.season || '2026',
                actualHome,
                actualAway,
                firstHalfHome,
                firstHalfAway,
                isTestVal,
                matchTimelineVal
              ]
            });
          }
        } else if (hasFixtures) {
          console.log('ℹ️ Bảng fixtures đã có dữ liệu. Bỏ qua seeding bảng này.');
        }

        const allStatements = [...groupsStatements, ...fixturesStatements];
        if (allStatements.length > 0) {
          await db.batch(allStatements);
          console.log(`✅ Đã thực hiện seeding thành công (${groupsStatements.length} group-teams, ${fixturesStatements.length} fixtures).`);
        }
      } else {
        console.warn('⚠️ File fixtures.json không tồn tại để seed.');
      }
    }
  } catch (dbError) {
    console.error('⚠️ Lỗi khi seed fixtures từ fixtures.json:', dbError.message);
  }


  console.log('🎉 Quá trình Migration hoàn tất thành công!');
}

runMigration().catch(err => {
  console.error('❌ Lỗi trong quá trình Migration:', err);
  process.exit(1);
});
