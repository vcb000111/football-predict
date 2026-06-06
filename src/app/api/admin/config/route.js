import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDB();
    
    // Lấy danh sách API Keys
    const apiKeys = await db.all(`SELECT * FROM api_keys ORDER BY id ASC`);
    
    // Lấy danh sách AI Models sắp xếp theo priority
    const models = await db.all(`SELECT * FROM ai_models ORDER BY priority ASC`);

    // Lấy danh sách Search Providers sắp xếp theo priority
    const searchProviders = await db.all(`SELECT * FROM search_providers ORDER BY priority ASC`);

    // Lấy danh sách Search API Keys
    const searchApiKeys = await db.all(`SELECT * FROM search_api_keys ORDER BY id ASC`);
    
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
    
    // Sử dụng transaction để đảm bảo an toàn dữ liệu
    await db.run('BEGIN TRANSACTION');
    
    try {
      // 1. Xóa các API keys được yêu cầu xóa
      if (deleteApiKeys && deleteApiKeys.length > 0) {
        const placeholders = deleteApiKeys.map(() => '?').join(',');
        await db.run(`DELETE FROM api_keys WHERE id IN (${placeholders})`, deleteApiKeys);
      }
      
      // 2. Cập nhật hoặc Thêm mới API keys
      if (apiKeys && apiKeys.length > 0) {
        for (const key of apiKeys) {
          if (key.id) {
            await db.run(
              `UPDATE api_keys SET key_value = ?, status = ? WHERE id = ?`,
              [key.key_value.trim(), key.status, key.id]
            );
          } else if (key.key_value && key.key_value.trim()) {
            await db.run(
              `INSERT OR IGNORE INTO api_keys (key_value, status) VALUES (?, ?)`,
              [key.key_value.trim(), key.status !== undefined ? key.status : 1]
            );
          }
        }
      }
      
      // 3. Xóa các models được yêu cầu xóa
      if (deleteModels && deleteModels.length > 0) {
        const placeholders = deleteModels.map(() => '?').join(',');
        await db.run(`DELETE FROM ai_models WHERE id IN (${placeholders})`, deleteModels);
      }
      
      // 4. Cập nhật hoặc Thêm mới AI models
      if (models && models.length > 0) {
        for (const model of models) {
          if (model.id) {
            await db.run(
              `UPDATE ai_models SET model_name = ?, priority = ?, status = ? WHERE id = ?`,
              [model.model_name.trim(), model.priority, model.status, model.id]
            );
          } else if (model.model_name && model.model_name.trim()) {
            await db.run(
              `INSERT OR IGNORE INTO ai_models (model_name, priority, status) VALUES (?, ?, ?)`,
              [model.model_name.trim(), model.priority || 1, model.status !== undefined ? model.status : 1]
            );
          }
        }
      }

      // 5. Xóa các Search API keys được yêu cầu xóa
      if (deleteSearchApiKeys && deleteSearchApiKeys.length > 0) {
        const placeholders = deleteSearchApiKeys.map(() => '?').join(',');
        await db.run(`DELETE FROM search_api_keys WHERE id IN (${placeholders})`, deleteSearchApiKeys);
      }

      // 6. Cập nhật hoặc Thêm mới Search API keys
      if (searchApiKeys && searchApiKeys.length > 0) {
        for (const key of searchApiKeys) {
          if (key.id) {
            await db.run(
              `UPDATE search_api_keys SET key_value = ?, status = ? WHERE id = ?`,
              [key.key_value.trim(), key.status, key.id]
            );
          } else if (key.key_value && key.key_value.trim() && key.provider_name) {
            await db.run(
              `INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, ?)`,
              [key.provider_name, key.key_value.trim(), key.status !== undefined ? key.status : 1]
            );
          }
        }
      }

      // 7. Cập nhật Search Providers (priority và status)
      if (searchProviders && searchProviders.length > 0) {
        for (const provider of searchProviders) {
          await db.run(
            `UPDATE search_providers SET priority = ?, status = ? WHERE provider_name = ?`,
            [provider.priority, provider.status, provider.provider_name]
          );
        }
      }
      
      await db.run('COMMIT');
      
      // Lấy lại dữ liệu mới sau khi lưu thành công để cập nhật UI
      const updatedApiKeys = await db.all(`SELECT * FROM api_keys ORDER BY id ASC`);
      const updatedModels = await db.all(`SELECT * FROM ai_models ORDER BY priority ASC`);
      const updatedSearchProviders = await db.all(`SELECT * FROM search_providers ORDER BY priority ASC`);
      const updatedSearchApiKeys = await db.all(`SELECT * FROM search_api_keys ORDER BY id ASC`);
      
      return NextResponse.json({
        success: true,
        message: 'Lưu cấu hình thành công',
        apiKeys: updatedApiKeys,
        models: updatedModels,
        searchProviders: updatedSearchProviders,
        searchApiKeys: updatedSearchApiKeys
      });
      
    } catch (txError) {
      await db.run('ROLLBACK');
      throw txError;
    }
    
  } catch (error) {
    console.error('Lỗi khi cập nhật cấu hình admin:', error);
    return NextResponse.json(
      { error: 'Lưu cấu hình thất bại', details: error.message },
      { status: 500 }
    );
  }
}
