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

async function checkSync() {
  const env = loadEnv();
  
  // 1. Lấy dữ liệu từ SQLite Local
  const localDbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Connecting to Local SQLite Database at: ${localDbPath}`);
  
  let localPrompts = [];
  try {
    const db = await open({
      filename: localDbPath,
      driver: sqlite3.Database
    });
    
    // Check if table exists
    const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='system_prompts'");
    if (!tableCheck) {
      console.error("❌ Bảng 'system_prompts' không tồn tại ở Local!");
      await db.close();
      return;
    }
    
    localPrompts = await db.all("SELECT prompt_key, prompt_content, last_updated FROM system_prompts");
    console.log(`ℹ️ Local có ${localPrompts.length} prompts.`);
    await db.close();
  } catch (err) {
    console.error("❌ Lỗi khi đọc Local SQLite:", err.message);
    return;
  }

  // 2. Lấy dữ liệu từ Turso Prod
  const tursoUrl = env.TURSO_DATABASE_URL;
  const tursoToken = env.TURSO_AUTH_TOKEN;
  
  let prodPrompts = [];
  if (!tursoUrl) {
    console.error("❌ Không tìm thấy TURSO_DATABASE_URL trong .env.local");
    return;
  }

  console.log(`⚡ Connecting to Production Turso DB at: ${tursoUrl}`);
  try {
    const client = createClient({
      url: tursoUrl,
      authToken: tursoToken || ''
    });
    
    const res = await client.execute("SELECT prompt_key, prompt_content, last_updated FROM system_prompts");
    prodPrompts = res.rows;
    console.log(`ℹ️ Prod (Turso) có ${prodPrompts.length} prompts.`);
  } catch (err) {
    console.error("❌ Lỗi khi đọc Turso Prod:", err.message);
    return;
  }

  // 3. So sánh dữ liệu
  const localMap = new Map();
  localPrompts.forEach(p => localMap.set(p.prompt_key, p));

  const prodMap = new Map();
  prodPrompts.forEach(p => prodMap.set(p.prompt_key, p));

  console.log("\n=== KẾT QUẢ SO SÁNH ===");
  
  const allKeys = new Set([...localMap.keys(), ...prodMap.keys()]);
  let matches = 0;
  let mismatches = 0;
  
  for (const key of allKeys) {
    const local = localMap.get(key);
    const prod = prodMap.get(key);
    
    if (!local) {
      console.log(`⚠️ Prompt [${key}]: Chỉ có trên PROD, không có ở LOCAL.`);
      mismatches++;
    } else if (!prod) {
      console.log(`⚠️ Prompt [${key}]: Chỉ có ở LOCAL, không có trên PROD.`);
      mismatches++;
    } else {
      const localContent = local.prompt_content ? local.prompt_content.trim() : "";
      const prodContent = prod.prompt_content ? prod.prompt_content.trim() : "";
      
      if (localContent === prodContent) {
        console.log(`✅ Prompt [${key}]: Khớp hoàn toàn.`);
        matches++;
      } else {
        console.log(`❌ Prompt [${key}]: KHÁC NHAU!`);
        console.log(`   - Local Length: ${localContent.length}, Last Updated: ${local.last_updated}`);
        console.log(`   - Prod Length: ${prodContent.length}, Last Updated: ${prod.last_updated}`);
        
        // Show snippet of differences
        const diffIndex = findFirstDiff(localContent, prodContent);
        if (diffIndex !== -1) {
          console.log(`   - Điểm khác biệt đầu tiên tại ký tự ${diffIndex}:`);
          console.log(`     Local: "...${localContent.substring(Math.max(0, diffIndex - 20), diffIndex + 50)}..."`);
          console.log(`     Prod:  "...${prodContent.substring(Math.max(0, diffIndex - 20), diffIndex + 50)}..."`);
        }
        mismatches++;
      }
    }
  }
  
  console.log(`\nTóm tắt: Khớp ${matches}/${allKeys.size} prompts. Lệch: ${mismatches}.`);
}

function findFirstDiff(str1, str2) {
  const minLen = Math.min(str1.length, str2.length);
  for (let i = 0; i < minLen; i++) {
    if (str1[i] !== str2[i]) {
      return i;
    }
  }
  if (str1.length !== str2.length) {
    return minLen;
  }
  return -1;
}

checkSync();
