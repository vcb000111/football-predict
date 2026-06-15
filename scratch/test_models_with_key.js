import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';

async function test() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1 AND provider = 'gemini' LIMIT 1");
  if (apiKeys.length === 0) {
    console.error('Không tìm thấy Gemini key nào.');
    return;
  }
  const key = apiKeys[0].key_value;
  console.log(`Kiểm thử với Key ID: ${apiKeys[0].id}, Prefix: ${key.substring(0, 8)}...`);

  const models = await db.all("SELECT model_name FROM ai_models WHERE status = 1 AND provider = 'gemini'");
  console.log('Các models active trong DB:', models.map(m => m.model_name));

  const ai = new GoogleGenAI({ apiKey: key });

  for (const m of models) {
    try {
      console.log(`\nTesting model: ${m.model_name}...`);
      const response = await ai.models.generateContent({
        model: m.model_name,
        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
      });
      console.log(`  ✅ Model ${m.model_name} HOẠT ĐỘNG. Phản hồi: ${response.text?.trim()}`);
    } catch (err) {
      console.log(`  ❌ Model ${m.model_name} LỖI:`, err.message || err);
    }
  }
}

test().catch(err => console.error(err));
