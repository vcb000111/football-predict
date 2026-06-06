import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function testTavilyUsage() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Lấy key Tavily đầu tiên đang active
  const keyRow = await db.get(
    `SELECT key_value FROM search_api_keys WHERE provider_name = 'tavily' AND status = 1 LIMIT 1`
  );

  if (!keyRow) {
    console.log('❌ Không tìm thấy API Key Tavily nào đang active trong SQLite.');
    await db.close();
    return;
  }

  const apiKey = keyRow.key_value.trim();
  console.log(`🔑 Sử dụng API Key Tavily: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);

  try {
    const res = await fetch('https://api.tavily.com/usage', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log('📦 JSON Response:', JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('❌ Lỗi gọi API:', err.message);
  } finally {
    await db.close();
  }
}

testTavilyUsage();
