import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';

async function test() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1");
  console.log(`Tìm thấy ${apiKeys.length} keys active trong DB.`);

  for (const k of apiKeys) {
    const key = k.key_value;
    const prefix = key ? key.substring(0, 8) + '...' : 'null';
    console.log(`ID: ${k.id}, Provider: ${k.provider}, Prefix: ${prefix}, Length: ${key?.length}`);
    
    if (k.provider === 'gemini') {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
        });
        console.log(`  ✅ Key ID ${k.id} HOẠT ĐỘNG TỐT. Phản hồi: ${response.text?.trim()}`);
      } catch (err) {
        console.log(`  ❌ Key ID ${k.id} LỖI:`, err.message || err);
      }
    }
  }
}

test().catch(err => console.error(err));
