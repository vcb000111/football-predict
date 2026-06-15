import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          env[key] = val;
        }
      }
    });
  }
  return env;
}

async function sync() {
  const env = loadEnv();
  
  const localDbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const tursoUrl = env.TURSO_DATABASE_URL;
  const tursoToken = env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error("❌ Không tìm thấy TURSO_DATABASE_URL trong .env.local");
    return;
  }

  console.log("Connecting to Local SQLite...");
  const localDb = await open({
    filename: localDbPath,
    driver: sqlite3.Database
  });

  // Khởi tạo bảng nếu chưa có
  await localDb.exec(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_key TEXT UNIQUE,
      prompt_content TEXT,
      description TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Connecting to Turso Prod...");
  const prodClient = createClient({
    url: tursoUrl,
    authToken: tursoToken || ''
  });

  // 1. Lấy dữ liệu từ cả 2 nguồn
  const localPrompts = await localDb.all("SELECT prompt_key, prompt_content, last_updated FROM system_prompts");
  const prodRes = await prodClient.execute("SELECT prompt_key, prompt_content, last_updated FROM system_prompts");
  const prodPrompts = prodRes.rows;

  const localMap = new Map(localPrompts.map(p => [p.prompt_key, p]));
  const prodMap = new Map(prodPrompts.map(p => [p.prompt_key, p]));

  console.log("\n--- BẮT ĐẦU ĐỒNG BỘ THÔNG MINH ---");

  const allKeys = new Set([...localMap.keys(), ...prodMap.keys()]);

  for (const key of allKeys) {
    const local = localMap.get(key);
    const prod = prodMap.get(key);

    if (!local && prod) {
      // Chỉ có ở Prod -> Kéo về Local
      console.log(`📥 Kéo [${key}] từ Prod về Local...`);
      await localDb.run(
        `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, prod.prompt_content]
      );
    } else if (local && !prod) {
      // Chỉ có ở Local -> Đẩy lên Prod
      console.log(`📤 Đẩy [${key}] từ Local lên Prod...`);
      await prodClient.execute({
        sql: `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        args: [key, local.prompt_content]
      });
    } else if (local && prod) {
      const localContent = local.prompt_content ? local.prompt_content.trim() : "";
      const prodContent = prod.prompt_content ? prod.prompt_content.trim() : "";

      if (localContent !== prodContent) {
        // Khác nhau -> Ở đây ta coi Local là chuẩn nhất vì ta vừa sửa file code ở Local
        console.log(`🔄 Cập nhật [${key}] từ Local lên Prod (để khớp nội dung mới nhất)...`);
        await prodClient.execute({
          sql: `INSERT OR REPLACE INTO system_prompts (prompt_key, prompt_content, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)`,
          args: [key, local.prompt_content]
        });
      }
    }
  }

  await localDb.close();
  console.log("\n--- ĐỒNG BỘ HOÀN TẤT ---\n");
}

sync().catch(console.error);
