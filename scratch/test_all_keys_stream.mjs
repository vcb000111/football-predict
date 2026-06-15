import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';

async function test() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL)");
  console.log(`Tìm thấy ${apiKeys.length} keys active trong DB.`);

  for (const k of apiKeys) {
    const key = k.key_value;
    const prefix = key ? key.substring(0, 8) + '...' : 'null';
    console.log(`ID: ${k.id}, Prefix: ${prefix}, Length: ${key?.length}`);
    
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
      });
      
      let text = '';
      for await (const chunk of responseStream) {
        if (chunk.text) text += chunk.text;
      }
      console.log(`  ✅ Key ID ${k.id} HOẠT ĐỘNG TỐT (STREAM). Phản hồi: ${text.trim()}`);
    } catch (err) {
      console.log(`  ❌ Key ID ${k.id} LỖI (STREAM):`, err.message || err);
    }
  }
}

test().catch(err => console.error(err));
