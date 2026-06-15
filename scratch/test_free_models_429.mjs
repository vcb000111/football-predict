import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';

// Tắt TLS verification phòng trường hợp EDR/Proxy chặn
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Đọc env.local để lấy Turso credentials
const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL;
process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;
process.env.ENCRYPTION_SECRET = env.ENCRYPTION_SECRET;

// Danh sách các model free lấy trực tiếp từ phần 1 của free_models_report.md
const freeModels = [
  'nex-agi/nex-n2-pro:free',
  'nvidia/nemotron-3.5-content-safety:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openrouter/owl-alpha',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'poolside/laguna-xs.2:free',
  'poolside/laguna-m.1:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'google/lyria-3-pro-preview',
  'google/lyria-3-clip-preview',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openrouter/free',
  'liquid/lfm-2.5-1.2b-thinking:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'qwen/qwen3-coder:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free'
];

async function main() {
  try {
    const dbModule = await import('../src/lib/db.js');
    const deobfuscateKey = dbModule.deobfuscateKey;

    const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    const keysRes = await client.execute("SELECT key_value FROM api_keys WHERE provider = 'openrouter' AND status = 1");
    if (keysRes.rows.length === 0) {
      console.error('❌ Không tìm thấy OpenRouter API Key.');
      process.exit(1);
    }
    const testKey = deobfuscateKey(keysRes.rows[0].key_value.toString().trim());
    if (client.close) client.close();

    console.log(`🔓 Giải mã API Key thành công. Bắt đầu test ${freeModels.length} models free xem có bị Rate Limit 429...`);

    const results = [];

    // Chạy song song giới hạn (tối đa 3 model chạy cùng lúc để tránh spam API key gây 429 giả)
    const limit = 3;
    for (let i = 0; i < freeModels.length; i += limit) {
      const chunk = freeModels.slice(i, i + limit);
      
      const promises = chunk.map(async (modelId) => {
        console.log(`📡 Đang test: ${modelId}...`);
        const start = Date.now();
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${testKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://football-predict.com',
              'X-Title': 'Model Rate Limit 429 Test'
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: 'Say "OK" in exactly one word.' }],
              temperature: 0,
              max_tokens: 10
            }),
            signal: AbortSignal.timeout(10000) // Timeout 10s cho nhanh
          });

          const duration = (Date.now() - start) / 1000;
          
          if (!response.ok) {
            const errText = await response.text();
            let parsedErr;
            try {
              parsedErr = JSON.parse(errText);
            } catch {
              parsedErr = { error: { message: errText } };
            }
            const errMsg = parsedErr.error?.message || errText;
            const code = response.status;
            
            let status = '❌ LỖI KHÁC';
            if (code === 429) {
              status = '🛑 BỊ RATE LIMIT (429)';
            } else if (errMsg.includes('model') && errMsg.includes('valid')) {
              status = '🚫 SAI ID MODEL';
            }

            return {
              model: modelId,
              status,
              time: duration.toFixed(2) + 's',
              info: `HTTP ${code}: ${errMsg.slice(0, 100)}`
            };
          } else {
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content?.trim() || '';
            return {
              model: modelId,
              status: '✅ HOẠT ĐỘNG tốt',
              time: duration.toFixed(2) + 's',
              info: `Phản hồi: "${reply}"`
            };
          }
        } catch (err) {
          const duration = (Date.now() - start) / 1000;
          const isTimeout = err.name === 'TimeoutError' || err.message.includes('abort') || err.message.includes('timeout');
          return {
            model: modelId,
            status: isTimeout ? '⏱️ TIMEOUT (10s)' : '⚠️ LỖI KẾT NỐI',
            time: duration.toFixed(2) + 's',
            info: err.message
          };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
      
      // Delay nhẹ giữa các chunk để tránh bị OpenRouter block
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n================ BẢNG KẾT QUẢ TEST RATE LIMIT (429) ================');
    console.table(results);

    // Ghi báo cáo ra file markdown
    const reportPath = path.resolve(process.cwd(), 'scratch/free_models_rate_limit_report.md');
    let md = `# Báo cáo Kiểm tra Lỗi Rate Limit (429) của các Model Free\n\n`;
    md += `*Thời gian kiểm tra: ${new Date().toLocaleString('vi-VN')}*\n\n`;
    md += `| STT | Model ID | Trạng thái (Rate Limit 429?) | Response Time | Chi tiết phản hồi / Mã lỗi |\n`;
    md += `| --- | --- | --- | --- | --- |\n`;
    results.forEach((r, idx) => {
      md += `| ${idx + 1} | \`${r.model}\` | ${r.status} | ${r.time} | ${r.info} |\n`;
    });

    fs.writeFileSync(reportPath, md, 'utf8');
    console.log(`\n💾 Đã lưu báo cáo tại: ${reportPath}`);

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  }
}

main();
