'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getTeamFlag } from '@/lib/flags';

export default function AdminConfigPage() {
  const [activeTab, setActiveTab] = useState('config'); // 'config', 'teams' hoặc 'prompts'
  const [apiKeys, setApiKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [searchProviders, setSearchProviders] = useState([]);
  const [searchApiKeys, setSearchApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');

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

  // Trạng thái cho biểu mẫu thêm mới cấu hình
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

  const handleToggleKeyShow = (id) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- API KEY ACTIONS (Google Gemini) ---
  const handleAddKey = () => {
    if (!newKey.trim()) return;
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

  const handleAddSearchKey = (providerName) => {
    const keyValue = newSearchKeys[providerName] || '';
    if (!keyValue.trim()) return;
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

  // --- CẤU HÌNH PROMPTS MẶC ĐỊNH (CLIENT FALLBACK) ---
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

  // --- ACTIONS CHO PROMPTS AI ---
  const fetchPrompts = async () => {
    setLoadingPrompts(true);
    try {
      const res = await fetch('/api/admin/prompts');
      const data = await res.json();
      if (res.ok && data.success) {
        setPrompts(data.prompts || []);
        // Tìm prompt đang chọn và cập nhật nội dung soạn thảo
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

  const handleResetPrompt = () => {
    let defaultContent = '';
    if (selectedPromptKey === 'predict_system') defaultContent = DEFAULT_SYSTEM_PROMPT;
    else if (selectedPromptKey === 'predict_rag_template') defaultContent = DEFAULT_RAG_PROMPT;
    else if (selectedPromptKey === 'predict_feedback_template') defaultContent = DEFAULT_FEEDBACK_PROMPT;
    else if (selectedPromptKey === 'predict_critic_template') defaultContent = DEFAULT_CRITIC_PROMPT;

    setEditPromptContent(defaultContent);
    showStatusMessage(`🔄 Đã tải prompt mặc định cho ${selectedPromptKey}. Nhớ bấm "Lưu Thay Đổi" để cập nhật chính thức.`);
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

  const getTeamGroup = (teamName) => {
    const groupMapping = {
      "Mexico": "Group A", "South Africa": "Group A", "South Korea": "Group A", "Czechia": "Group A",
      "Canada": "Group B", "Bosnia and Herzegovina": "Group B", "Qatar": "Group B", "Switzerland": "Group B",
      "Brazil": "Group C", "Haiti": "Group C", "Morocco": "Group C", "Scotland": "Group C",
      "USA": "Group D", "United States": "Group D", "Paraguay": "Group D", "Australia": "Group D", "Turkey": "Group D", "Türkiye": "Group D",
      "Germany": "Group E", "Curaçao": "Group E", "Ivory Coast": "Group E", "Ecuador": "Group E",
      "Japan": "Group F", "Netherlands": "Group F", "Sweden": "Group F", "Tunisia": "Group F",
      "Belgium": "Group G", "Egypt": "Group G", "Iran": "Group G", "New Zealand": "Group G",
      "Cape Verde": "Group H", "Saudi Arabia": "Group H", "Spain": "Group H", "Uruguay": "Group H",
      "France": "Group I", "Iraq": "Group I", "Norway": "Group I", "Senegal": "Group I",
      "Algeria": "Group J", "Argentina": "Group J", "Austria": "Group J", "Jordan": "Group J",
      "Colombia": "Group K", "DR Congo": "Group K", "Portugal": "Group K", "Uzbekistan": "Group K",
      "Croatia": "Group L", "England": "Group L", "Ghana": "Group L", "Panama": "Group L"
    };
    return groupMapping[teamName] || "N/A";
  };

  const renderFormBadge = (formStr) => {
    if (!formStr) return <span className="text-gray-600 italic">Chưa có</span>;
    return (
      <div className="flex gap-1">
        {formStr.split(',').map((char, idx) => {
          const c = char.trim().toUpperCase();
          let bg = 'bg-gray-600 text-white';
          if (c === 'W') bg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35';
          if (c === 'D') bg = 'bg-gray-500/20 text-gray-400 border border-gray-500/35';
          if (c === 'L') bg = 'bg-rose-500/20 text-rose-400 border border-rose-500/35';
          return (
            <span key={idx} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${bg}`}>
              {c}
            </span>
          );
        })}
      </div>
    );
  };

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
              Quản trị API Keys, danh sách AI models, ELO đội tuyển và các Search Engine cho RAG, lưu trữ trực tiếp vào cơ sở dữ liệu SQLite.
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
          <div className={`p-4 rounded-xl border text-xs font-semibold backdrop-blur-md transition-all duration-300 ${message.type === 'error'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
            {message.text}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-card-border/40 pb-0.5 gap-2">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer ${activeTab === 'config'
                ? 'border-primary text-primary font-black'
                : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            ⚙️ Cấu Hình AI & RAG
          </button>
          <button
            onClick={() => {
              setActiveTab('teams');
              fetchTeams();
            }}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer ${activeTab === 'teams'
                ? 'border-secondary text-secondary font-black'
                : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            🏃 Quản Lý Đội Tuyển
          </button>
          <button
            onClick={() => {
              setActiveTab('prompts');
              fetchPrompts();
            }}
            className={`py-2.5 px-5 text-xs font-bold transition-all border-b-2 cursor-pointer ${activeTab === 'prompts'
                ? 'border-indigo-400 text-indigo-400 font-black'
                : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            📝 Quản Lý Prompt AI
          </button>
        </div>

        {/* CONTENT PANELS */}
        {loading || (activeTab === 'teams' && loadingTeams && teams.length === 0) ? (
          <div className="text-center py-20 glass-panel rounded-2xl border border-card-border">
            <span className="text-2xl block mb-2 animate-spin">⏳</span>
            <p className="text-xs text-gray-500">Đang tải dữ liệu cấu hình...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: AI CONFIGURATION */}
            {activeTab === 'config' && (
              <div className="space-y-8 animate-fade-in">
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
                              className="text-gray-550 hover:text-gray-300 cursor-pointer mr-2.5"
                            >
                              {showKeys[key.id || index] ? '👁️' : '👁️‍'}
                            </button>
                            <div className="flex items-center space-x-2 mr-2">
                              <button
                                onClick={() => handleCheckKey('gemini', key.key_value)}
                                disabled={keyStatuses[key.key_value.trim()]?.loading}
                                className="bg-[#151E2E] hover:bg-primary/20 border border-card-border/60 hover:border-primary/50 text-[10px] text-gray-400 hover:text-primary px-2 py-0.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              >
                                {keyStatuses[key.key_value.trim()]?.loading ? '⏳...' : '⚡ Check'}
                              </button>
                              {keyStatuses[key.key_value.trim()]?.status === 'active' && (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-lg text-[9px] font-bold">🟢 Active</span>
                              )}
                              {keyStatuses[key.key_value.trim()]?.status === 'inactive' && (
                                <span 
                                  title={keyStatuses[key.key_value.trim()]?.error}
                                  className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-2 py-0.5 rounded-lg text-[9px] font-bold cursor-help"
                                >
                                  🔴 Lỗi
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-3.5">
                            <button
                              onClick={() => handleToggleKeyStatus(index)}
                              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${key.status === 1
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}
                            >
                              {key.status === 1 ? 'BẬT' : 'TẮT'}
                            </button>
                            <button
                              onClick={() => handleDeleteKey(index, key.id)}
                              className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
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
                      className="bg-secondary hover:bg-secondary-hover disabled:bg-gray-700 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-xl transition-all"
                    >
                      ➕ Thêm
                    </button>
                  </div>

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
                            <button
                              onClick={() => handleMoveModel(index, 'up')}
                              disabled={index === 0}
                              className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveModel(index, 'down')}
                              disabled={index === models.length - 1}
                              className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            >
                              ▼
                            </button>
                            <span className="w-1 bg-card-border/40 h-6 mx-1 inline-block"></span>
                            <button
                              onClick={() => handleToggleModelStatus(index)}
                              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${model.status === 1
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}
                            >
                              {model.status === 1 ? 'BẬT' : 'TẮT'}
                            </button>
                            <button
                              onClick={() => handleDeleteModel(index, model.id)}
                              className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. SEARCH PROVIDERS CONFIGURATION SECTION */}
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
                          className={`border rounded-2xl p-4 transition-all duration-200 ${provider.status === 1
                              ? 'bg-[#0f182c]/40 border-card-border/70 hover:border-indigo-500/40'
                              : 'bg-card-border/5 border-card-border/30 opacity-60'
                            }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-card-border/30 pb-3 mb-4">
                            <div className="flex items-center space-x-3.5">
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
                                    ? 'API chuyên dụng RAG (1,000 reqs/tháng)'
                                    : provider.provider_name === 'brave'
                                      ? 'Tìm kiếm độc lập (2,000 reqs/tháng)'
                                      : 'Google Search siêu nhanh (2,500 reqs)'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleMoveSearchProvider(index, 'up')}
                                disabled={index === 0}
                                className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => handleMoveSearchProvider(index, 'down')}
                                disabled={index === searchProviders.length - 1}
                                className="bg-card-border/40 border border-card-border/70 hover:border-gray-550 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                              >
                                ▼
                              </button>
                              <span className="w-1 bg-card-border/40 h-6 mx-1 inline-block"></span>
                              <button
                                onClick={() => handleToggleSearchProviderStatus(index)}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${provider.status === 1
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}
                              >
                                {provider.status === 1 ? 'BẬT' : 'TẮT'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3 pl-2 sm:pl-10">
                            {providerKeys.length === 0 ? (
                              <p className="text-[10px] text-gray-500 italic py-1">Chưa có API key nào. Vui lòng thêm bên dưới.</p>
                            ) : (
                              <div className="space-y-2">
                                {providerKeys.map((key) => {
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
                                          className="text-gray-550 hover:text-gray-300 cursor-pointer mr-2.5"
                                        >
                                          {showSearchKeys[key.id || keyIdx] ? '👁️' : '👁️‍'}
                                        </button>
                                        <div className="flex items-center space-x-2 mr-2">
                                          <button
                                            onClick={() => handleCheckKey(provider.provider_name, key.key_value)}
                                            disabled={keyStatuses[key.key_value.trim()]?.loading}
                                            className="bg-[#151E2E] hover:bg-indigo-500/20 border border-card-border/60 hover:border-indigo-555 text-[9px] text-gray-400 hover:text-indigo-400 px-2 py-0.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                          >
                                            {keyStatuses[key.key_value.trim()]?.loading ? '⏳...' : '⚡ Check'}
                                          </button>
                                          {keyStatuses[key.key_value.trim()]?.status === 'active' && (
                                            <div className="flex flex-col">
                                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[8px] font-bold">🟢 Active</span>
                                              {keyStatuses[key.key_value.trim()]?.creditText && (
                                                <span className="text-[7.5px] text-emerald-500 font-bold mt-0.5 whitespace-nowrap">{keyStatuses[key.key_value.trim()]?.creditText}</span>
                                              )}
                                            </div>
                                          )}
                                          {keyStatuses[key.key_value.trim()]?.status === 'inactive' && (
                                            <span 
                                              title={keyStatuses[key.key_value.trim()]?.error}
                                              className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded text-[8px] font-bold cursor-help"
                                            >
                                              🔴 Lỗi
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center space-x-2.5">
                                        <button
                                          onClick={() => handleToggleSearchKeyStatus(keyIdx)}
                                          className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border cursor-pointer ${key.status === 1
                                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                              : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                            }`}
                                        >
                                          {key.status === 1 ? 'BẬT' : 'TẮT'}
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSearchKey(keyIdx, key.id)}
                                          className="bg-[#151E2E] hover:bg-rose-950 border border-card-border hover:border-rose-800 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex gap-2 pt-2">
                              <input
                                type="password"
                                value={newSearchKeys[provider.provider_name] || ''}
                                onChange={(e) => setNewSearchKeys(prev => ({ ...prev, [provider.provider_name]: e.target.value }))}
                                placeholder={`Nhập API Key mới cho ${provider.provider_name}...`}
                                className="flex-1 bg-[#0d1527] border border-card-border/60 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                              />
                              <button
                                onClick={() => handleAddSearchKey(provider.provider_name)}
                                disabled={!(newSearchKeys[provider.provider_name] || '').trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:opacity-50 text-white text-[10px] font-black px-3.5 py-1.5 rounded-xl transition-all"
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

                {/* SAVE CONFIG FOOTER */}
                <div className="flex items-center justify-between pt-4 border-t border-card-border/30">
                  <p className="text-[10px] text-gray-500 italic max-w-md">
                    Lưu ý: Bấm nút "Lưu Cấu Hình" bên phải để áp dụng chính thức toàn bộ thay đổi vào SQLite.
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
              </div>
            )}

            {/* TAB 2: TEAMS MANAGEMENT */}
            {activeTab === 'teams' && (
              <div className="space-y-6 animate-fade-in">
                {/* Lọc & Tìm kiếm */}
                <div className="glass-panel border border-card-border/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-auto flex flex-1 max-w-md gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm kiếm đội tuyển (Ví dụ: Mexico, Brazil...)"
                      className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-secondary/70 transition-colors"
                    />
                  </div>

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    <span className="text-[10px] text-gray-550 font-bold uppercase whitespace-nowrap">Bảng đấu:</span>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="bg-[#0d1527] border border-card-border/70 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-secondary/70 cursor-pointer"
                    >
                      {['All', 'Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F', 'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'].map(g => (
                        <option key={g} value={g}>{g === 'All' ? 'Tất cả bảng' : g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Danh sách Teams Grid */}
                {teams.filter(t => {
                  const matchesSearch = t.team_name.toLowerCase().includes(searchQuery.toLowerCase());
                  const groupOfTeam = getTeamGroup(t.team_name);
                  const matchesGroup = selectedGroup === 'All' || groupOfTeam === selectedGroup;
                  return matchesSearch && matchesGroup;
                }).length === 0 ? (
                  <div className="text-center py-16 bg-card-border/10 rounded-2xl border border-dashed border-card-border/30">
                    <p className="text-xs text-gray-500">Không tìm thấy đội tuyển nào phù hợp với bộ lọc.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teams
                      .filter(t => {
                        const matchesSearch = t.team_name.toLowerCase().includes(searchQuery.toLowerCase());
                        const groupOfTeam = getTeamGroup(t.team_name);
                        const matchesGroup = selectedGroup === 'All' || groupOfTeam === selectedGroup;
                        return matchesSearch && matchesGroup;
                      })
                      .map(team => {
                        const group = getTeamGroup(team.team_name);
                        return (
                          <div
                            key={team.id}
                            className="glass-panel border border-card-border/60 hover:border-secondary/40 rounded-2xl p-5 hover:shadow-xl transition-all duration-350 flex flex-col justify-between"
                          >
                            <div className="space-y-4">
                              {/* Card Header */}
                              <div className="flex items-center justify-between border-b border-card-border/30 pb-3">
                                <div className="flex items-center space-x-3">
                                  {getTeamFlag(team.team_name, "w-8.5 h-6 rounded-md shadow border border-card-border/60")}
                                  <div>
                                    <h3 className="text-sm font-black text-white hover:text-secondary transition-colors leading-tight">{team.team_name}</h3>
                                    <span className="text-[9px] text-gray-500 font-medium">Cập nhật: {new Date(team.last_updated).toLocaleDateString('vi-VN')}</span>
                                  </div>
                                </div>
                                <span className="text-[9px] bg-secondary/15 text-secondary border border-secondary/25 px-2.5 py-0.5 rounded-full font-bold uppercase">
                                  {group}
                                </span>
                              </div>

                              {/* Stats row */}
                              <div className="grid grid-cols-2 gap-3 bg-card-border/15 p-3 rounded-xl border border-card-border/30 text-xs">
                                <div>
                                  <p className="text-[9px] text-gray-500 font-bold uppercase">FIFA Rank</p>
                                  <p className="text-xs font-black text-white font-mono mt-0.5">#{team.fifa_rank || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-500 font-bold uppercase">ELO Rating</p>
                                  <p className="text-xs font-black text-yellow-400 font-mono mt-0.5">{team.elo_rating || 'N/A'}</p>
                                </div>
                                <div className="border-t border-card-border/20 pt-2 col-span-2 flex justify-between">
                                  <div>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase block">Bàn thắng 10 Trận</span>
                                    <span className="text-xs font-black text-gray-300 font-mono">{team.avg_goals_scored ?? '0.0'}/trận</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase block">Bàn thua 10 Trận</span>
                                    <span className="text-xs font-black text-gray-300 font-mono">{team.avg_goals_conceded ?? '0.0'}/trận</span>
                                  </div>
                                </div>
                              </div>

                              {/* Details */}
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500 font-bold uppercase">Phong độ 5 trận:</span>
                                  {renderFormBadge(team.recent_form)}
                                </div>
                                {team.key_players && (
                                  <div className="text-[11px]">
                                    <span className="text-[10px] text-gray-500 font-bold uppercase block">Ngôi sao:</span>
                                    <p className="text-gray-300 truncate mt-0.5 font-medium">{team.key_players}</p>
                                  </div>
                                )}
                                {team.tactical_analysis && (
                                  <div className="text-[11px]">
                                    <span className="text-[10px] text-gray-500 font-bold uppercase block">Chiến thuật AI:</span>
                                    <p className="text-gray-400 line-clamp-2 mt-0.5 italic">{team.tactical_analysis}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Button */}
                            <div className="border-t border-card-border/20 pt-3.5 mt-3.5">
                              <button
                                onClick={() => handleEditTeamClick(team)}
                                className="w-full bg-[#10192e] hover:bg-secondary/15 border border-card-border hover:border-secondary/40 text-gray-300 hover:text-secondary text-[11px] font-extrabold py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                              >
                                <span>✏️</span>
                                <span>Chỉnh Sửa Chỉ Số</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PROMPTS MANAGEMENT */}
            {activeTab === 'prompts' && (
              <div className="space-y-6 animate-fade-in">
                <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-6">
                  <div className="border-b border-card-border/50 pb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span className="text-indigo-400">📝</span>
                      <span>Quản Lý Prompt AI Động</span>
                    </h2>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold">
                      {prompts.length} Templates
                    </span>
                  </div>

                  {/* Chọn Prompt */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="space-y-1 w-full sm:w-auto">
                      <label className="text-[10px] text-gray-400 font-black uppercase">Chọn mẫu Prompt cần chỉnh sửa:</label>
                      <select
                        value={selectedPromptKey}
                        onChange={(e) => setSelectedPromptKey(e.target.value)}
                        className="w-full sm:w-72 bg-[#0d1527] border border-card-border/70 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
                      >
                        {prompts.map(p => (
                          <option key={p.prompt_key} value={p.prompt_key}>
                            {p.prompt_key === 'predict_system'
                              ? '🤖 Mẫu Prompt Hệ Thống (Chính)'
                              : p.prompt_key === 'predict_rag_template'
                                ? '🔍 Mẫu Template RAG Search'
                                : p.prompt_key === 'predict_critic_template'
                                  ? '⚖️ Mẫu Prompt Phản Biện (Option 3)'
                                  : '🔁 Mẫu Template Feedback Loop'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Hiển thị ngày cập nhật gần nhất */}
                    {prompts.find(p => p.prompt_key === selectedPromptKey) && (
                      <div className="text-[10px] text-gray-500 font-medium">
                        Cập nhật cuối: {new Date(prompts.find(p => p.prompt_key === selectedPromptKey).last_updated).toLocaleString('vi-VN')}
                      </div>
                    )}
                  </div>

                  {/* Mô tả */}
                  <div className="bg-[#0f172a] border border-card-border/30 rounded-xl p-3.5 text-xs text-gray-400">
                    <span className="font-bold text-indigo-400 block mb-0.5">Mô tả mục đích:</span>
                    {prompts.find(p => p.prompt_key === selectedPromptKey)?.description || 'Chưa có mô tả.'}
                  </div>

                  {/* Textarea edit */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-gray-400 font-black uppercase">Nội dung mẫu prompt:</label>
                      <span className="text-[9px] text-gray-550 font-bold">Monospace Editor</span>
                    </div>
                    {loadingPrompts ? (
                      <div className="w-full h-80 bg-[#070b14] border border-card-border/70 rounded-xl flex items-center justify-center">
                        <span className="animate-spin text-lg">⏳</span>
                      </div>
                    ) : (
                      <textarea
                        value={editPromptContent}
                        onChange={(e) => setEditPromptContent(e.target.value)}
                        rows={16}
                        className="w-full bg-[#070b14] border border-card-border/70 rounded-xl p-4 text-xs font-mono text-gray-300 focus:outline-none focus:border-indigo-400 resize-y custom-scrollbar leading-relaxed"
                        placeholder="Nhập nội dung template prompt..."
                      ></textarea>
                    )}
                  </div>

                  {/* Placeholders gợi ý */}
                  <div className="border border-card-border/35 bg-card-border/10 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Các Placeholder có sẵn (Tự động thay thế khi chạy):</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-[10px]">
                      {selectedPromptKey === 'predict_system' && (
                        <>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{homeTeam}}"}</code>: Tên Đội Nhà</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{awayTeam}}"}</code>: Tên Đội Khách</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{homeStats}}"}</code>: Stats ELO/Rank Đội Nhà</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{awayStats}}"}</code>: Stats ELO/Rank Đội Khách</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{poissonMonteCarlo}}"}</code>: Mô phỏng Monte Carlo</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{feedbackSection}}"}</code>: Phần so sánh lịch sử dự đoán</div>
                        </>
                      )}
                      {selectedPromptKey === 'predict_rag_template' && (
                        <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{searchContext}}"}</code>: Nội dung tìm kiếm Internet thực tế</div>
                      )}
                      {selectedPromptKey === 'predict_feedback_template' && (
                        <>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{historyTexts}}"}</code>: Chi tiết các trận dự đoán trước</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{rate}}"}</code>: Tỷ lệ đoán đúng 1X2 (%)</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{correct}}"}</code>: Số trận đoán trúng</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{total}}"}</code>: Tổng số trận đã dự đoán</div>
                        </>
                      )}
                      {selectedPromptKey === 'predict_critic_template' && (
                        <>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{homeTeam}}"}</code>: Tên Đội Nhà</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{awayTeam}}"}</code>: Tên Đội Khách</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{draftPrediction}}"}</code>: Bản nháp dự đoán (JSON)</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{poissonMonteCarlo}}"}</code>: Mô phỏng Monte Carlo</div>
                          <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-card-border/30">{"{{searchContext}}"}</code>: Dữ liệu RAG Search</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Footer buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-card-border/30 gap-4">
                    <button
                      onClick={handleResetPrompt}
                      className="bg-[#10192e] hover:bg-rose-955/20 border border-card-border hover:border-rose-900/50 text-gray-300 hover:text-rose-400 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
                    >
                      🔄 Khôi Phục Mặc Định
                    </button>
                    <button
                      onClick={handleSavePrompt}
                      disabled={savingPrompt || loadingPrompts}
                      className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 flex items-center space-x-2 cursor-pointer active:scale-95"
                    >
                      {savingPrompt ? (
                        <>
                          <span className="animate-spin inline-block">🔄</span>
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          <span>Lưu Thay Đổi</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- EDIT TEAM MODAL GLASSMORPHISM --- */}
        {editModalOpen && selectedTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-scale-up">
            <div className="glass-panel border border-card-border/80 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="bg-[#0f172a] border-b border-card-border/50 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getTeamFlag(editFormData.team_name, "w-8 h-5.5 rounded")}
                  <div>
                    <h3 className="text-sm font-black text-white">Chỉnh Sửa Đội Tuyển</h3>
                    <p className="text-[10px] text-gray-550 font-medium">Cập nhật chỉ số thực lực cho {editFormData.team_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="text-gray-500 hover:text-white text-base cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveTeam}>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {/* Row 1: FIFA Rank & ELO */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-black uppercase">FIFA Ranking</label>
                      <input
                        type="number"
                        name="fifa_rank"
                        value={editFormData.fifa_rank}
                        onChange={handleTeamFormChange}
                        placeholder="Ví dụ: 15"
                        required
                        min="1"
                        className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-black uppercase">ELO Rating</label>
                      <input
                        type="number"
                        name="elo_rating"
                        value={editFormData.elo_rating}
                        onChange={handleTeamFormChange}
                        placeholder="Ví dụ: 1800"
                        required
                        min="500"
                        className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                      />
                    </div>
                  </div>

                  {/* Row 2: Goals */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-black uppercase">Bàn thắng TB (10 Trận)</label>
                      <input
                        type="number"
                        step="0.1"
                        name="avg_goals_scored"
                        value={editFormData.avg_goals_scored}
                        onChange={handleTeamFormChange}
                        placeholder="Ví dụ: 1.8"
                        required
                        min="0"
                        className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-black uppercase">Bàn thua TB (10 Trận)</label>
                      <input
                        type="number"
                        step="0.1"
                        name="avg_goals_conceded"
                        value={editFormData.avg_goals_conceded}
                        onChange={handleTeamFormChange}
                        placeholder="Ví dụ: 1.1"
                        required
                        min="0"
                        className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                      />
                    </div>
                  </div>

                  {/* Row 3: Form */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-black uppercase flex justify-between">
                      <span>Phong độ gần đây (5 trận)</span>
                      <span className="text-[9px] text-gray-500 font-medium normal-case">Tách nhau bởi dấu phẩy (W,D,L)</span>
                    </label>
                    <input
                      type="text"
                      name="recent_form"
                      value={editFormData.recent_form}
                      onChange={handleTeamFormChange}
                      placeholder="Ví dụ: W,D,W,L,W"
                      required
                      pattern="^[WwDdLl](,[WwDdLl]){0,4}$"
                      className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono uppercase"
                    />
                  </div>

                  {/* Row 4: Key Players */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-black uppercase">Ngôi sao nổi bật</label>
                    <input
                      type="text"
                      name="key_players"
                      value={editFormData.key_players}
                      onChange={handleTeamFormChange}
                      placeholder="Ví dụ: Son Heung-min, Hwang Hee-chan"
                      className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60"
                    />
                  </div>

                  {/* Row 5: Tactics */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-black uppercase">Phân tích chiến thuật</label>
                    <textarea
                      name="tactical_analysis"
                      value={editFormData.tactical_analysis}
                      onChange={handleTeamFormChange}
                      rows="3"
                      placeholder="Mô tả ngắn gọn sơ đồ và cách tiếp cận trận đấu..."
                      className="w-full bg-[#0d1527] border border-card-border/70 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 resize-none font-sans"
                    ></textarea>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-[#0f172a] border-t border-card-border/50 p-4 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="bg-card-border/50 hover:bg-card-border border border-card-border text-gray-300 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-secondary hover:bg-secondary-hover text-white text-xs font-extrabold py-2 px-5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <span className="animate-spin inline-block">🔄</span>
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        <span>Lưu Thay Đổi</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
