import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';

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
  }

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
  } catch (e) {}

  // 3. Tạo bảng ai_models
  console.log('3. Khởi tạo bảng ai_models...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT UNIQUE,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'gemini',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.exec(`ALTER TABLE ai_models ADD COLUMN provider TEXT DEFAULT 'gemini'`);
  } catch (e) {}

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
      key_players TEXT,
      tactical_analysis TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const teamsColumns = [
    { name: 'avg_corners_won', type: 'REAL DEFAULT 4.5' },
    { name: 'avg_corners_conceded', type: 'REAL DEFAULT 4.5' },
    { name: 'avg_cards_received', type: 'REAL DEFAULT 1.8' },
    { name: 'style_of_play', type: 'TEXT DEFAULT \'Cân bằng\'' }
  ];
  for (const col of teamsColumns) {
    try {
      await db.exec(`ALTER TABLE teams ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {}
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

  // --- SEEDING DỮ LIỆU MẶC ĐỊNH ---
  console.log('🌱 Bắt đầu seeding dữ liệu...');

  // Seed ai_models
  const defaultModels = [
    { name: 'gemini-3.5-flash', provider: 'gemini', priority: 1 },
    { name: 'gemini-3-flash-preview', provider: 'gemini', priority: 2 },
    { name: 'gemini-3.1-flash-lite', provider: 'gemini', priority: 3 },
    { name: 'gemini-2.5-flash', provider: 'gemini', priority: 4 },
    { name: 'gemini-2.5-flash-lite', provider: 'gemini', priority: 5 },
    { name: 'llama-3.1-8b-instant', provider: 'groq', priority: 6 },
    { name: 'gemma2-9b-it', provider: 'groq', priority: 7 },
    { name: 'llama-3.3-70b-specdec', provider: 'groq', priority: 8 }
  ];
  for (const model of defaultModels) {
    try {
      // Dùng INSERT OR IGNORE
      await db.run(
        `INSERT OR IGNORE INTO ai_models (model_name, priority, status, provider) VALUES (?, ?, 1, ?)`,
        [model.name, model.priority, model.provider]
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
    } catch (e) {}
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
    } catch (e) {}
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
      } catch (e) {}
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
    } catch (e) {}
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

  const predictCriticContent = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

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

  const defaultPrompts = [
    {
      key: 'predict_system',
      description: 'Khung prompt chính của chuyên gia phân tích bóng đá, phân tích kèo cược và Chain of Thought.',
      content: predictSystemContent
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
    }
  ];

  for (const promptItem of defaultPrompts) {
    try {
      await db.run(
        `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, description) VALUES (?, ?, ?)`,
        [promptItem.key, promptItem.content, promptItem.description]
      );
    } catch (e) {}
  }
  console.log('Seeded system prompts.');

  console.log('🎉 Quá trình Migration hoàn tất thành công!');
}

runMigration().catch(err => {
  console.error('❌ Lỗi trong quá trình Migration:', err);
  process.exit(1);
});
