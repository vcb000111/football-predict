'use client';

import { useState } from 'react';

export default function ApiKeyManager({
  apiKeys,
  decryptedKeys,
  keyStatuses,
  onAddKey,
  onToggleKeyStatus,
  onDeleteKey,
  onDecryptKey,
  onCheckKey
}) {
  const [newKey, setNewKey] = useState('');
  const [newKeyProvider, setNewKeyProvider] = useState('gemini');
  const [showKeys, setShowKeys] = useState({});

  const handleToggleKeyShow = (idOrIndex) => {
    setShowKeys(prev => ({ ...prev, [idOrIndex]: !prev[idOrIndex] }));
  };

  const handleAddClick = () => {
    if (!newKey.trim()) return;
    onAddKey(newKeyProvider, newKey.trim());
    setNewKey('');
  };

  const maskKey = (key, show) => {
    if (!key) return '';
    if (show) return key;
    if (key.length <= 12) return '•'.repeat(key.length);
    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
  };

  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-6 shadow-xl space-y-6 bg-[#0f172a]/20 backdrop-blur-md">
      <div className="border-b border-white/5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          <span className="text-primary">🔑</span>
          <span>Danh sách API keys (Google Gemini / Groq Cloud)</span>
        </h2>
        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-bold">
          {apiKeys.length} Keys
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={newKeyProvider}
          onChange={(e) => setNewKeyProvider(e.target.value)}
          className="bg-[#0d1527] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/80 cursor-pointer"
        >
          <option value="gemini">Gemini</option>
          <option value="groq">Groq Cloud</option>
        </select>
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={newKeyProvider === 'gemini' ? "Nhập API key mới từ Google AI Studio..." : "Nhập API key mới từ Groq Cloud Console..."}
          className="flex-1 bg-[#0d1527] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-primary/80 transition-colors"
        />
        <button
          onClick={handleAddClick}
          disabled={!newKey.trim()}
          className="bg-secondary hover:bg-secondary/90 disabled:bg-gray-800 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-xl transition-all cursor-pointer"
        >
          ➕ Thêm
        </button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="text-center py-8 bg-white/5 rounded-xl border border-dashed border-white/10">
          <p className="text-xs text-gray-500">Chưa có API key nào được cài đặt. Hệ thống sẽ chạy ở chế độ MOCK.</p>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-1">
          {apiKeys.map((key, index) => {
            const keyIdOrIndex = key.id || index;
            const isShown = showKeys[keyIdOrIndex];
            const isEncrypted = typeof key.key_value === 'string' && key.key_value.includes(':');
            const decryptedValue = decryptedKeys[key.key_value];
            const displayValue = decryptedValue || maskKey(key.key_value, isShown);
            
            const statusInfo = keyStatuses[key.key_value.trim()] || {};

            return (
              <div
                key={keyIdOrIndex}
                className="flex items-center justify-between bg-white/5 border border-white/5 hover:border-white/10 rounded-xl p-3 text-xs transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0 pr-4">
                  <span className="text-[10px] text-gray-650 font-bold font-mono">#{index + 1}</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                    (key.provider || 'gemini') === 'groq'
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                      : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {key.provider || 'gemini'}
                  </span>
                  <code className="text-xs font-mono text-gray-300 truncate select-all flex-1">
                    {displayValue}
                  </code>
                  <button
                    onClick={() => handleToggleKeyShow(keyIdOrIndex)}
                    className="text-gray-500 hover:text-gray-300 cursor-pointer mr-2"
                    title={isShown ? "Ẩn khóa" : "Hiện khóa dạng che"}
                  >
                    {isShown ? '👁️' : '👁️‍'}
                  </button>
                  {isEncrypted && !decryptedValue && (
                    <button
                      onClick={() => onDecryptKey(key.key_value)}
                      className="bg-[#151E2E] hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/50 text-[10px] text-gray-400 hover:text-emerald-400 px-2 py-0.5 rounded-lg transition-all cursor-pointer mr-2"
                      title="Giải mã khóa"
                    >
                      🔓 Giải mã
                    </button>
                  )}
                  <div className="flex items-center space-x-2 mr-2">
                    <button
                      onClick={() => onCheckKey(key.provider || 'gemini', key.key_value)}
                      disabled={statusInfo.loading}
                      className="bg-[#151E2E] hover:bg-primary/20 border border-white/10 hover:border-primary/50 text-[10px] text-gray-400 hover:text-primary px-2 py-0.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      {statusInfo.loading ? '⏳...' : '⚡ Check'}
                    </button>
                    {statusInfo.status === 'active' && (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-lg text-[9px] font-bold">🟢 Active</span>
                    )}
                    {statusInfo.status === 'inactive' && (
                      <span 
                        title={statusInfo.error}
                        className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-2 py-0.5 rounded-lg text-[9px] font-bold cursor-help"
                      >
                        🔴 Lỗi
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3.5">
                  <button
                    onClick={() => onToggleKeyStatus(index)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${key.status === 1
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                  >
                    {key.status === 1 ? 'BẬT' : 'TẮT'}
                  </button>
                  <button
                    onClick={() => onDeleteKey(index, key.id)}
                    className="bg-[#151E2E] hover:bg-rose-950/40 border border-white/5 hover:border-rose-900/50 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
