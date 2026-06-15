import fs from 'fs';
import path from 'path';

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

async function main() {
  try {
    const dbModule = await import('../src/lib/db.js');
    const deobfuscateKey = dbModule.deobfuscateKey;

    const { createClient } = await import('@libsql/client');
    const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    
    const keysRes = await client.execute("SELECT key_value FROM api_keys WHERE provider = 'openrouter' AND status = 1");
    if (keysRes.rows.length === 0) {
      console.error('Không tìm thấy OpenRouter API Key hoạt động.');
      process.exit(1);
    }

    const testKey = deobfuscateKey(keysRes.rows[0].key_value.toString().trim());
    if (client.close) client.close();

    console.log('📡 Đang fetch thông tin pricing từ OpenRouter...');
    const listRes = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${testKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listRes.ok) {
      throw new Error(`Lỗi tải danh sách: ${listRes.status}`);
    }

    const { data: allModels } = await listRes.json();
    console.log(`📦 Tải thành công ${allModels.length} models.`);

    const freeModels = [];
    const cheapModels = [];

    allModels.forEach(m => {
      // Pricing được tính bằng USD trên 1 token. Nhân với 1.000.000 để ra giá trên 1M tokens.
      const promptCost = parseFloat(m.pricing?.prompt || 0);
      const completionCost = parseFloat(m.pricing?.completion || 0);
      
      const promptCostPerM = (promptCost * 1000000).toFixed(4);
      const completionCostPerM = (completionCost * 1000000).toFixed(4);

      if (promptCost === 0 && completionCost === 0) {
        freeModels.push({
          'Model ID': m.id,
          'Name': m.name || m.id,
          'Context Length': m.context_length,
          'Prompt Cost ($/1M)': '0.0000 (Free)',
          'Completion Cost ($/1M)': '0.0000 (Free)'
        });
      } else if (promptCost <= 0.0000002 && completionCost <= 0.0000006) {
        // Lọc các model siêu rẻ (ví dụ dưới $0.2 / 1M tokens)
        cheapModels.push({
          'Model ID': m.id,
          'Name': m.name || m.id,
          'Context Length': m.context_length,
          'Prompt Cost ($/1M)': promptCostPerM,
          'Completion Cost ($/1M)': completionCostPerM
        });
      }
    });

    console.log('\n================ DANH SÁCH MODEL MIỄN PHÍ HOÀN TOÀN (Cost = 0) ================');
    console.table(freeModels);

    console.log('\n================ DANH SÁCH MODEL SIÊU RẺ (Dưới $0.2 / 1M tokens) ================');
    console.table(cheapModels.slice(0, 15)); // In ra top 15 model rẻ nhất

    // Lưu file report
    const reportPath = path.resolve(process.cwd(), 'scratch/free_models_report.md');
    let md = `# Báo cáo Model Miễn phí & Siêu rẻ trên OpenRouter\n\n`;
    md += `## 1. Model Miễn Phí Hoàn Toàn ($0/1M tokens)\n\n`;
    md += `| Model ID | Tên hiển thị | Context Length | Giá Prompt ($/1M) | Giá Completion ($/1M) |\n`;
    md += `| --- | --- | --- | --- | --- |\n`;
    freeModels.forEach(m => {
      md += `| \`${m['Model ID']}\` | ${m['Name']} | ${m['Context Length']} | ${m['Prompt Cost ($/1M)']} | ${m['Completion Cost ($/1M)']} |\n`;
    });

    md += `\n## 2. Model Siêu Rẻ (Có thể dùng nếu tài khoản có free credit)\n\n`;
    md += `| Model ID | Tên hiển thị | Context Length | Giá Prompt ($/1M) | Giá Completion ($/1M) |\n`;
    md += `| --- | --- | --- | --- | --- |\n`;
    cheapModels.forEach(m => {
      md += `| \`${m['Model ID']}\` | ${m['Name']} | ${m['Context Length']} | ${m['Prompt Cost ($/1M)']} | ${m['Completion Cost ($/1M)']} |\n`;
    });

    fs.writeFileSync(reportPath, md, 'utf8');
    console.log(`\n💾 Đã lưu báo cáo tại: ${reportPath}`);

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  }
}

main();
