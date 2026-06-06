'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminConfigPage() {
  const [apiKeys, setApiKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [searchProviders, setSearchProviders] = useState([]);
  const [searchApiKeys, setSearchApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Trạng thái cho biểu mẫu thêm mới
  const [newKey, setNewKey] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newSearchKeys, setNewSearchKeys] = useState({ tavily: '', brave: '', serper: '' });
  
  // Trạng thái theo dõi các mục cần xóa
  const [deleteApiKeys, setDeleteApiKeys] = useState([]);
  const [deleteModels, setDeleteModels] = useState([]);
  const [deleteSearchApiKeys, setDeleteSearchApiKeys] = useState([]);

  // Kiểm soát hiển thị mật khẩu/API key
  const [showKeys, setShowKeys] = useState({});
  const [showSearchKeys, setShowSearchKeys] = useState({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      if (res.ok) {
        setApiKeys(data.apiKeys || []);
        setModels(data.models || []);
        setSearchProviders(data.searchProviders || []);
        setSearchApiKeys(data.searchApiKeys || []);
      } else {
        throw new Error(data.error || 'Không thể lấy cấu hình');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi tải cấu hình: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showStatusMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage(null);
    }, 5000);
  };

  const handleToggleKeyShow = (id) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- API KEY ACTIONS (Google Gemini) ---
  const handleAddKey = () => {
    if (!newKey.trim()) return;
    
    // Kiểm tra trùng lặp trong danh sách hiện tại
    if (apiKeys.some(k => k.key_value.trim() === newKey.trim())) {
      showStatusMessage('⚠️ API Key này đã có trong danh sách.', 'error');
      return;
    }

    const item = {
      key_value: newKey.trim(),
      status: 1
    };
    
    setApiKeys([...apiKeys, item]);
    setNewKey('');
    showStatusMessage('➕ Đã thêm API Key tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleToggleKeyStatus = (index) => {
    const updated = [...apiKeys];
    updated[index].status = updated[index].status === 1 ? 0 : 1;
    setApiKeys(updated);
  };

  const handleDeleteKey = (index, id) => {
    const updated = [...apiKeys];
    updated.splice(index, 1);
    setApiKeys(updated);

    if (id) {
      setDeleteApiKeys([...deleteApiKeys, id]);
    }
    showStatusMessage('🗑️ Đã xóa API Key tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  // --- MODEL ACTIONS ---
  const handleAddModel = () => {
    if (!newModelName.trim()) return;

    if (models.some(m => m.model_name.trim().toLowerCase() === newModelName.trim().toLowerCase())) {
      showStatusMessage('⚠️ Model này đã có trong danh sách.', 'error');
      return;
    }

    const maxPriority = models.reduce((max, m) => m.priority > max ? m.priority : max, 0);
    const item = {
      model_name: newModelName.trim(),
      priority: maxPriority + 1,
      status: 1
    };

    setModels([...models, item]);
    setNewModelName('');
    showStatusMessage('➕ Đã thêm Model tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleToggleModelStatus = (index) => {
    const updated = [...models];
    updated[index].status = updated[index].status === 1 ? 0 : 1;
    setModels(updated);
  };

  const handleDeleteModel = (index, id) => {
    const updated = [...models];
    updated.splice(index, 1);
    
    // Cập nhật lại priority sau khi xóa
    const reordered = updated.map((m, idx) => ({
      ...m,
      priority: idx + 1
    }));
    
    setModels(reordered);

    if (id) {
      setDeleteModels([...deleteModels, id]);
    }
    showStatusMessage('🗑️ Đã xóa Model tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleMoveModel = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === models.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...models];
    
    // Tráo đổi vị trí
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Cập nhật lại priority theo đúng chỉ mục mảng
    const reordered = updated.map((m, idx) => ({
      ...m,
      priority: idx + 1
    }));

    setModels(reordered);
  };

  // --- SEARCH PROVIDERS ACTIONS ---
  const handleMoveSearchProvider = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === searchProviders.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...searchProviders];
    
    // Tráo đổi vị trí
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Cập nhật lại priority
    const reordered = updated.map((p, idx) => ({
      ...p,
      priority: idx + 1
    }));

    setSearchProviders(reordered);
    showStatusMessage('↕️ Đã đổi thứ tự ưu tiên tìm kiếm. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleToggleSearchProviderStatus = (index) => {
    const updated = [...searchProviders];
    updated[index].status = updated[index].status === 1 ? 0 : 1;
    setSearchProviders(updated);
    showStatusMessage('⚙️ Đã đổi trạng thái tìm kiếm. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleAddSearchKey = (providerName) => {
    const keyValue = newSearchKeys[providerName] || '';
    if (!keyValue.trim()) return;

    // Kiểm tra trùng lặp
    if (searchApiKeys.some(k => k.provider_name === providerName && k.key_value.trim() === keyValue.trim())) {
      showStatusMessage(`⚠️ API Key này đã có cho ${providerName}.`, 'error');
      return;
    }

    const item = {
      provider_name: providerName,
      key_value: keyValue.trim(),
      status: 1
    };

    setSearchApiKeys([...searchApiKeys, item]);
    setNewSearchKeys(prev => ({ ...prev, [providerName]: '' }));
    showStatusMessage(`➕ Đã thêm API Key tạm thời cho ${providerName}. Nhớ bấm "Lưu cấu hình" để cập nhật.`);
  };

  const handleToggleSearchKeyStatus = (keyIdx) => {
    const updated = [...searchApiKeys];
    updated[keyIdx].status = updated[keyIdx].status === 1 ? 0 : 1;
    setSearchApiKeys(updated);
  };

  const handleDeleteSearchKey = (keyIdx, id) => {
    const updated = [...searchApiKeys];
    const itemDeleted = updated.splice(keyIdx, 1)[0];
    setSearchApiKeys(updated);

    if (id) {
      setDeleteSearchApiKeys([...deleteSearchApiKeys, id]);
    }
    showStatusMessage(`🗑️ Đã xóa API Key tạm thời của ${itemDeleted.provider_name}. Nhớ bấm "Lưu cấu hình" để cập nhật.`);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeys,
          deleteApiKeys,
          models,
          deleteModels,
          searchProviders,
          searchApiKeys,
          deleteSearchApiKeys
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApiKeys(data.apiKeys || []);
        setModels(data.models || []);
        setSearchProviders(data.searchProviders || []);
        setSearchApiKeys(data.searchApiKeys || []);
        setDeleteApiKeys([]);
        setDeleteModels([]);
        setDeleteSearchApiKeys([]);
        showStatusMessage('💾 Đã lưu cấu hình lên SQLite thành công!', 'success');
      } else {
        throw new Error(data.error || 'Lỗi lưu cấu hình');
      }
    } catch (err) {
      showStatusMessage('🔴 Lưu cấu hình thất bại: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Hàm ẩn bớt API key để tăng tính bảo mật
  const maskKey = (key, show) => {
    if (show) return key;
    if (key.length <= 12) return '•'.repeat(key.length);
    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
  };

  return (
    <div className="min-h-screen bg-[#060A13] text-gray-200 py-10 px-4 sm:px-6 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-card-border/50 pb-5 gap-4">
          <div>
            <h1 className="text-2xl font-black text-gradient flex items-center space-x-2">
              <span>🛠️</span>
              <span>Cấu Hình Hệ Thống AI Predictor</span>
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Quản trị API Keys, danh sách AI models, và các Search Engine cho RAG, lưu trữ trực tiếp vào cơ sở dữ liệu SQLite.
            </p>
          </div>
          <div className="flex space-x-3">
            <Link 
              href="/"
              className="bg-card-border/50 hover:bg-card-border border border-card-border hover:border-gray-550 text-xs text-gray-300 font-bold py-2 px-4 rounded-xl transition-all duration-150 flex items-center space-x-1.5"
            >
              <span>🏠</span>
              <span>Trang Chủ</span>
            </Link>
          </div>
        </div>

        {/* Status Alert Banner */}
        {message && (
          <div className={`p-4 rounded-xl border text-xs font-semibold backdrop-blur-md transition-all duration-300 ${
            message.type === 'error' 
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 glass-panel rounded-2xl border border-card-border">
            <span className="text-2xl block mb-2 animate-spin">⏳</span>
            <p className="text-xs text-gray-500">Đang tải dữ liệu cấu hình từ SQLite...</p>
          </div>
        ) : (
          <>
            {/* 1. API KEYS SECTION */}
            <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-card-border/50 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span className="text-primary">🔑</span>
                  <span>Danh Sách API Keys (Google Gemini)</span>
                </h2>
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-bold">
                  {apiKeys.length} Keys
                </span>
              </div>

              {/* Form thêm mới API Key */}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Nhập API Key mới từ Google AI Studio..."
                  className="flex-1 bg-[#0d1527] border border-card-border/70 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-primary/80 transition-colors"
                />
                <button
                  onClick={handleAddKey}
                  disabled={!newKey.trim()}
                  className="bg-primary hover:bg-primary-hover disabled:bg-gray-700 disabled:opacity-50 text-black text-xs font-black px-4 py-2 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  ➕ Thêm
                </button>
              </div>

              {/* Bảng danh sách Keys */}
              {apiKeys.length === 0 ? (
                <div className="text-center py-8 bg-card-border/25 rounded-xl border border-dashed border-card-border/40">
                  <p className="text-xs text-gray-500">Chưa có API Key nào được cài đặt. Hệ thống sẽ chạy ở chế độ MOCK.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {apiKeys.map((key, index) => (
                    <div 
                      key={key.id || `temp-key-${index}`}
                      className="flex items-center justify-between bg-card-border/30 border border-card-border/50 hover:border-card-border rounded-xl p-3 text-xs transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0 pr-4">
                        <span className="text-[10px] text-gray-600 font-bold font-mono">#{index + 1}</span>
                        <code className="text-xs font-mono text-gray-300 truncate select-all">
                          {maskKey(key.key_value, showKeys[key.id || index])}
                        </code>
                        <button
                          onClick={() => handleToggleKeyShow(key.id || index)}
                          className="text-gray-550 hover:text-gray-300 cursor-pointer"
                          title={showKeys[key.id || index] ? "Ẩn đi" : "Hiện đầy đủ"}
                        >
                          {showKeys[key.id || index] ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>

                      <div className="flex items-center space-x-3.5">
                        {/* Switch Toggle Status */}
                        <button
                          onClick={() => handleToggleKeyStatus(index)}
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border cursor-pointer ${
                            key.status === 1 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {key.status === 1 ? 'BẬT' : 'TẮT'}
                        </button>
                        
                        {/* Xóa */}
                        <button
                          onClick={() => handleDeleteKey(index, key.id)}
                          className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                          title="Xóa Key"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. MODELS CONFIGURATION SECTION */}
            <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-card-border/50 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span className="text-secondary">🤖</span>
                  <span>Cấu Hình Thứ Tự Ưu Tiên AI Models</span>
                </h2>
                <span className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 px-2.5 py-0.5 rounded-full font-bold">
                  {models.length} Models
                </span>
              </div>

              {/* Form thêm mới Model */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Nhập mã model Gemini mới (Ví dụ: gemini-2.5-pro)..."
                  className="flex-1 bg-[#0d1527] border border-card-border/70 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-secondary/80 transition-colors"
                />
                <button
                  onClick={handleAddModel}
                  disabled={!newModelName.trim()}
                  className="bg-secondary hover:bg-secondary-hover disabled:bg-gray-700 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  ➕ Thêm
                </button>
              </div>

              {/* Bảng danh sách Models */}
              {models.length === 0 ? (
                <div className="text-center py-8 bg-card-border/25 rounded-xl border border-dashed border-card-border/40">
                  <p className="text-xs text-gray-500">Chưa có AI Model nào được cài đặt. Vui lòng cài đặt ít nhất 1 model.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {models.map((model, index) => (
                    <div 
                      key={model.id || `temp-model-${index}`}
                      className="flex items-center justify-between bg-card-border/30 border border-card-border/50 hover:border-card-border rounded-xl p-3 text-xs transition-colors"
                    >
                      <div className="flex items-center space-x-3.5 flex-1 min-w-0 pr-4">
                        {/* Priority Badge */}
                        <div className="bg-[#151E2E] border border-card-border px-2.5 py-1 rounded-lg text-center min-w-[32px]">
                          <span className="text-[10px] font-black text-secondary block">{model.priority}</span>
                          <span className="text-[8px] text-gray-600 font-bold uppercase block leading-none mt-0.5">ƯU TIÊN</span>
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-white truncate">{model.model_name}</p>
                          <span className="text-[9px] text-gray-500 font-medium">Model ID: {model.id || 'Tạm thời'}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Thay đổi thứ tự (Priority) */}
                        <button
                          onClick={() => handleMoveModel(index, 'up')}
                          disabled={index === 0}
                          className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                          title="Tăng ưu tiên"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveModel(index, 'down')}
                          disabled={index === models.length - 1}
                          className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                          title="Giảm ưu tiên"
                        >
                          ▼
                        </button>

                        <span className="w-1 bg-card-border/40 h-6 mx-1 inline-block"></span>

                        {/* Toggle Status */}
                        <button
                          onClick={() => handleToggleModelStatus(index)}
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border cursor-pointer ${
                            model.status === 1 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {model.status === 1 ? 'BẬT' : 'TẮT'}
                        </button>
                        
                        {/* Xóa */}
                        <button
                          onClick={() => handleDeleteModel(index, model.id)}
                          className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                          title="Xóa Model"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. SEARCH PROVIDERS (RAG) CONFIGURATION SECTION */}
            <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="border-b border-card-border/50 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span className="text-indigo-400 font-bold">🔍</span>
                  <span>Cấu Hình Công Cụ Tìm Kiếm RAG (Xoay Vòng & Ưu Tiên)</span>
                </h2>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold">
                  {searchProviders.length} Providers
                </span>
              </div>

              <div className="space-y-6">
                {searchProviders.map((provider, index) => {
                  const providerKeys = searchApiKeys.filter(k => k.provider_name === provider.provider_name);
                  
                  return (
                    <div 
                      key={provider.provider_name}
                      className={`border rounded-2xl p-4 transition-all duration-200 ${
                        provider.status === 1 
                          ? 'bg-[#0f182c]/40 border-card-border/70 hover:border-indigo-500/40' 
                          : 'bg-card-border/5 border-card-border/30 opacity-60'
                      }`}
                    >
                      {/* Provider Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-card-border/30 pb-3 mb-4">
                        <div className="flex items-center space-x-3.5">
                          {/* Priority Badge */}
                          <div className="bg-[#151E2E] border border-card-border px-2.5 py-1 rounded-lg text-center min-w-[32px]">
                            <span className="text-[10px] font-black text-indigo-400 block">{provider.priority}</span>
                            <span className="text-[8px] text-gray-600 font-bold uppercase block leading-none mt-0.5">ƯU TIÊN</span>
                          </div>
                          <div>
                            <p className="text-xs font-black text-white uppercase tracking-wider">
                              {provider.provider_name === 'tavily' ? 'Tavily Search' : provider.provider_name === 'brave' ? 'Brave Search' : 'Serper Google Search'}
                            </p>
                            <p className="text-[10px] text-gray-500 font-medium">
                              {provider.provider_name === 'tavily' 
                                ? 'API chuyên dụng RAG (1,000 reqs/tháng miễn phí)' 
                                : provider.provider_name === 'brave' 
                                  ? 'Tìm kiếm toàn cầu độc lập (2,000 reqs/tháng miễn phí)' 
                                  : 'Google Search siêu nhanh (2,500 reqs miễn phí)'}
                            </p>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleMoveSearchProvider(index, 'up')}
                            disabled={index === 0}
                            className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            title="Tăng ưu tiên"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveSearchProvider(index, 'down')}
                            disabled={index === searchProviders.length - 1}
                            className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            title="Giảm ưu tiên"
                          >
                            ▼
                          </button>

                          <span className="w-1 bg-card-border/40 h-6 mx-1 inline-block"></span>

                          <button
                            onClick={() => handleToggleSearchProviderStatus(index)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border cursor-pointer ${
                              provider.status === 1 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {provider.status === 1 ? 'BẬT' : 'TẮT'}
                          </button>
                        </div>
                      </div>

                      {/* API Keys management for this provider */}
                      <div className="space-y-3 pl-2 sm:pl-10">
                        {/* List keys */}
                        {providerKeys.length === 0 ? (
                          <p className="text-[10px] text-gray-500 italic py-1">Chưa có API key nào cho {provider.provider_name}. Vui lòng thêm bên dưới.</p>
                        ) : (
                          <div className="space-y-2">
                            {providerKeys.map((key) => {
                              // Tìm index thực tế của key này trong mảng searchApiKeys
                              const keyIdx = searchApiKeys.findIndex(k => k === key);
                              return (
                                <div 
                                  key={key.id || `${provider.provider_name}-temp-${keyIdx}`}
                                  className="flex items-center justify-between bg-card-border/20 border border-card-border/40 rounded-xl p-2.5 text-xs"
                                >
                                  <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-4">
                                    <span className="text-[10px] text-gray-600 font-bold font-mono">#{searchApiKeys.filter((k, i) => k.provider_name === provider.provider_name && i <= keyIdx).length}</span>
                                    <code className="text-xs font-mono text-gray-300 truncate select-all">
                                      {maskKey(key.key_value, showSearchKeys[key.id || keyIdx])}
                                    </code>
                                    <button
                                      onClick={() => setShowSearchKeys(prev => ({ ...prev, [key.id || keyIdx]: !prev[key.id || keyIdx] }))}
                                      className="text-gray-550 hover:text-gray-300 cursor-pointer"
                                      title={showSearchKeys[key.id || keyIdx] ? "Ẩn đi" : "Hiện đầy đủ"}
                                    >
                                      {showSearchKeys[key.id || keyIdx] ? '👁️' : '👁️‍🗨️'}
                                    </button>
                                  </div>

                                  <div className="flex items-center space-x-2.5">
                                    <button
                                      onClick={() => handleToggleSearchKeyStatus(keyIdx)}
                                      className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-colors border cursor-pointer ${
                                        key.status === 1 
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                                          : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                      }`}
                                    >
                                      {key.status === 1 ? 'BẬT' : 'TẮT'}
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDeleteSearchKey(keyIdx, key.id)}
                                      className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                                      title="Xóa Key"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Input to add key */}
                        <div className="flex gap-2 pt-2">
                          <input
                            type="password"
                            value={newSearchKeys[provider.provider_name] || ''}
                            onChange={(e) => setNewSearchKeys(prev => ({ ...prev, [provider.provider_name]: e.target.value }))}
                            placeholder={`Nhập API Key mới cho ${provider.provider_name === 'tavily' ? 'Tavily' : provider.provider_name === 'brave' ? 'Brave' : 'Serper'}...`}
                            className="flex-1 bg-[#0d1527] border border-card-border/60 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                          />
                          <button
                            onClick={() => handleAddSearchKey(provider.provider_name)}
                            disabled={!(newSearchKeys[provider.provider_name] || '').trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:opacity-50 text-white text-[10px] font-black px-3.5 py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 whitespace-nowrap"
                          >
                            ➕ Thêm Key
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="flex items-center justify-between pt-4">
              <p className="text-[10px] text-gray-500 italic max-w-md">
                Lưu ý: Sau khi thực hiện các thay đổi (thêm, xóa, thay đổi độ ưu tiên hay bật/tắt), vui lòng bấm nút "Lưu Cấu HÌnh" bên phải để áp dụng chính thức vào SQLite.
              </p>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary-hover text-black font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all duration-150 active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <span className="animate-spin inline-block">🔄</span>
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    <span>Lưu Cấu Hình</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
