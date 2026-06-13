'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Import sub-components
import ConfigTab from '@/components/admin/ConfigTab';
import TeamsTab from '@/components/admin/TeamsTab';
import PromptsTab from '@/components/admin/PromptsTab';
import BacktestTab from '@/components/admin/BacktestTab';
import EditTeamModal from '@/components/admin/EditTeamModal';
import AdminPasswordModal from '@/components/admin/AdminPasswordModal';

export default function AdminConfigPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('config'); // 'config', 'teams', 'prompts', 'backtest'
  const [apiKeys, setApiKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [searchProviders, setSearchProviders] = useState([]);
  const [searchApiKeys, setSearchApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [syncingEnv, setSyncingEnv] = useState(false);

  // --- TRẠNG THÁI BẢO MẬT & GIẢI MÃ ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [decryptedKeys, setDecryptedKeys] = useState({}); // Lưu trữ { [encryptedKey]: decryptedValue }

  // --- TRẠNG THÁI QUẢN LÝ PROMPT AI ---
  const [prompts, setPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [selectedPromptKey, setSelectedPromptKey] = useState('predict_system');
  const [editPromptContent, setEditPromptContent] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [keyStatuses, setKeyStatuses] = useState({});

  // --- TRẠNG THÁI QUẢN LÝ ĐỘI TUYỂN ---
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [editFormData, setEditFormData] = useState({
    id: '',
    team_name: '',
    fifa_rank: '',
    elo_rating: '',
    recent_form: '',
    avg_goals_scored: '',
    avg_goals_conceded: '',
    key_players: '',
    tactical_analysis: ''
  });

  // Theo dõi các mục cần xóa khi lưu cấu hình
  const [deleteApiKeys, setDeleteApiKeys] = useState([]);
  const [deleteModels, setDeleteModels] = useState([]);
  const [deleteSearchApiKeys, setDeleteSearchApiKeys] = useState([]);

  // --- TRẠNG THÁI CHẠY BACKTEST ---
  const [backtestFixtures, setBacktestFixtures] = useState([]);
  const [totalTestMatches, setTotalTestMatches] = useState(0);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestLog, setBacktestLog] = useState([]);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [currentBacktestMatch, setCurrentBacktestMatch] = useState(null);
  const [fastMode, setFastMode] = useState(true);
  const [backtestTournament, setBacktestTournament] = useState('All');

  // Khởi tạo mount an toàn chống lỗi Hydration
  useEffect(() => {
    setMounted(true);
    fetchConfig();
  }, []);

  // --- HÀM FETCH TỰ ĐỘNG ĐÍNH KÈM MẬT KHẨU & BẮT LỖI 401 ---
  const fetch = async (url, options = {}) => {
    let password = '';
    if (typeof window !== 'undefined') {
      password = localStorage.getItem('admin_password') || '';
    }

    const headers = {
      ...options.headers,
      'x-admin-password': password
    };

    const res = await globalThis.fetch(url, { ...options, headers });
    
    if (res.status === 401 && url.toString().includes('/api/admin')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('admin_password');
        localStorage.removeItem('admin_auth_timestamp');
      }
      setIsAuthenticated(false);
      setShowPasswordModal(true);
      throw new Error('Mật khẩu quản trị không đúng hoặc phiên làm việc đã hết hạn.');
    }
    
    return res;
  };

  const fetchBacktestMatches = async () => {
    setLoadingBacktest(true);
    try {
      const res = await fetch(`/api/admin/backtest?tournament=${backtestTournament}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setBacktestFixtures(data.fixtures || []);
        setTotalTestMatches(data.totalTestMatches || 0);
      } else {
        throw new Error(data.error || 'Không thể lấy danh sách trận test');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi tải trận backtest: ' + err.message, 'error');
    } finally {
      setLoadingBacktest(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backtest') {
      fetchBacktestMatches();
    }
  }, [backtestTournament, activeTab]);

  const runBacktest = async () => {
    if (backtestRunning || backtestFixtures.length === 0) return;
    setBacktestRunning(true);
    setBacktestProgress(0);
    setBacktestLog([]);
    
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const total = backtestFixtures.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      const fixture = backtestFixtures[i];
      setCurrentBacktestMatch(fixture);
      
      const logMsg = `Đang xử lý trận ${i + 1}/${total}: ${fixture.homeTeam} vs ${fixture.awayTeam}`;
      setBacktestLog(prev => [...prev, `⏳ ${logMsg}...`]);

      try {
        const predictRes = await globalThis.fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            matchId: fixture.id,
            fastMode: fastMode,
            forceRefresh: true,
            isBacktest: true,
            marketHandicap: fixture.marketHandicap || 0.0
          })
        });

        const predictData = await predictRes.json();
        if (!predictRes.ok) {
          throw new Error(predictData.error || 'Dự đoán thất bại');
        }

        const predictedHome = predictData.predictedScore?.home ?? predictData.predicted_home_score;
        const predictedAway = predictData.predictedScore?.away ?? predictData.predicted_away_score;

        await delay(2000);

        const resultsRes = await globalThis.fetch('/api/results/auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            matchId: fixture.id,
            force: true
          })
        });

        const resultsData = await resultsRes.json();
        if (!resultsRes.ok) {
          throw new Error(resultsData.error || 'Chấm điểm thất bại');
        }

        const is1x2Correct = resultsData.betEvaluations?.oneXTwo?.outcome === 'correct';
        const isOuCorrect = resultsData.betEvaluations?.overUnder?.outcome === 'correct';
        const isHandicapCorrect = resultsData.betEvaluations?.handicap?.outcome === 'correct';
        const is1x2Refund = resultsData.betEvaluations?.oneXTwo?.outcome === 'refund';
        const isOuRefund = resultsData.betEvaluations?.overUnder?.outcome === 'refund';
        const isHandicapRefund = resultsData.betEvaluations?.handicap?.outcome === 'refund';

        const outcome = is1x2Correct ? 'Đúng' : (is1x2Refund ? 'Hòa' : 'Sai');
        const ou = isOuCorrect ? 'Đúng' : (isOuRefund ? 'Hòa' : 'Sai');
        const handicapOutcome = isHandicapCorrect ? 'Đúng' : (isHandicapRefund ? 'Hòa' : 'Sai');
        
        successCount++;
        setBacktestLog(prev => [
          ...prev,
          `✅ Trận ${i + 1}/${total} hoàn tất: ${fixture.homeTeam} ${predictedHome}-${predictedAway} ${fixture.awayTeam} (Thực tế: ${fixture.actualHomeScore}-${fixture.actualAwayScore}) | 1X2: ${outcome} | Tài xỉu: ${ou} | Chấp: ${handicapOutcome}`
        ]);

      } catch (error) {
        console.error(`Lỗi trận ${fixture.homeTeam} vs ${fixture.awayTeam}:`, error);
        setBacktestLog(prev => [
          ...prev,
          `❌ Trận ${i + 1}/${total} lỗi: ${error.message}`
        ]);
      }

      setBacktestProgress(Math.round(((i + 1) / total) * 100));

      if (i < total - 1) {
        await delay(1000);
      }
    }

    setBacktestRunning(false);
    setCurrentBacktestMatch(null);
    setBacktestLog(prev => [...prev, `🏁 Đã chạy xong backtest! Hoàn thành dự đoán ${successCount}/${total} trận.`]);
    showStatusMessage(`🏁 Đã hoàn thành tiến trình backtest tăng cỡ mẫu!`, 'success');
    fetchBacktestMatches();
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordInput) return;
    setVerifyingPassword(true);
    setPasswordError(null);
    try {
      const res = await globalThis.fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('admin_password', passwordInput);
          localStorage.setItem('admin_auth_timestamp', Date.now().toString());
        }
        setIsAuthenticated(true);
        setShowPasswordModal(false);
        setPasswordError(null);
        setPasswordInput('');
        fetchConfig();
      } else {
        throw new Error(data.error || 'Mật khẩu quản trị không chính xác');
      }
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleDecryptKey = async (encryptedKey) => {
    try {
      const res = await fetch('/api/admin/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedKey })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDecryptedKeys(prev => ({
          ...prev,
          [encryptedKey]: data.decryptedKey
        }));
        // Tự động che lại sau 30 giây để bảo mật (Rule bảo mật)
        setTimeout(() => {
          setDecryptedKeys(prev => {
            const copy = { ...prev };
            delete copy[encryptedKey];
            return copy;
          });
        }, 30000);
      } else {
        throw new Error(data.error || 'Giải mã thất bại');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi giải mã API key: ' + err.message, 'error');
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    setDecryptedKeys({});
    try {
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      if (res.ok) {
        setApiKeys(data.apiKeys || []);
        setModels(data.models || []);
        setSearchProviders(data.searchProviders || []);
        setSearchApiKeys(data.searchApiKeys || []);
        setIsAuthenticated(true);
      } else {
        throw new Error(data.error || 'Không thể lấy cấu hình');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi tải cấu hình: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const res = await fetch('/api/admin/teams');
      const data = await res.json();
      if (res.ok && data.success) {
        setTeams(data.teams || []);
      } else {
        throw new Error(data.error || 'Không thể tải danh sách đội tuyển');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi tải đội tuyển: ' + err.message, 'error');
    } finally {
      setLoadingTeams(false);
    }
  };

  const showStatusMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage(null);
    }, 5000);
  };

  const handleSyncEnvKeys = async () => {
    setSyncingEnv(true);
    try {
      const res = await fetch('/api/admin/config/sync-env-keys', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showStatusMessage(data.message, 'success');
        fetchConfig();
      } else {
        throw new Error(data.error || 'Đồng bộ thất bại');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi khi đồng bộ keys: ' + err.message, 'error');
    } finally {
      setSyncingEnv(false);
    }
  };

  // --- API KEY ACTIONS ---
  const handleAddKey = (provider, value) => {
    if (apiKeys.some(k => k.key_value.trim() === value.trim())) {
      showStatusMessage('⚠️ API key này đã có trong danh sách.', 'error');
      return;
    }
    const item = {
      provider,
      key_value: value.trim(),
      status: 1
    };
    setApiKeys([...apiKeys, item]);
    showStatusMessage('➕ Đã thêm API key tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
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
    showStatusMessage('🗑️ Đã xóa API key tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  // --- MODEL ACTIONS ---
  const handleAddModel = (provider, name) => {
    if (models.some(m => m.model_name.trim().toLowerCase() === name.trim().toLowerCase())) {
      showStatusMessage('⚠️ Model này đã có trong danh sách.', 'error');
      return;
    }
    const maxPriority = models.reduce((max, m) => m.priority > max ? m.priority : max, 0);
    const item = {
      provider,
      model_name: name.trim(),
      priority: maxPriority + 1,
      status: 1
    };
    setModels([...models, item]);
    showStatusMessage('➕ Đã thêm model tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleToggleModelStatus = (index) => {
    const updated = [...models];
    updated[index].status = updated[index].status === 1 ? 0 : 1;
    setModels(updated);
  };

  const handleDeleteModel = (index, id) => {
    const updated = [...models];
    updated.splice(index, 1);
    const reordered = updated.map((m, idx) => ({
      ...m,
      priority: idx + 1
    }));
    setModels(reordered);
    if (id) {
      setDeleteModels([...deleteModels, id]);
    }
    showStatusMessage('🗑️ Đã xóa model tạm thời. Nhớ bấm "Lưu cấu hình" để cập nhật.');
  };

  const handleMoveModel = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === models.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...models];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
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
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
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

  const handleAddSearchKey = (providerName, keyValue) => {
    if (searchApiKeys.some(k => k.provider_name === providerName && k.key_value.trim() === keyValue.trim())) {
      showStatusMessage(`⚠️ API key này đã có cho ${providerName}.`, 'error');
      return;
    }
    const item = {
      provider_name: providerName,
      key_value: keyValue.trim(),
      status: 1
    };
    setSearchApiKeys([...searchApiKeys, item]);
    showStatusMessage(`➕ Đã thêm API key tạm thời cho ${providerName}. Nhớ bấm "Lưu cấu hình" để cập nhật.`);
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
    showStatusMessage(`🗑️ Đã xóa API key tạm thời của ${itemDeleted.provider_name}. Nhớ bấm "Lưu cấu hình" để cập nhật.`);
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

  const handleCheckKey = async (provider, apiKey) => {
    if (!apiKey) return;
    const trimmed = apiKey.trim();
    
    setKeyStatuses(prev => ({
      ...prev,
      [trimmed]: { loading: true, status: null, creditText: null, error: null }
    }));

    try {
      const res = await fetch('/api/admin/config/check-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: trimmed })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.status === 'active') {
          let creditText = '';
          if (data.credit) {
            creditText = `Dùng: ${data.credit.used}/${data.credit.limit}`;
          }
          setKeyStatuses(prev => ({
            ...prev,
            [trimmed]: { loading: false, status: 'active', creditText, error: null }
          }));
        } else {
          setKeyStatuses(prev => ({
            ...prev,
            [trimmed]: { loading: false, status: 'inactive', creditText: null, error: data.errorDetails }
          }));
        }
      } else {
        throw new Error(data.error || 'Lỗi khi gọi API kiểm tra');
      }
    } catch (err) {
      setKeyStatuses(prev => ({
        ...prev,
        [trimmed]: { loading: false, status: 'inactive', creditText: null, error: err.message }
      }));
    }
  };

  // --- ACTIONS CHO PROMPTS AI ---
  const fetchPrompts = async () => {
    setLoadingPrompts(true);
    try {
      const res = await fetch('/api/admin/prompts');
      const data = await res.json();
      if (res.ok && data.success) {
        setPrompts(data.prompts || []);
        const cur = data.prompts.find(p => p.prompt_key === selectedPromptKey);
        if (cur) {
          setEditPromptContent(cur.prompt_content);
        }
      } else {
        throw new Error(data.error || 'Không thể tải danh sách prompt');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi tải prompt: ' + err.message, 'error');
    } finally {
      setLoadingPrompts(false);
    }
  };

  useEffect(() => {
    if (prompts.length > 0) {
      const cur = prompts.find(p => p.prompt_key === selectedPromptKey);
      if (cur) {
        setEditPromptContent(cur.prompt_content);
      }
    }
  }, [selectedPromptKey, prompts]);

  const handleSavePrompt = async () => {
    if (editPromptContent === undefined) return;
    setSavingPrompt(true);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptKey: selectedPromptKey,
          promptContent: editPromptContent
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPrompts(prev => prev.map(p => p.prompt_key === selectedPromptKey ? { ...p, prompt_content: editPromptContent, last_updated: new Date().toISOString() } : p));
        showStatusMessage('💾 Đã lưu thay đổi prompt thành công!', 'success');
      } else {
        throw new Error(data.error || 'Lỗi khi lưu prompt');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi lưu prompt: ' + err.message, 'error');
    } finally {
      setSavingPrompt(false);
    }
  };

  // Prompts fallbacks (System prompts default)
  const DEFAULT_SYSTEM_PROMPT = `Bạn là một chuyên gia phân tích bóng đá thế giới hàng đầu, chuyên gia soi kèo bóng đá cho kỳ World Cup 2026.
Hãy đưa ra nhận định, dự đoán kết quả và soi kèo cho trận đấu giữa:
Đội nhà (Home Team): {{homeTeam}}
Đội khách (Away Team): {{awayTeam}}

--- THÔNG SỐ ĐỊNH LƯỢNG THỰC LỰC CỦA HAI ĐỘI (SQLITE METADATA BASELINE) ---
- Đội nhà [{{homeTeam}}]: {{homeStats}}
- Đội khách [{{awayTeam}}]: {{awayStats}}

--- MÔ HÌNH TOÁN HỌC POISSON & MÔ PHỎNG MONTE CARLO 10,000 LẦN ---
Hệ thống đã chạy mô hình toán học Poisson kết hợp mô phỏng Monte Carlo 10,000 lần. Hãy sử dụng dữ liệu toán học này làm cơ sở định lượng quan trọng:
{{poissonMonteCarlo}}
Lưu ý: Bạn cần dùng trí tuệ AI phân tích thêm các tin tức định tính từ RAG Search (như chấn thương mới nhất, thời tiết, động lực bảng đấu...) để điều chỉnh nhẹ tỷ lệ xác suất và tỉ số cuối cùng cho tối ưu nhất.

{{feedbackSection}}

--- CÁCH THỨC SUY LUẬN & ĐỊNH DẠNG JSON MẪU (FEW-SHOT EXAMPLES & CHAIN OF THOUGHT) ---
Để nâng cao độ chính xác, bạn BẮT BUỘC phải thực hiện suy luận từng bước (Chain of Thought) trong phân tích trước khi đưa ra kết quả kèo cược. Hãy phân tích kỹ lưỡng các khía cạnh: tương quan lực lượng, chiến thuật và động lực thi đấu.
Dưới đây là một ví dụ mẫu về cấu trúc phân tích và định dạng JSON mong muốn:
{
  "winProbability": {
    "home": 55,
    "draw": 25,
    "away": 20
  },
  "predictedScore": {
    "home": 2,
    "away": 1
  },
  "analysis": {
    "homeTeam": "Đội nhà có đội hình mạnh mẽ với các ngôi sao tấn công đang đạt điểm rơi phong độ cao. Tuy nhiên hàng thủ bộc lộ sơ hở khi thiếu vắng trung vệ trụ cột do chấn thương.",
    "awayTeam": "Đội khách thi đấu kỷ luật, chơi phòng ngự lùi sâu tốt. Tuy nhiên tuyến tiền vệ thiếu sáng tạo khiến việc tịnh tiến bóng phản công gặp nhiều khó khăn.",
    "keyFactors": [
      "Khả năng áp đặt thế trận của hàng tiền vệ đội nhà.",
      "Sự thiếu vắng trung vệ cốt cán của đội nhà có bị khai thác?",
      "Độ hiệu quả trong các pha phản công nhanh của đội khách."
    ],
    "predictionReasoning": "[SUY LUẬN LOGIC]: Phân tích chỉ số ELO cho thấy đội nhà (1820) vượt trội đội khách (1650). Mô hình Poisson dự báo tỉ số lý thuyết là 2-0. Tuy nhiên, tin tức RAG cho thấy trung vệ chính của đội nhà chấn thương, trong khi tiền đạo đội khách đang có phong độ tốt. Do đó, đội khách khả năng cao sẽ ghi được 1 bàn từ phản công. Kết quả dự đoán được điều chỉnh thành 2-1 nghiêng về đội nhà."
  },
  "bets": {
    "oneXTwo": {
      "recommendation": "Home",
      "reason": "Đội nhà có thực lực vượt trội và lợi thế sân bãi đủ để giành 3 điểm trọn vẹn."
    },
    "overUnder": {
      "recommendation": "Over 2.5",
      "reason": "Khả năng cao trận đấu cởi mở do hàng thủ đội nhà khuyết người còn hàng công hai bên đều sút tốt phong độ ổn định."
    },
    "handicap": {
      "recommendation": "Home -0.75",
      "reason": "Lựa chọn an toàn hơn khi đội nhà thắng cách biệt tối thiểu hoặc hơn."
    },
    "btts": {
      "recommendation": "Yes",
      "reason": "Hàng công hai bên đều có các nhân tố đột biến và phòng ngự có sơ hở."
    },
    "corners": {
      "recommendation": "Over 8.5 Corners",
      "reason": "Đội nhà sẽ ép sân mạnh ở cánh tạo ra nhiều quả phạt góc."
    },
    "cards": {
      "recommendation": "Under 3.5 Cards",
      "reason": "Lối đá hai đội cống hiến kỹ thuật, ít va chạm quyết liệt phi thể thao."
    }
  }
}

Chú ý: Tổng phần trăm trong \"winProbability\" (home + draw + away) phải bằng chính xác 100. Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

  const DEFAULT_RAG_PROMPT = `--- THÔNG TIN TRA CỨU TỪ INTERNET (TIN TỨC & THỐNG KÊ THỰC TẾ) ---
{{searchContext}}`;

  const DEFAULT_FEEDBACK_PROMPT = `--- LỊCH SỬ DỰ ĐOÁN & SAI SỐ TRƯỚC ĐÂY CỦA BẠN (HỌC MÁY NGỮ CẢNH) ---
Hệ thống đã lưu lại các dự đoán trước đây của bạn đối với 2 đội bóng này. Hãy phân tích kỹ các lỗi dự đoán trước đây để tránh lặp lại sai lầm và tăng độ chính xác lần này:
{{historyTexts}}
Tỷ lệ dự đoán đúng kết quả chung cuộc (1X2) gần đây của bạn với 2 đội này là: {{rate}}% ({{correct}}/{{total}} trận đúng).`;

  const DEFAULT_CRITIC_PROMPT = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là bản nháp nhận định ban đầu cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- BẢN NHÁP DỰ ĐOÁN (DRAFT PREDICTION JSON) ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng bản nháp trên. Tìm ra các lỗi logic suy luận (ví dụ: dự đoán đội nhà thắng ELO cao hơn nhưng lại đưa ra kèo Draw hoặc Away có tỷ lệ thắng cao hơn phi lý, hoặc dự kiến ít bàn thắng nhưng kèo Tài Xỉu khuyến nghị Over...).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem bản nháp đã bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards).

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). Trong phần analysis.predictionReasoning, hãy ghi rõ: "[TINH CHỈNH PHẢN BIỆN]: <Lý do phản biện và những điểm đã tối ưu hóa so với bản nháp>".

Lưu ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

  const DEFAULT_SYNC_PROMPT = `Hãy tìm kiếm lịch thi đấu chính thức đầy đủ và kết quả các trận đấu bóng đá của giải đấu {{tournament}} mùa giải {{season}}.
Nhiệm vụ của bạn:
1. Sử dụng thông tin tra cứu bên dưới để lấy thông tin lịch thi đấu chính thức.
2. Trả về danh sách các trận đấu (gồm vòng bảng và các trận đấu tiếp theo hoặc kết quả nếu có).
   Chúng tôi cần danh sách trận đấu chuẩn xác để lưu vào cơ sở dữ liệu.
3. Xuất kết quả dưới định dạng JSON thô duy nhất theo cấu trúc sau (trả về khoảng 20-30 trận tiêu biểu của giải đấu để tránh quá giới hạn Token phản hồi):
{
  "fixtures": [
    {
      "id": "m_cụ_thể", // ví dụ: m1, m2... hoặc chuỗi id tự sinh không trùng
      "homeTeam": "<Tên tiếng Anh chuẩn của đội nhà, ví dụ: Arsenal, Chelsea, Real Madrid, Mexico, USA, Brazil...>",
      "awayTeam": "<Tên tiếng Anh chuẩn của đội khách, ví dụ: South Africa, Spain, England...>",
      "date": "<Ngày diễn ra định dạng YYYY-MM-DD>",
      "time": "<Giờ thi đấu định dạng HH:MM>",
      "group": "<Tên bảng hoặc vòng đấu, ví dụ: 'Group A', 'Group B', hoặc 'Round of 32', 'Matchweek 1', 'Round of 16'>",
      "venue": "<Tên sân vận động và thành phố>"
    }
  ]
}

Chú ý: Chỉ trả về chuỗi JSON thô, không chứa markdown, không có chữ thừa. Hãy giữ nguyên các tên quốc gia/đội bóng chuẩn tiếng Anh.`;

  const DEFAULT_MATCH_CHAT_PROMPT = `Bạn là một trợ lý AI phân tích kèo bóng đá chuyên sâu. Hãy hỗ trợ tư vấn nhận định kèo cược cho người chơi dựa trên các thông số dữ liệu ELO, Poisson, Monte Carlo và tình huống thực tế của trận đấu sau.

--- THÔNG TIN TRẬN ĐẤU ---
- Trận đấu: {{homeTeam}} vs {{awayTeam}}
- Giải đấu: {{tournament}} | Mùa giải: {{season}}
- Thời gian: {{date}} lúc {{time}}
- Địa điểm: {{venue}}
{{predictionContext}}

--- HƯỚNG DẪN TƯ VẤN ---
1. Chỉ trả lời các câu hỏi liên quan đến trận đấu này, phong độ, chiến thuật, tình hình chấn thương, phân tích kèo cược thể thao.
2. Từ chối lịch sự nếu người dùng hỏi các chủ đề ngoài bóng đá hoặc các trận đấu không liên quan.
3. Câu trả lời cần ngắn gọn, rõ ràng, tập trung phân tích logic kèo và thực tế trận đấu để gợi ý lựa chọn tối ưu cho người chơi.`;

  const handleResetPrompt = () => {
    let defaultContent = '';
    if (selectedPromptKey === 'predict_system') defaultContent = DEFAULT_SYSTEM_PROMPT;
    else if (selectedPromptKey === 'predict_rag_template') defaultContent = DEFAULT_RAG_PROMPT;
    else if (selectedPromptKey === 'predict_feedback_template') defaultContent = DEFAULT_FEEDBACK_PROMPT;
    else if (selectedPromptKey === 'predict_critic_template') defaultContent = DEFAULT_CRITIC_PROMPT;
    else if (selectedPromptKey === 'sync_fixtures_template') defaultContent = DEFAULT_SYNC_PROMPT;
    else if (selectedPromptKey === 'match_chat_system') defaultContent = DEFAULT_MATCH_CHAT_PROMPT;

    setEditPromptContent(defaultContent);
    showStatusMessage(`🔄 Đã tải prompt mặc định cho ${selectedPromptKey}. Nhớ bấm "Lưu thay đổi" để cập nhật chính thức.`);
  };

  // --- ACTIONS CHO ĐỘI TUYỂN ---
  const handleEditTeamClick = (team) => {
    setSelectedTeam(team);
    setEditFormData({
      id: team.id,
      team_name: team.team_name,
      fifa_rank: team.fifa_rank ?? '',
      elo_rating: team.elo_rating ?? '',
      recent_form: team.recent_form ?? '',
      avg_goals_scored: team.avg_goals_scored ?? '',
      avg_goals_conceded: team.avg_goals_conceded ?? '',
      key_players: team.key_players ?? '',
      tactical_analysis: team.tactical_analysis ?? ''
    });
    setEditModalOpen(true);
  };

  const handleTeamFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTeams(prev => prev.map(t => t.id === data.team.id ? data.team : t));
        setEditModalOpen(false);
        showStatusMessage(`💾 Đã lưu thông tin đội ${data.team.team_name} thành công!`, 'success');
      } else {
        throw new Error(data.error || 'Lỗi lưu thông tin');
      }
    } catch (err) {
      showStatusMessage('🔴 Lỗi lưu thông tin: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Render loading hydration chống lỗi SSR/CSR mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#060A13] text-gray-200 flex items-center justify-center">
        <div className="text-center">
          <span className="text-3xl block mb-3 animate-spin">⏳</span>
          <p className="text-xs text-gray-500">Đang khởi tạo giao diện quản trị...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060A13] text-gray-200 flex items-center justify-center">
        <div className="text-center">
          <span className="text-3xl block mb-3 animate-spin">⏳</span>
          <p className="text-xs text-gray-500">Đang tải cấu hình hệ thống...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#060A13] text-gray-200 flex items-center justify-center">
        <AdminPasswordModal
          show={true}
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          passwordError={passwordError}
          verifyingPassword={verifyingPassword}
          onSubmit={handlePasswordSubmit}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060A13] text-gray-200 py-10 px-4 sm:px-6 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-5 gap-4">
          <div>
            <h1 className="text-2xl font-black text-gradient flex items-center space-x-2">
              <span>🛠️</span>
              <span>Cấu hình hệ thống AI Predictor</span>
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Quản trị API keys, danh sách AI models, ELO đội tuyển và các Search Engine cho RAG, lưu trữ trực tiếp vào cơ sở dữ liệu SQLite.
            </p>
          </div>
          <div>
            <Link
              href="/"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-300 font-bold py-2 px-4 rounded-xl transition-all duration-150 flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🏠</span>
              <span>Trang chủ</span>
            </Link>
          </div>
        </div>

        {/* Status Alert Banner */}
        {message && (
          <div className={`p-4 rounded-xl border text-xs font-semibold backdrop-blur-md transition-all duration-300 ${message.type === 'error'
              ? 'bg-rose-500/10 text-rose-405 border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
            {message.text}
          </div>
        )}

        {/* Tab Switcher - Support vuốt ngang trên mobile */}
        <div className="flex border-b border-white/5 pb-0.5 gap-2 overflow-x-auto scrollbar-none flex-nowrap text-nowrap">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${activeTab === 'config'
                ? 'border-primary text-primary font-black'
                : 'border-transparent text-gray-400 hover:text-gray-250'
              }`}
          >
            ⚙️ Cấu hình AI & RAG
          </button>
          <button
            onClick={() => {
              setActiveTab('teams');
              fetchTeams();
            }}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${activeTab === 'teams'
                ? 'border-secondary text-secondary font-black'
                : 'border-transparent text-gray-400 hover:text-gray-250'
              }`}
          >
            🏃 Quản lý đội tuyển
          </button>
          <button
            onClick={() => {
              setActiveTab('prompts');
              fetchPrompts();
            }}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${activeTab === 'prompts'
                ? 'border-indigo-400 text-indigo-400 font-black'
                : 'border-transparent text-gray-400 hover:text-gray-250'
              }`}
          >
            📝 Quản lý prompt AI
          </button>
          <button
            onClick={() => {
              setActiveTab('backtest');
              fetchBacktestMatches();
            }}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${activeTab === 'backtest'
                ? 'border-accent text-accent font-black'
                : 'border-transparent text-gray-400 hover:text-gray-250'
              }`}
          >
            🧪 Chạy backtest tăng cỡ mẫu
          </button>
        </div>

        {/* CONTENT PANELS */}
        {loading || (activeTab === 'teams' && loadingTeams && teams.length === 0) ? (
          <div className="text-center py-20 glass-panel rounded-2xl border border-white/10 bg-[#0f172a]/10">
            <span className="text-2xl block mb-2 animate-spin">⏳</span>
            <p className="text-xs text-gray-500">Đang tải dữ liệu cấu hình...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: AI CONFIGURATION */}
            {activeTab === 'config' && (
              <ConfigTab
                apiKeys={apiKeys}
                models={models}
                searchProviders={searchProviders}
                searchApiKeys={searchApiKeys}
                decryptedKeys={decryptedKeys}
                keyStatuses={keyStatuses}
                syncingEnv={syncingEnv}
                saving={saving}
                onSyncEnvKeys={handleSyncEnvKeys}
                onSaveConfig={handleSaveConfig}
                onAddKey={handleAddKey}
                onToggleKeyStatus={handleToggleKeyStatus}
                onDeleteKey={handleDeleteKey}
                onDecryptKey={handleDecryptKey}
                onCheckKey={handleCheckKey}
                onAddModel={handleAddModel}
                onToggleModelStatus={handleToggleModelStatus}
                onDeleteModel={handleDeleteModel}
                onMoveModel={handleMoveModel}
                onMoveProvider={handleMoveSearchProvider}
                onToggleProviderStatus={handleToggleSearchProviderStatus}
                onAddSearchKey={handleAddSearchKey}
                onToggleSearchKeyStatus={handleToggleSearchKeyStatus}
                onDeleteSearchKey={handleDeleteSearchKey}
              />
            )}

            {/* TAB 2: TEAMS MANAGEMENT */}
            {activeTab === 'teams' && (
              <TeamsTab
                teams={teams}
                onEditTeam={handleEditTeamClick}
              />
            )}

            {/* TAB 3: PROMPTS MANAGEMENT */}
            {activeTab === 'prompts' && (
              <PromptsTab
                prompts={prompts}
                selectedPromptKey={selectedPromptKey}
                setSelectedPromptKey={setSelectedPromptKey}
                editPromptContent={editPromptContent}
                setEditPromptContent={setEditPromptContent}
                savingPrompt={savingPrompt}
                loadingPrompts={loadingPrompts}
                onSavePrompt={handleSavePrompt}
                onResetPrompt={handleResetPrompt}
              />
            )}

            {/* TAB 4: BACKTEST */}
            {activeTab === 'backtest' && (
              <BacktestTab
                backtestFixtures={backtestFixtures}
                loadingBacktest={loadingBacktest}
                backtestRunning={backtestRunning}
                backtestLog={backtestLog}
                backtestProgress={backtestProgress}
                currentBacktestMatch={currentBacktestMatch}
                fastMode={fastMode}
                setFastMode={setFastMode}
                backtestTournament={backtestTournament}
                setBacktestTournament={setBacktestTournament}
                onRunBacktest={runBacktest}
              />
            )}
          </>
        )}

        {/* --- EDIT TEAM MODAL GLASSMORPHISM --- */}
        <EditTeamModal
          show={editModalOpen}
          selectedTeam={selectedTeam}
          editFormData={editFormData}
          onChange={handleTeamFormChange}
          onSubmit={handleSaveTeam}
          saving={saving}
          onClose={() => setEditModalOpen(false)}
        />

        {/* MODAL MẬT KHẨU ADMIN (GLASSMORPHISM) */}
        <AdminPasswordModal
          show={showPasswordModal}
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          passwordError={passwordError}
          verifyingPassword={verifyingPassword}
          onSubmit={handlePasswordSubmit}
        />

      </div>
    </div>
  );
}
