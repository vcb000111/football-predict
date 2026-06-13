'use client';

import { useState } from 'react';
import ApiKeyManager from './ApiKeyManager';
import ModelManager from './ModelManager';
import SearchProviderManager from './SearchProviderManager';

export default function ConfigTab({
  apiKeys,
  models,
  searchProviders,
  searchApiKeys,
  decryptedKeys,
  keyStatuses,
  syncingEnv,
  saving,
  onSyncEnvKeys,
  onSaveConfig,
  onAddKey,
  onToggleKeyStatus,
  onDeleteKey,
  onDecryptKey,
  onCheckKey,
  onAddModel,
  onToggleModelStatus,
  onDeleteModel,
  onMoveModel,
  onMoveProvider,
  onToggleProviderStatus,
  onAddSearchKey,
  onToggleSearchKeyStatus,
  onDeleteSearchKey
}) {
  const [collapsed, setCollapsed] = useState({
    keys: false,
    models: false,
    search: false
  });

  const toggleSection = (section) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Action Header Banner */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0f172a]/20 backdrop-blur-md">
        <div className="text-xs text-gray-400">
          💡 Hãy nhấn nút <span className="text-primary font-bold">Lưu cấu hình</span> để áp dụng mọi thay đổi vào SQLite/Turso.
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <button
            onClick={onSyncEnvKeys}
            disabled={syncingEnv}
            className="bg-[#151E2E] hover:bg-primary/20 border border-white/10 hover:border-primary/50 text-[10px] text-gray-400 hover:text-primary px-3.5 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1"
          >
            <span>{syncingEnv ? '⏳' : '🔄'}</span>
            <span>Đồng bộ từ env</span>
          </button>
          <button
            onClick={onSaveConfig}
            disabled={saving}
            className="bg-primary hover:bg-primary/95 disabled:bg-gray-800 disabled:opacity-50 text-[11px] text-black font-black px-4 py-1.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <span>{saving ? '⏳' : '💾'}</span>
            <span>Lưu cấu hình</span>
          </button>
        </div>
      </div>

      {/* Accordion 1: API Keys */}
      <div className="border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('keys')}
          className="w-full bg-[#0E1321] hover:bg-[#151E2E] p-4 text-xs font-bold text-white flex items-center justify-between transition-colors border-b border-white/5"
        >
          <div className="flex items-center space-x-2">
            <span>🔑</span>
            <span>Cấu hình API keys (Google Gemini & OpenRouter)</span>
          </div>
          <span>{collapsed.keys ? '▼' : '▲'}</span>
        </button>
        <div className={`transition-all duration-300 ${collapsed.keys ? 'h-0 overflow-hidden' : 'h-auto'}`}>
          <div className="p-1">
            <ApiKeyManager
              apiKeys={apiKeys}
              decryptedKeys={decryptedKeys}
              keyStatuses={keyStatuses}
              onAddKey={onAddKey}
              onToggleKeyStatus={onToggleKeyStatus}
              onDeleteKey={onDeleteKey}
              onDecryptKey={onDecryptKey}
              onCheckKey={onCheckKey}
            />
          </div>
        </div>
      </div>

      {/* Accordion 2: Models */}
      <div className="border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('models')}
          className="w-full bg-[#0E1321] hover:bg-[#151E2E] p-4 text-xs font-bold text-white flex items-center justify-between transition-colors border-b border-white/5"
        >
          <div className="flex items-center space-x-2">
            <span>🤖</span>
            <span>Cấu hình độ ưu tiên AI models</span>
          </div>
          <span>{collapsed.models ? '▼' : '▲'}</span>
        </button>
        <div className={`transition-all duration-300 ${collapsed.models ? 'h-0 overflow-hidden' : 'h-auto'}`}>
          <div className="p-1">
            <ModelManager
              models={models}
              onAddModel={onAddModel}
              onToggleModelStatus={onToggleModelStatus}
              onDeleteModel={onDeleteModel}
              onMoveModel={onMoveModel}
            />
          </div>
        </div>
      </div>

      {/* Accordion 3: Search Engines */}
      <div className="border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('search')}
          className="w-full bg-[#0E1321] hover:bg-[#151E2E] p-4 text-xs font-bold text-white flex items-center justify-between transition-colors border-b border-white/5"
        >
          <div className="flex items-center space-x-2">
            <span>🔍</span>
            <span>Cấu hình công cụ tìm kiếm RAG Search</span>
          </div>
          <span>{collapsed.search ? '▼' : '▲'}</span>
        </button>
        <div className={`transition-all duration-300 ${collapsed.search ? 'h-0 overflow-hidden' : 'h-auto'}`}>
          <div className="p-1">
            <SearchProviderManager
              searchProviders={searchProviders}
              searchApiKeys={searchApiKeys}
              decryptedKeys={decryptedKeys}
              keyStatuses={keyStatuses}
              onMoveProvider={onMoveProvider}
              onToggleProviderStatus={onToggleProviderStatus}
              onAddSearchKey={onAddSearchKey}
              onToggleSearchKeyStatus={onToggleSearchKeyStatus}
              onDeleteSearchKey={onDeleteSearchKey}
              onDecryptKey={onDecryptKey}
              onCheckKey={onCheckKey}
            />
          </div>
        </div>
      </div>

      {/* Save Config Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <p className="text-[10px] text-gray-500 italic max-w-md">
          Lưu ý: Bấm nút "Lưu cấu hình" bên phải hoặc bên trên để áp dụng chính thức toàn bộ thay đổi vào SQLite/Turso.
        </p>
        <button
          onClick={onSaveConfig}
          disabled={saving}
          className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-black font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all duration-150 active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
        >
          {saving ? (
            <>
              <span className="animate-spin inline-block">🔄</span>
              <span>Đang lưu...</span>
            </>
          ) : (
            <>
              <span>💾</span>
              <span>Lưu cấu hình</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
