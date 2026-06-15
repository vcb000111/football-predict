import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';

loadEnvConfig(process.cwd());

async function runMigration() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;

  let db;
  const isProduction = !!dbUrl;

  console.log(`🚀 Bắt đầu quá trình Migration cơ sở dữ liệu V3...`);
  console.log(`Môi trường: ${isProduction ? 'PRODUCTION (Turso DB)' : 'DEVELOPMENT (SQLite cục bộ)'}`);

  if (isProduction) {
    console.log(`Kết nối tới Turso DB: ${dbUrl}`);
    const client = createClient({
      url: dbUrl,
      authToken: dbToken
    });

    db = {
      exec: async (sql) => {
        await client.executeMultiple(sql);
      }
    };
  } else {
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const path = (await import('path')).default;

    const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }

  console.log('Khởi tạo bảng assistant_chats...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      sender TEXT,
      message TEXT,
      model_used TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ Migration V3 thành công!');
}

runMigration().catch(err => {
  console.error('❌ Migration V3 thất bại:', err);
  process.exit(1);
});
