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

// Gán các biến môi trường cần thiết vào process.env
process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL;
process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;
process.env.ENCRYPTION_SECRET = env.ENCRYPTION_SECRET;

const url = env.TURSO_DATABASE_URL;
const authToken = env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Không tìm thấy TURSO_DATABASE_URL trong .env.local');
  process.exit(1);
}

const client = createClient({ url, authToken });

// Danh sách tĩnh các model cần kiểm tra (đối chiếu từ ảnh và log hệ thống)
const staticModels = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'openrouter/owl-alpha',
  'nvidia/nemotron-3-nano-omni:free',
  'poolside/laguna-xs.2:free',
  'poolside/laguna-m.1:free',
  'nex-agi/nex-n2-pro:free',
  'nvidia/nemotron-3-ultra:free',
  'nvidia/nemotron-3.5-content-safety:free',
  'google/lyria-3-pro-preview',
  'google/lyria-3-clip-preview',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'liquidai/lfm2.5-1.2b-thinking:free',
  'liquidai/lfm2.5-1.2b-instruct:free'
];

async function main() {
  try {
    // Import động deobfuscateKey từ thư viện db.js của dự án
    const dbModule = await import('../src/lib/db.js');
    const deobfuscateKey = dbModule.deobfuscateKey;

    // 1. Lấy API keys từ DB
    const keysRes = await client.execute("SELECT key_value, provider FROM api_keys WHERE status = 1");
    const openrouterKeys = Array.from(new Set(keysRes.rows.filter(r => r.provider === 'openrouter').map(r => r.key_value.toString().trim())));

    console.log(`🔑 Tìm thấy ${openrouterKeys.length} OpenRouter keys hoạt động.`);

    if (openrouterKeys.length === 0) {
      console.error('❌ Không tìm thấy OpenRouter API Key hoạt động trong DB.');
      process.exit(1);
    }

    // Giải mã key thứ nhất
    const encryptedKey = openrouterKeys[0];
    const testKey = deobfuscateKey(encryptedKey);
    
    if (!testKey || testKey === encryptedKey) {
      console.warn('⚠️ Cảnh báo: Giải mã API key không thay đổi hoặc lỗi. Sẽ thử dùng key trực tiếp...');
    } else {
      console.log('🔓 Đã giải mã thành công OpenRouter API Key.');
    }

    let finalTestList = [...staticModels];

    // 2. Thử fetch list model từ OpenRouter để cập nhật/bổ sung model IDs
    console.log('📡 Đang thử tải danh sách model trực tiếp từ OpenRouter...');
    try {
      const listRes = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${testKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (listRes.ok) {
        const { data: allModels } = await listRes.json();
        console.log(`📦 Đã tải thành công danh sách model từ OpenRouter (${allModels.length} models).`);
        
        // Tìm các model khớp từ khóa
        const targetKeywords = ['gemma-4', 'nemotron', 'owl-alpha', 'laguna', 'nex-n2', 'lyria', 'lfm'];
        const matchedFromApi = allModels
          .map(m => m.id)
          .filter(id => targetKeywords.some(kw => id.toLowerCase().includes(kw)));
        
        if (matchedFromApi.length > 0) {
          finalTestList = Array.from(new Set([...staticModels, ...matchedFromApi]));
          console.log(`💡 Đã hợp nhất danh sách tĩnh và động thành ${finalTestList.length} models để test.`);
        }
      } else {
        console.warn(`⚠️ Fetch list model thất bại (${listRes.status}). Sử dụng danh sách model tĩnh làm fallback.`);
      }
    } catch (fetchListErr) {
      console.warn(`⚠️ Lỗi kết nối khi fetch list model: ${fetchListErr.message}. Sử dụng danh sách tĩnh làm fallback.`);
    }

    console.log(`\n⏱️ Bắt đầu kiểm tra kết nối và thời gian phản hồi cho các models...`);
    const results = [];

    // Chỉ test tối đa 15 model tiêu biểu để tránh tốn thời gian và quota
    const maxTests = 18;
    const testSubset = finalTestList.slice(0, maxTests);
    console.log(`⚡ Sẽ thực hiện test kết nối cho ${testSubset.length} models tiêu biểu (giới hạn để tăng tốc).`);

    for (const modelId of testSubset) {
      console.log(`🤖 Đang kiểm tra: ${modelId}...`);
      const start = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://football-predict.com',
            'X-Title': 'Model Performance Test'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Say "OK" in exactly one word.' }],
            temperature: 0,
            max_tokens: 10
          }),
          // Thêm timeout 12 giây để chống treo
          signal: AbortSignal.timeout(12000)
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
          
          results.push({
            'Model Name': modelId,
            'Status': '❌ LỖI API',
            'Response Time': duration.toFixed(2) + 's',
            'Info/Error': errMsg.slice(0, 120)
          });
          console.log(`❌ Lỗi: ${errMsg.slice(0, 60)}`);
        } else {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content?.trim() || '';
          results.push({
            'Model Name': modelId,
            'Status': '✅ HOẠT ĐỘNG tốt',
            'Response Time': duration.toFixed(2) + 's',
            'Info/Error': `Phản hồi: "${reply}"`
          });
          console.log(`✅ Thành công! Phản hồi: "${reply}" sau ${duration.toFixed(2)}s`);
        }
      } catch (err) {
        const duration = (Date.now() - start) / 1000;
        const isTimeout = err.name === 'TimeoutError' || err.message.includes('abort') || err.message.includes('timeout');
        results.push({
          'Model Name': modelId,
          'Status': isTimeout ? '⏱️ TIMEOUT' : '⚠️ LỖI MẠNG',
          'Response Time': duration.toFixed(2) + 's',
          'Info/Error': isTimeout ? 'Thời gian phản hồi vượt quá 12s' : err.message
        });
        console.log(`❌ Lỗi: ${isTimeout ? 'Timeout 12s' : err.message}`);
      }
    }

    console.log('\n================ BẢNG KẾT QUẢ KIỂM TRA MODEL ================');
    console.table(results);

    // Ghi kết quả ra file markdown để sếp dễ xem
    const reportPath = path.resolve(process.cwd(), 'scratch/model_test_report.md');
    let mdContent = `# BÁO CÁO KIỂM TRA KẾT NỐI VÀ HIỆU NĂNG MODEL\n\n`;
    mdContent += `*Thời gian kiểm tra: ${new Date().toLocaleString('vi-VN')}*\n\n`;
    mdContent += `| STT | Model Name | Status | Response Time | Chi tiết / Lỗi |\n`;
    mdContent += `| --- | --- | --- | --- | --- |\n`;
    results.forEach((r, idx) => {
      mdContent += `| ${idx + 1} | \`${r['Model Name']}\` | ${r['Status']} | ${r['Response Time']} | ${r['Info/Error']} |\n`;
    });
    
    fs.writeFileSync(reportPath, mdContent, 'utf8');
    console.log(`\n💾 Đã lưu báo cáo chi tiết tại: ${reportPath}`);

  } catch (err) {
    console.error('❌ Lỗi hệ thống:', err.message);
  } finally {
    if (client.close) client.close();
  }
}

main();
