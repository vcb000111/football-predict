import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDB();
    
    // Lấy danh sách API Keys
    const apiKeys = await db.all(`SELECT * FROM api_keys ORDER BY id ASC`, [], { raw: true });
    
    // Lấy danh sách AI Models sắp xếp theo priority
    const models = await db.all(`SELECT * FROM ai_models ORDER BY priority ASC`);

    // Lấy danh sách Search Providers sắp xếp theo priority
    const searchProviders = await db.all(`SELECT * FROM search_providers ORDER BY priority ASC`);

    // Lấy danh sách Search API Keys
    const searchApiKeys = await db.all(`SELECT * FROM search_api_keys ORDER BY id ASC`, [], { raw: true });
    
    return NextResponse.json({
      apiKeys,
      models,
      searchProviders,
      searchApiKeys
    });
  } catch (error) {
    console.error('Lỗi khi lấy cấu hình admin:', error);
    return NextResponse.json(
      { error: 'Không thể lấy cấu hình', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const db = await getDB();
    const { 
      apiKeys, 
      deleteApiKeys, 
      models, 
      deleteModels,
      searchProviders,
      searchApiKeys,
      deleteSearchApiKeys
    } = await request.json();
    
    const statements = [];
    
    // 1. Xóa các API keys được yêu cầu xóa
    if (deleteApiKeys && deleteApiKeys.length > 0) {
      const placeholders = deleteApiKeys.map(() => '?').join(',');
      statements.push({
        sql: `DELETE FROM api_keys WHERE id IN (${placeholders})`,
        args: deleteApiKeys
      });
    }
    
    // 2. Cập nhật hoặc Thêm mới API keys
    if (apiKeys && apiKeys.length > 0) {
      for (const key of apiKeys) {
        if (key.id) {
          statements.push({
            sql: `UPDATE api_keys SET key_value = ?, status = ?, provider = ? WHERE id = ?`,
            args: [key.key_value.trim(), key.status, key.provider || 'gemini', key.id]
          });
        } else if (key.key_value && key.key_value.trim()) {
          statements.push({
            sql: `INSERT OR IGNORE INTO api_keys (key_value, status, provider) VALUES (?, ?, ?)`,
            args: [key.key_value.trim(), key.status !== undefined ? key.status : 1, key.provider || 'gemini']
          });
        }
      }
    }
    
    // 3. Xóa các models được yêu cầu xóa
    if (deleteModels && deleteModels.length > 0) {
      const placeholders = deleteModels.map(() => '?').join(',');
      statements.push({
        sql: `DELETE FROM ai_models WHERE id IN (${placeholders})`,
        args: deleteModels
      });
    }
    
    // 4. Cập nhật hoặc Thêm mới AI models
    if (models && models.length > 0) {
      for (const model of models) {
        const supportsImage = model.supports_image !== undefined ? (model.supports_image ? 1 : 0) : 0;
        if (model.id) {
          statements.push({
            sql: `UPDATE ai_models SET model_name = ?, priority = ?, status = ?, provider = ?, supports_image = ? WHERE id = ?`,
            args: [model.model_name.trim(), model.priority, model.status, model.provider || 'gemini', supportsImage, model.id]
          });
        } else if (model.model_name && model.model_name.trim()) {
          statements.push({
            sql: `INSERT OR IGNORE INTO ai_models (model_name, priority, status, provider, supports_image) VALUES (?, ?, ?, ?, ?)`,
            args: [model.model_name.trim(), model.priority || 1, model.status !== undefined ? model.status : 1, model.provider || 'gemini', supportsImage]
          });
        }
      }
    }

    // 5. Xóa các Search API keys được yêu cầu xóa
    if (deleteSearchApiKeys && deleteSearchApiKeys.length > 0) {
      const placeholders = deleteSearchApiKeys.map(() => '?').join(',');
      statements.push({
        sql: `DELETE FROM search_api_keys WHERE id IN (${placeholders})`,
        args: deleteSearchApiKeys
      });
    }

    // 6. Cập nhật hoặc Thêm mới Search API keys
    if (searchApiKeys && searchApiKeys.length > 0) {
      for (const key of searchApiKeys) {
        if (key.id) {
          statements.push({
            sql: `UPDATE search_api_keys SET key_value = ?, status = ? WHERE id = ?`,
            args: [key.key_value.trim(), key.status, key.id]
          });
        } else if (key.key_value && key.key_value.trim() && key.provider_name) {
          statements.push({
            sql: `INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, ?)`,
            args: [key.provider_name, key.key_value.trim(), key.status !== undefined ? key.status : 1]
          });
        }
      }
    }

    // 7. Cập nhật Search Providers (priority và status)
    if (searchProviders && searchProviders.length > 0) {
      for (const provider of searchProviders) {
        statements.push({
          sql: `UPDATE search_providers SET priority = ?, status = ? WHERE provider_name = ?`,
          args: [provider.priority, provider.status, provider.provider_name]
        });
      }
    }
    
    // Thực thi toàn bộ lệnh trong một Giao dịch duy nhất
    if (statements.length > 0) {
      await db.batch(statements);
    }
    
    // Lấy lại dữ liệu mới sau khi lưu thành công để cập nhật UI
    const updatedApiKeys = await db.all(`SELECT * FROM api_keys ORDER BY id ASC`, [], { raw: true });
    const updatedModels = await db.all(`SELECT * FROM ai_models ORDER BY priority ASC`);
    const updatedSearchProviders = await db.all(`SELECT * FROM search_providers ORDER BY priority ASC`);
    const updatedSearchApiKeys = await db.all(`SELECT * FROM search_api_keys ORDER BY id ASC`, [], { raw: true });
    
    return NextResponse.json({
      success: true,
      message: 'Lưu cấu hình thành công',
      apiKeys: updatedApiKeys,
      models: updatedModels,
      searchProviders: updatedSearchProviders,
      searchApiKeys: updatedSearchApiKeys
    });
    
  } catch (error) {
    console.error('Lỗi khi cập nhật cấu hình admin:', error);
    return NextResponse.json(
      { error: 'Lưu cấu hình thất bại', details: error.message },
      { status: 500 }
    );
  }
}
