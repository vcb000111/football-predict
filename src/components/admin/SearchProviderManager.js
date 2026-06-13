'use client';

import { useState } from 'react';

export default function SearchProviderManager({
  searchProviders,
  searchApiKeys,
  decryptedKeys,
  keyStatuses,
  onMoveProvider,
  onToggleProviderStatus,
  onAddSearchKey,
  onToggleSearchKeyStatus,
  onDeleteSearchKey,
  onDecryptKey,
  onCheckKey
}) {
  const [activeManageProvider, setActiveManageProvider] = useState(null); // 'tavily', 'brave', 'serper' hoặc null
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showKeys, setShowKeys] = useState({});

  const handleToggleShowKey = (idOrIndex) => {
    setShowKeys(prev => ({ ...prev, [idOrIndex]: !prev[idOrIndex] }));
  };

  const getProviderTitle = (name) => {
    if (name === 'tavily') return 'Tavily Search';
    if (name === 'brave') return 'Brave Search';
    return 'Serper Google Search';
  };

  const getProviderDescription = (name) => {
    if (name === 'tavily') return 'API chuyên dụng RAG (1,000 reqs/tháng)';
    if (name === 'brave') return 'Tìm kiếm độc lập (2,000 reqs/tháng)';
    return 'Google Search siêu nhanh (2,500 reqs)';
  };

  const maskKey = (key, show) => {
    if (!key) return '';
    if (show) return key;
    if (key.length <= 12) return '•'.repeat(key.length);
    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
  };

  const handleAddSearchKeyClick = (providerName) => {
    if (!newKeyInput.trim()) return;
    onAddSearchKey(providerName, newKeyInput.trim());
    setNewKeyInput('');
  };

  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-6 shadow-xl space-y-6 bg-[#0f172a]/20 backdrop-blur-md">
      <div className="border-b border-white/5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          <span className="text-indigo-400 font-bold">🔍</span>
          <span>Cấu hình công cụ tìm kiếm RAG (Xoay vòng & Ưu tiên)</span>
        </h2>
        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold">
          {searchProviders.length} Providers
        </span>
      </div>

      {/* Grid 3 Cards Search Engine */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {searchProviders.map((provider, index) => {
          const providerKeys = searchApiKeys.filter(k => k.provider_name === provider.provider_name);
          const activeKeysCount = providerKeys.filter(k => k.status === 1).length;

          return (
            <div
              key={provider.provider_name}
              className={`border rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between ${
                provider.status === 1
                  ? 'bg-[#0f182c]/40 border-white/10 hover:border-indigo-500/40 shadow-md'
                  : 'bg-white/5 border-white/5 opacity-60'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="bg-[#151E2E] border border-white/10 px-2.5 py-0.5 rounded-lg text-center">
                    <span className="text-[10px] font-black text-indigo-400 block">{provider.priority}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                    activeKeysCount > 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {activeKeysCount} Keys active
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    {getProviderTitle(provider.provider_name)}
                  </h4>
                  <p className="text-[10px] text-gray-500 font-medium mt-1 leading-normal">
                    {getProviderDescription(provider.provider_name)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-3 border-t border-white/5 gap-2">
                <div className="flex space-x-1">
                  <button
                    onClick={() => onMoveProvider(index, 'up')}
                    disabled={index === 0}
                    className="bg-white/5 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => onMoveProvider(index, 'down')}
                    disabled={index === searchProviders.length - 1}
                    className="bg-white/5 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => onToggleProviderStatus(index)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${
                      provider.status === 1
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {provider.status === 1 ? 'BẬT' : 'TẮT'}
                  </button>
                  <button
                    onClick={() => {
                      setActiveManageProvider(provider.provider_name);
                      setNewKeyInput('');
                    }}
                    className="bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 text-[9px] font-black px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    Quản lý keys
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Quản lý Keys của từng Provider */}
      {activeManageProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-scale-up">
          <div className="glass-panel border border-white/10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-[#0b1220]/95 backdrop-blur-md">
            {/* Header */}
            <div className="bg-[#0f172a] border-b border-white/5 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white">Quản lý API keys</h3>
                <p className="text-[10px] text-gray-450 font-medium mt-0.5">
                  Cấu hình khóa tìm kiếm cho {getProviderTitle(activeManageProvider)}
                </p>
              </div>
              <button
                onClick={() => setActiveManageProvider(null)}
                className="text-gray-500 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* List and CRUD */}
            <div className="p-5 space-y-4">
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                {searchApiKeys.filter(k => k.provider_name === activeManageProvider).length === 0 ? (
                  <p className="text-[10px] text-gray-550 italic py-4 text-center">Chưa có API key nào cho provider này.</p>
                ) : (
                  searchApiKeys
                    .map((key, index) => {
                      if (key.provider_name !== activeManageProvider) return null;
                      const parentIdx = searchApiKeys.indexOf(key);
                      const keyIdOrIndex = key.id || parentIdx;
                      const isShown = showKeys[keyIdOrIndex];
                      const isEncrypted = typeof key.key_value === 'string' && key.key_value.includes(':');
                      const decryptedValue = decryptedKeys[key.key_value];
                      const displayValue = decryptedValue || maskKey(key.key_value, isShown);
                      const statusInfo = keyStatuses[key.key_value.trim()] || {};

                      return (
                        <div
                          key={keyIdOrIndex}
                          className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-2.5 text-xs"
                        >
                          <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-4">
                            <span className="text-[10px] text-gray-650 font-bold font-mono">
                              #{searchApiKeys.filter((k, i) => k.provider_name === activeManageProvider && i <= parentIdx).length}
                            </span>
                            <code className="text-xs font-mono text-gray-300 truncate select-all flex-1">
                              {displayValue}
                            </code>
                            <button
                              onClick={() => handleToggleShowKey(keyIdOrIndex)}
                              className="text-gray-500 hover:text-gray-300 cursor-pointer"
                              title={isShown ? "Ẩn khóa" : "Hiện khóa dạng che"}
                            >
                              {isShown ? '👁️' : '👁️‍'}
                            </button>
                            {isEncrypted && !decryptedValue && (
                              <button
                                onClick={() => onDecryptKey(key.key_value)}
                                className="bg-[#151E2E] hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/50 text-[9px] text-gray-400 hover:text-emerald-400 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                              >
                                🔓 Giải mã
                              </button>
                            )}
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => onCheckKey(activeManageProvider, key.key_value)}
                                disabled={statusInfo.loading}
                                className="bg-[#151E2E] hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-555 text-[9px] text-gray-400 hover:text-indigo-400 px-2 py-0.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              >
                                {statusInfo.loading ? '⏳...' : '⚡ Check'}
                              </button>
                              {statusInfo.status === 'active' && (
                                <div className="flex flex-col">
                                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[8px] font-bold">🟢 Active</span>
                                  {statusInfo.creditText && (
                                    <span className="text-[7.5px] text-emerald-500 font-bold mt-0.5 whitespace-nowrap">{statusInfo.creditText}</span>
                                  )}
                                </div>
                              )}
                              {statusInfo.status === 'inactive' && (
                                <span 
                                  title={statusInfo.error}
                                  className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded text-[8px] font-bold cursor-help"
                                >
                                  🔴 Lỗi
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => onToggleSearchKeyStatus(parentIdx)}
                              className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border cursor-pointer ${
                                key.status === 1
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                              }`}
                            >
                              {key.status === 1 ? 'BẬT' : 'TẮT'}
                            </button>
                            <button
                              onClick={() => onDeleteSearchKey(parentIdx, key.id)}
                              className="bg-[#151E2E] hover:bg-rose-950/40 border border-white/5 hover:border-rose-900/50 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean)
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <input
                  type="password"
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  placeholder={`Nhập API key mới cho ${getProviderTitle(activeManageProvider)}...`}
                  className="flex-1 bg-[#0d1527] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <button
                  onClick={() => handleAddSearchKeyClick(activeManageProvider)}
                  disabled={!newKeyInput.trim()}
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:bg-gray-800 disabled:opacity-50 text-white text-[10px] font-black px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  ➕ Thêm key
                </button>
              </div>
            </div>

            <div className="bg-[#0f172a] border-t border-white/5 p-4 flex justify-end">
              <button
                onClick={() => setActiveManageProvider(null)}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
