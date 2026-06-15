'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getTeamFlag } from '@/lib/flags';
import { saveLastUsedModel } from '@/lib/models-client';
import { getVNTime } from '@/lib/timezone';
import MatchSimulator from './MatchSimulator';
import { renderMessageContent } from '@/lib/markdown';

function getPredictionStatus(predHome, predAway, actHome, actAway, predictType = 'full_time', actFirstHalfHome = null, actFirstHalfAway = null) {
  const isFirstHalf = predictType === 'first_half';
  const aHome = isFirstHalf ? actFirstHalfHome : actHome;
  const aAway = isFirstHalf ? actFirstHalfAway : actAway;

  if (aHome === null || aHome === undefined || aAway === null || aAway === undefined) {
    return { status: 'pending', text: 'Chờ', colorClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  }

  const pHome = parseInt(predHome, 10);
  const pAway = parseInt(predAway, 10);
  const compareHome = parseInt(aHome, 10);
  const compareAway = parseInt(aAway, 10);

  if (pHome === compareHome && pAway === compareAway) {
    return { status: 'correct', text: isFirstHalf ? 'Đúng H1' : 'Đúng', colorClass: 'bg-emerald-500/20 text-primary border border-primary/20 shadow-sm' };
  }

  const predDiff = pHome - pAway;
  const actDiff = compareHome - compareAway;
  const predOutcome = predDiff > 0 ? 1 : (predDiff < 0 ? -1 : 0);
  const actOutcome = actDiff > 0 ? 1 : (actDiff < 0 ? -1 : 0);

  if (predOutcome === actOutcome) {
    return { status: 'near', text: isFirstHalf ? 'Gần đúng H1' : 'Gần đúng', colorClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/20' };
  }

  return { status: 'incorrect', text: isFirstHalf ? 'Sai H1' : 'Sai', colorClass: 'bg-rose-500/20 text-rose-400 border-rose-500/20' };
}

function translateRecommendation(text) {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Dịch kèo 1X2
  if (lower === 'home') return 'Đội nhà';
  if (lower === 'away') return 'Đội khách';
  if (lower === 'draw') return 'Hòa';

  // Dịch BTTS
  if (lower === 'yes') return 'Có';
  if (lower === 'no') return 'Không';

  // Dịch Tài Xỉu / Phạt Góc / Thẻ Phạt (Over / Under)
  let translated = trimmed;
  translated = translated.replace(/over/gi, 'Tài');
  translated = translated.replace(/under/gi, 'Xỉu');
  translated = translated.replace(/corners/gi, 'Phạt góc');
  translated = translated.replace(/cards/gi, 'Thẻ phạt');

  return translated;
}



function formatModelName(model) {
  if (!model) return 'Gemini';
  const name = model.trim();

  if (name.includes('gemini-3.1-flash-lite') || name.includes('gemini-2.5-flash-lite')) {
    return 'Gemini 3.1 Flash Lite';
  }
  if (name.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (name.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (name.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
  if (name.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';

  let formatted = name.replace(/-/g, ' ');
  formatted = formatted.replace(/gemini/gi, 'Gemini');
  formatted = formatted.replace(/flash/gi, 'Flash');
  formatted = formatted.replace(/pro/gi, 'Pro');
  formatted = formatted.replace(/lite/gi, 'Lite');
  return formatted;
}

function normalizeChatImages(imageSource) {
  if (!imageSource) return [];

  if (Array.isArray(imageSource)) {
    return imageSource.filter(Boolean);
  }

  if (typeof imageSource !== 'string') return [];

  const trimmed = imageSource.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      console.error('Lỗi parse danh sách ảnh chat:', error);
      return [];
    }
  }

  return [trimmed];
}

function normalizeChatMessage(message) {
  const imageSource = message.imageUrls ?? message.imageUrl ?? message.image_url ?? message.image ?? null;

  return {
    sender: message.sender,
    message: message.message || '',
    modelUsed: message.modelUsed || message.model_used || null,
    imageUrls: normalizeChatImages(imageSource),
    createdAt: message.createdAt || message.created_at || null
  };
}

export default function MatchClient({ match, activeModelSupportsImage }) {
  const [localMatch, setLocalMatch] = useState(match);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeTab, setActiveTab] = useState('analysis');

  // States cho Chat AI Persistent
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const hasInitialScrolled = useRef(false);

  // States hỗ trợ đính kèm hình ảnh đa phương thức (Hỗ trợ 1-10 ảnh, tự động nén canvas để tối ưu payload)
  const [imagePreviews, setImagePreviews] = useState([]);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const fileInputRef = useRef(null);

  const resizeAndCompressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max_size = 800; // Giới hạn kích thước tối đa 800px

          if (width > height) {
            if (width > max_size) {
              height *= max_size / width;
              width = max_size;
            }
          } else {
            if (height > max_size) {
              width *= max_size / height;
              height = max_size;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Nén chất lượng JPEG 0.7
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentCount = imagePreviews.length;
    if (currentCount >= 10) {
      alert('Chỉ cho phép tải lên tối đa 10 ảnh');
      return;
    }

    let filesToAdd = files;
    if (currentCount + files.length > 10) {
      alert('Hệ thống giới hạn tối đa 10 ảnh đính kèm. Chỉ nạp 10 ảnh đầu tiên.');
      filesToAdd = files.slice(0, 10 - currentCount);
    }

    const compressedResults = [];
    for (const file of filesToAdd) {
      try {
        const compressedBase64 = await resizeAndCompressImage(file);
        compressedResults.push(compressedBase64);
      } catch (err) {
        console.error('Lỗi khi nén ảnh:', err);
      }
    }

    setImagePreviews(prev => [...prev, ...compressedResults]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index) => {
    setImagePreviews(prev => prev.filter((_, idx) => idx !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInputPaste = async (e) => {
    if (!activeModelSupportsImage) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          imageItems.push(file);
        }
      }
    }

    if (imageItems.length === 0) return;

    const currentCount = imagePreviews.length;
    if (currentCount >= 10) {
      alert('Chỉ cho phép tải lên tối đa 10 ảnh');
      e.preventDefault();
      return;
    }

    let filesToAdd = imageItems;
    if (currentCount + imageItems.length > 10) {
      alert('Hệ thống giới hạn tối đa 10 ảnh đính kèm. Chỉ nạp 10 ảnh đầu tiên.');
      filesToAdd = imageItems.slice(0, 10 - currentCount);
    }

    const compressedResults = [];
    for (const file of filesToAdd) {
      try {
        const compressedBase64 = await resizeAndCompressImage(file);
        compressedResults.push(compressedBase64);
      } catch (err) {
        console.error('Lỗi khi nén ảnh paste:', err);
      }
    }

    setImagePreviews(prev => [...prev, ...compressedResults]);
    e.preventDefault();
  };

  // States cho Form cập nhật kết quả thực tế
  const [resMessage, setResMessage] = useState(null);
  const [updatingAuto, setUpdatingAuto] = useState(false);

  // States cho pham vi du doan
  const [predictType, setPredictType] = useState('full_time');
  const [firstHalfHomeScore, setFirstHalfHomeScore] = useState('');
  const [firstHalfAwayScore, setFirstHalfAwayScore] = useState('');

  const suggestedQuestions = [
    `Đánh giá 2 kèo này so với nhận định, nên vào kèo nào?`,
    `So sánh 2 kèo này với nhận định, ưu tiên kèo nào hơn?`,
    `Tư vấn kèo chấp ${match.homeTeam} vs ${match.awayTeam}`,
    `Phân tích kèo tài xỉu ${prediction?.ou_line ?? 2.5} trận này`,
    `Nhận định phạt góc và thẻ phạt`,
    `Dự đoán tỷ số chính xác nhất`
  ];

  const loadingSteps = [
    'Đang kết nối tới mô hình AI Google Gemini...',
    'Kích hoạt tính năng Google Search Grounding để quét mạng...',
    'Đang tìm kiếm thông tin chấn thương, đội hình và phong độ mới nhất...',
    'Tính toán xác suất kèo châu Á, tài xỉu, tỷ số và tổng hợp nhận định...'
  ];

  // Rotate loading steps
  useEffect(() => {
    if (!loading && !predicting) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 2000);
    return () => clearInterval(interval);
  }, [loading, predicting]);

  // Đồng bộ tiêu đề trang trên client
  useEffect(() => {
    if (match) {
      document.title = `${match.homeTeam} vs ${match.awayTeam} - Dự đoán trận đấu`;
    }
  }, [match]);

  // Đồng bộ localMatch khi prop match thay đổi
  useEffect(() => {
    setLocalMatch(match);
  }, [match]);

  const scrollChatToLatestUserMessage = (behavior = 'auto', delay = 0) => {
    if (activeTab !== 'chat') return undefined;
    if (!chatContainerRef.current) return undefined;

    const runScroll = () => {
      const container = chatContainerRef.current;
      if (!container) return;
      const userMessages = container.querySelectorAll('[data-sender="user"]');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        lastUserMessage.scrollIntoView({ behavior, block: 'end' });
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }
    };

    if (delay > 0) {
      const timer = setTimeout(runScroll, delay);
      return () => clearTimeout(timer);
    }

    const frame = requestAnimationFrame(runScroll);
    return () => cancelAnimationFrame(frame);
  };

  const fetchChatHistory = async () => {
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/match/chat?matchId=${match.id}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages((data.messages || []).map(normalizeChatMessage));
      }
    } catch (err) {
      console.error('Lỗi tải lịch sử chat:', err);
    } finally {
      setLoadingChat(false);
    }
  };

  // Chỉ tự động cuộn xuống dưới cùng khi tab chat đã visible và dữ liệu đã sẵn sàng
  useEffect(() => {
    if (activeTab !== 'chat') return undefined;
    if (chatMessages.length === 0 || loadingChat || hasInitialScrolled.current) return undefined;

    const cleanupFrame = scrollChatToLatestUserMessage('auto', 0);
    const cleanupDelay = scrollChatToLatestUserMessage('auto', 180);
    const markTimer = setTimeout(() => {
      hasInitialScrolled.current = true;
    }, 220);

    return () => {
      if (typeof cleanupFrame === 'function') cleanupFrame();
      if (typeof cleanupDelay === 'function') cleanupDelay();
      clearTimeout(markTimer);
    };
  }, [activeTab, chatMessages, loadingChat]);

  useEffect(() => {
    if (activeTab !== 'chat' || chatMessages.length === 0 || loadingChat) return undefined;

    const cleanup = scrollChatToLatestUserMessage('auto', 120);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [activeTab]);

  useEffect(() => {
    if (sendingChat && activeTab === 'chat') {
      const cleanup = scrollChatToLatestUserMessage('smooth', 80);
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
    return undefined;
  }, [sendingChat, activeTab, chatMessages.length]);

  // Load history when match changes or on mount
  useEffect(() => {
    let active = true;

    const initAndLoad = async () => {
      hasInitialScrolled.current = false;
      setLoading(true);
      setError(null);
      setPrediction(null);
      setHistoryList([]);
      setResMessage(null);
      setChatMessages([]);
      await fetchChatHistory();

      try {
        const res = await fetch(`/api/history?matchId=${match.id}`);
        if (!res.ok) throw new Error('Không thể tải lịch sử dự đoán');
        const data = await res.json();

        if (!active) return;

        if (data.history && data.history.length > 0) {
          setHistoryList(data.history);
          setPrediction(data.history[0]);
          saveLastUsedModel(data.history[0].modelUsed || data.history[0].model_used);
          setLoading(false);
        } else {
          // Tự động kích hoạt dự đoán mới nếu chưa có lịch sử
          await handleRunNewPrediction();
        }
      } catch (err) {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      }
    };

    initAndLoad();

    return () => {
      active = false;
    };
  }, [match.id]);

  const sendMessageToAI = async (messageText, base64Images = []) => {
    if (!messageText.trim() && (!base64Images || base64Images.length === 0)) return;
    if (sendingChat) return;

    const tempUserMsg = normalizeChatMessage({
      sender: 'user',
      message: messageText,
      imageUrls: base64Images,
      createdAt: new Date().toISOString()
    });
    setChatMessages(prev => [...prev, tempUserMsg]);
    setSendingChat(true);

    try {
      const res = await fetch('/api/match/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          message: messageText,
          images: base64Images
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const historyRes = await fetch(`/api/match/chat?matchId=${match.id}`);
        if (historyRes.ok) {
          const histData = await historyRes.json();
          setChatMessages((histData.messages || []).map(normalizeChatMessage));
        }
      } else {
        throw new Error(data.error || 'Gửi tin nhắn thất bại');
      }
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, normalizeChatMessage({ sender: 'ai', message: `❌ Lỗi: ${err.message || 'Không thể kết nối đến máy chủ AI.'}`, createdAt: new Date().toISOString() })]);
    } finally {
      setSendingChat(false);
    }
  };


  const handleSendChat = async (e) => {
    e.preventDefault();
    if ((!chatInput.trim() && imagePreviews.length === 0) || sendingChat) return;

    const userMsgText = chatInput.trim();
    const currentImgs = [...imagePreviews];
    setChatInput('');
    setImagePreviews([]);
    await sendMessageToAI(userMsgText, currentImgs);
  };

  const handleSuggestedQuestionClick = async (question) => {
    const currentImgs = [...imagePreviews];
    setImagePreviews([]);
    await sendMessageToAI(question, currentImgs);
  };

  const handleRunNewPrediction = async () => {
    const currentMatchId = match.id;
    setPredicting(true);
    setResMessage(null);
    setError(null); // Xóa lỗi cũ trước khi chạy dự đoán mới
    setLoadingStep(0);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchId: currentMatchId,
          forceRefresh: true,
          predictType,
          firstHalfHomeScore: predictType === 'second_half' ? parseInt(firstHalfHomeScore || 0, 10) : null,
          firstHalfAwayScore: predictType === 'second_half' ? parseInt(firstHalfAwayScore || 0, 10) : null
        })
      });

      if (!res.ok) {
        throw new Error('Lỗi khi chạy dự đoán AI');
      }

      const newPred = await res.json();

      // Nếu người dùng đã chuyển sang trận đấu khác, bỏ qua cập nhật state
      if (match.id !== currentMatchId) return;

      setPrediction(newPred);
      saveLastUsedModel(newPred.modelUsed);

      // Tải lại lịch sử sau khi dự đoán thành công
      const histRes = await fetch(`/api/history?matchId=${currentMatchId}`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (match.id === currentMatchId) {
          setHistoryList(histData.history);
        }
      }
    } catch (err) {
      if (match.id === currentMatchId) {
        setError(err.message);
      }
    } finally {
      if (match.id === currentMatchId) {
        setPredicting(false);
        setLoading(false);
      }
    }
  };

  const handleAutoUpdateResult = async () => {
    // Nếu trận đấu đã có kết quả thực tế, mặc định Force Update
    let isForce = false;
    const hasResult = (match.actualHomeScore !== null && match.actualHomeScore !== undefined) ||
      (prediction && prediction.actual_home_score !== null && prediction.actual_home_score !== undefined);

    if (hasResult) {
      isForce = true;
    }

    setUpdatingAuto(true);
    setResMessage(null);
    try {
      const res = await fetch('/api/results/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchId: match.id,
          force: isForce
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tự động lấy kết quả');

      if (data.success) {
        setResMessage({
          success: true,
          text: `🤖 Tự động cập nhật thành công! Trận đấu kết thúc với tỷ số thực tế: ${data.actualScore.home}-${data.actualScore.away}. ${data.summary || ''}`
        });

        // Cập nhật localMatch tức thì trên Client
        setLocalMatch(prev => ({
          ...prev,
          actualHomeScore: data.actualScore.home,
          actualAwayScore: data.actualScore.away,
          actualFirstHalfScore: data.actualFirstHalfScore ? {
            home: data.actualFirstHalfScore.home,
            away: data.actualFirstHalfScore.away
          } : prev.actualFirstHalfScore,
          matchTimeline: data.matchTimeline || prev.matchTimeline
        }));

        // Tải lại lịch sử để cập nhật UI
        const histRes = await fetch(`/api/history?matchId=${match.id}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistoryList(histData.history);
          const updatedPred = histData.history.find(h => h.id === prediction.id);
          if (updatedPred) setPrediction(updatedPred);
        }
      } else {
        setResMessage({
          success: false,
          text: `⚠️ Trạng thái: ${data.message || 'Không tìm thấy kết quả trực tuyến.'}`
        });
      }
    } catch (err) {
      setResMessage({ success: false, text: err.message });
    } finally {
      setUpdatingAuto(false);
    }
  };

  const formatDate = (dateStr) => {
    try {
      if (!dateStr) return '';
      // SQLite trả về định dạng UTC 'YYYY-MM-DD HH:MM:SS', chuyển thành ISO format có đuôi Z
      let normalizedStr = dateStr;
      if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) {
        normalizedStr = dateStr.replace(' ', 'T') + 'Z';
      }
      const d = new Date(normalizedStr);
      // Định dạng sang giờ Việt Nam (GMT+7)
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen py-5 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14] px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">

        {/* Navigation back */}
        <div className="mb-4">
          <Link href="/" className="text-gray-405 hover:text-primary transition-colors text-xs flex items-center space-x-1">
            <span>← Quay lại danh sách trận đấu</span>
          </Link>
        </div>

        {/* Match Header Card */}
        <div className="glass-panel rounded-2xl p-4 mb-4 border border-card-border overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="text-center text-[10px] text-gray-500 font-semibold mb-3 flex items-center justify-center space-x-2">
            <span className="bg-card-border px-2.5 py-0.5 rounded-full uppercase tracking-wider">{match.group}</span>
            <span>•</span>
            <span>{getVNTime(match.date, match.time, match.venue).formatted} (Giờ VN) • {match.time} {match.date} (Giờ địa phương)</span>
          </div>

          <div className="flex flex-row items-center justify-between px-1 sm:px-8">
            {/* Home Team */}
            <div className="flex flex-col sm:flex-row items-center sm:space-x-3 w-5/12 justify-center sm:justify-end space-y-1 sm:space-y-0">
              <span className="font-extrabold text-xs sm:text-base text-white text-center sm:text-right order-2 sm:order-1">{match.homeTeam}</span>
              <div className="order-1 sm:order-2">
                {getTeamFlag(match.homeTeam, "w-8 h-5.5 sm:w-12 sm:h-8.5 object-cover")}
              </div>
            </div>

            {/* VS */}
            <div className="w-2/12 flex justify-center">
              <span className="text-[9px] sm:text-[10px] font-black text-gray-600 tracking-wider border border-card-border/60 bg-[#0B0F17] px-2 sm:px-2.5 py-0.5 rounded-full glow-green">
                VS
              </span>
            </div>

            {/* Away Team */}
            <div className="flex flex-col sm:flex-row items-center sm:space-x-3 w-5/12 justify-center sm:justify-start space-y-1 sm:space-y-0">
              <div className="order-1">
                {getTeamFlag(match.awayTeam, "w-8 h-5.5 sm:w-12 sm:h-8.5 object-cover")}
              </div>
              <span className="font-extrabold text-xs sm:text-base text-white text-center sm:text-left order-2">{match.awayTeam}</span>
            </div>
          </div>

          <div className="text-center mt-3 pt-3 border-t border-card-border/30 text-[10px] text-gray-500 flex items-center justify-center space-x-1">
            <span>📍 Sân:</span>
            <span className="text-gray-300 font-semibold">{match.venue}</span>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && !prediction && (
          <div className="glass-panel rounded-2xl p-8 text-center border border-card-border flex flex-col items-center justify-center min-h-[250px]">
            <div className="h-10 w-10 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-3 border-card-border border-t-primary animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl animate-bounce">⚽</span>
            </div>
            <h3 className="text-white font-bold text-sm mb-1">Đang phân tích trận đấu...</h3>
            <p className="text-primary text-xs font-semibold max-w-sm h-8 flex items-center justify-center">
              {loadingSteps[loadingStep]}
            </p>
          </div>
        )}

        {/* NEW PREDICTION PROGRESS (INITIAL ONLY) */}
        {predicting && !prediction && (
          <div className="glass-panel rounded-2xl p-8 text-center border border-card-border/80 flex flex-col items-center justify-center min-h-[250px] mb-4">
            <div className="h-10 w-10 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-3 border-card-border border-t-secondary animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl animate-bounce">🧠</span>
            </div>
            <h3 className="text-white font-bold text-sm mb-1">Đang chạy dự đoán mới...</h3>
            <p className="text-secondary text-xs font-semibold max-w-sm h-8 flex items-center justify-center">
              Quét mạng xã hội & tin tức thể thao thông qua Google Search Grounding...
            </p>
          </div>
        )}

        {/* ERROR STATE (INITIAL ONLY) */}
        {error && !prediction && (
          <div className="glass-panel rounded-2xl p-6 text-center border border-red-500/30 bg-red-950/10 mb-4">
            <span className="text-3xl block mb-2">❌</span>
            <h3 className="text-red-400 font-bold text-sm mb-1">Đã xảy ra lỗi khi lấy nhận định</h3>
            <p className="text-gray-400 text-xs mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetch(`/api/history?matchId=${match.id}`)
                  .then(res => {
                    if (!res.ok) throw new Error('Không thể tải lịch sử');
                    return res.json();
                  })
                  .then(data => {
                    if (data.history && data.history.length > 0) {
                      setHistoryList(data.history);
                      setPrediction(data.history[0]);
                      setLoading(false);
                    } else {
                      handleRunNewPrediction();
                    }
                  })
                  .catch(err => {
                    setError(err.message);
                    setLoading(false);
                  });
              }}
              className="bg-card-border hover:bg-card-border/80 border border-card-border text-white font-bold py-1.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* PREDICTION CONTENT (LOADED) */}
        {prediction && (
          <div className="space-y-4">

            {/* Tab Bar - Sticky, nằm dưới header desktop (z-50) và mobile floats (z-50) */}
            <div className="sticky top-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md flex border-b border-card-border/40 mb-4 overflow-x-auto whitespace-nowrap scrollbar-none -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              {[
                { id: 'analysis', label: 'Nhận định', icon: '🧠' },
                { id: 'simulator', label: 'Mô phỏng', icon: '🎮' },
                { id: 'bets', label: 'Soi kèo', icon: '📊' },
                { id: 'chat', label: 'Trợ lý soi kèo', icon: '💬' }
              ].map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-3.5 sm:px-5 text-xs font-bold transition-all relative border-b-2 whitespace-nowrap cursor-pointer ${isActive
                        ? 'text-white border-primary font-black'
                        : 'text-gray-400 border-transparent hover:text-gray-200'
                      }`}
                  >
                    <span>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="inline sm:hidden text-sm" title={tab.label}>{tab.icon}</span>
                    </span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 w-full h-[2px] bg-primary shadow-[0_0_10px_#10B981] animate-pulse"></span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inline Notifications (Error / Progress) */}
            {error && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-400 leading-relaxed flex items-center justify-between animate-fade-in shadow-lg">
                <span className="flex items-center space-x-1.5">
                  <span>🔴</span>
                  <span><strong>Yêu cầu dự đoán mới thất bại:</strong> {error}</span>
                </span>
                <button
                  onClick={() => setError(null)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-0.5 rounded border border-card-border/60 hover:bg-card-border/20 text-[10px] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            )}

            {predicting && (
              <div className="p-3 rounded-xl border border-secondary/30 bg-secondary/5 text-[11px] text-secondary leading-relaxed flex items-center space-x-2 animate-pulse shadow-lg">
                <span>🧠</span>
                <div>
                  <strong>Tiến trình AI:</strong>{' '}
                  <span className="text-gray-300">{loadingSteps[loadingStep]}</span>
                </div>
              </div>
            )}

            {/* Tab: Mô phỏng */}
            <div className={`animate-fade-in ${activeTab === 'simulator' ? '' : 'hidden'}`}>
              <MatchSimulator match={localMatch} isActive={activeTab === 'simulator'} />
            </div>

            {/* Tab: Nhận định */}
            {activeTab === 'analysis' && (
              <div id="prediction-section" className="space-y-4 animate-fade-in" style={{ scrollMarginTop: '56px' }}>

                {/* Context Feedback Indicator Banner */}
                {prediction.historicalAccuracy && (
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 glow-green flex items-start space-x-2 text-[11px] text-primary leading-relaxed">
                    <span>🤖</span>
                    <div>
                      <p className="font-bold">Đã kích hoạt Học máy (In-Context Learning)</p>
                      <p className="text-gray-400 mt-0.5">
                        AI đã phân tích lịch sử <strong>{prediction.historicalAccuracy.total}</strong> lần dự đoán trước để giảm sai lệch. Tỷ lệ đoán trúng kết quả (1X2): <strong>{prediction.historicalAccuracy.rate}%</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Prediction Run selector & Run New Predict */}
                <div className="glass-panel rounded-xl p-4 border border-card-border space-y-4">
                  <div className="flex items-center justify-between border-b border-card-border/40 pb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Phiên Dự Đoán</span>
                      <span className="text-xs text-white font-semibold mt-0.5">ID: Lượt #{prediction.id}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${prediction.predict_type === 'first_half' || prediction.predictType === 'first_half'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : prediction.predict_type === 'second_half' || prediction.predictType === 'second_half'
                          ? 'bg-secondary/10 text-secondary border-secondary/20'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                      }`}>
                      {prediction.predict_type === 'first_half' || prediction.predictType === 'first_half' ? 'Hiệp 1' : (prediction.predict_type === 'second_half' || prediction.predictType === 'second_half' ? 'Hiệp 2' : 'Cả trận')}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phạm vi dự đoán</label>
                      <select
                        value={predictType}
                        onChange={(e) => setPredictType(e.target.value)}
                        className="bg-[#0B0F17] border border-card-border rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-primary cursor-pointer font-bold w-full"
                      >
                        <option value="full_time">Cả trận (Full Time)</option>
                        <option value="first_half">Hiệp 1 (First Half)</option>
                        <option value="second_half">Hiệp 2 (Second Half)</option>
                      </select>
                    </div>

                    {predictType === 'second_half' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tỷ số H1 - {match.homeTeam}</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={firstHalfHomeScore}
                            onChange={(e) => setFirstHalfHomeScore(e.target.value)}
                            className="bg-[#0B0F17] border border-card-border rounded-xl p-2 text-xs text-white focus:outline-none focus:border-primary text-center font-bold"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tỷ số H1 - {match.awayTeam}</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={firstHalfAwayScore}
                            onChange={(e) => setFirstHalfAwayScore(e.target.value)}
                            className="bg-[#0B0F17] border border-card-border rounded-xl p-2 text-xs text-white focus:outline-none focus:border-primary text-center font-bold"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleRunNewPrediction}
                      disabled={predicting}
                      className={`w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-2.5 px-4 rounded-xl text-xs tracking-wider transition-all duration-150 flex items-center justify-center space-x-1.5 shadow-md shadow-primary/10 ${predicting ? 'opacity-50 cursor-not-allowed scale-100' : 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                        }`}
                    >
                      {predicting ? (
                        <>
                          <span className="animate-spin inline-block">🔄</span>
                          <span>ĐANG DỰ ĐOÁN...</span>
                        </>
                      ) : (
                        <>
                          <span>🧠</span>
                          <span>DỰ ĐOÁN MỚI</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Win Probability & Score Card */}
                <div className="glass-panel rounded-xl p-4 border border-card-border glow-green relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider">Tỷ Số Dự Đoán & Xác Suất</h3>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${prediction.predict_type === 'first_half' || prediction.predictType === 'first_half'
                        ? 'bg-primary/20 text-primary border border-primary/20'
                        : prediction.predict_type === 'second_half' || prediction.predictType === 'second_half'
                          ? 'bg-secondary/20 text-secondary border border-secondary/20'
                          : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                      }`}>
                      {prediction.predict_type === 'first_half' || prediction.predictType === 'first_half' ? 'Hiệp 1 (H1)' : (prediction.predict_type === 'second_half' || prediction.predictType === 'second_half' ? 'Hiệp 2 (H2)' : 'Cả trận (FT)')}
                    </span>
                  </div>

                  <div className="flex items-center justify-center space-x-6 my-4">
                    <div className="flex flex-col items-center flex-1 max-w-[140px]">
                      <span className="text-[11px] sm:text-xs font-semibold text-gray-500 mb-1 text-center line-clamp-2 min-h-[32px] flex items-center justify-center">{match.homeTeam}</span>
                      <span className="text-3xl sm:text-4xl font-black text-white glow-green">{prediction.predicted_home_score ?? prediction.predictedScore?.home}</span>
                    </div>
                    <span className="text-xl font-bold text-card-border self-end mb-2">-</span>
                    <div className="flex flex-col items-center flex-1 max-w-[140px]">
                      <span className="text-[11px] sm:text-xs font-semibold text-gray-500 mb-1 text-center line-clamp-2 min-h-[32px] flex items-center justify-center">{match.awayTeam}</span>
                      <span className="text-3xl sm:text-4xl font-black text-white">{prediction.predicted_away_score ?? prediction.predictedScore?.away}</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {/* Read values safely supporting DB columns and API payload properties */}
                    {(() => {
                      const prob = {
                        home: prediction.win_prob_home ?? prediction.winProbability?.home ?? 33,
                        draw: prediction.win_prob_draw ?? prediction.winProbability?.draw ?? 34,
                        away: prediction.win_prob_away ?? prediction.winProbability?.away ?? 33
                      };
                      return (
                        <>
                          <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                            <span>{match.homeTeam} ({prob.home}%)</span>
                            <span>Hòa ({prob.draw}%)</span>
                            <span>{match.awayTeam} ({prob.away}%)</span>
                          </div>
                          <div className="h-3 w-full rounded-full overflow-hidden flex bg-card-border">
                            <div className="h-full bg-gradient-to-r from-primary to-primary/80" style={{ width: `${prob.home}%` }}></div>
                            <div className="h-full bg-gray-500" style={{ width: `${prob.draw}%` }}></div>
                            <div className="h-full bg-gradient-to-r from-secondary/80 to-secondary" style={{ width: `${prob.away}%` }}></div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Detailed AI Analysis */}
                <div className="glass-panel rounded-xl p-4 border border-card-border space-y-4">
                  <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-card-border/50">
                    Nhận Định Chiến Thuật & Lực Lượng
                  </h3>

                  {/* Model Info */}
                  {!prediction.isMock && (prediction.modelUsed || prediction.model_used) && (
                    <div className="text-[9px] text-gray-550 font-bold uppercase tracking-wider flex items-center space-x-1.5 bg-card-border/20 border border-card-border/40 py-0.5 px-3 rounded-full w-fit">
                      <span>MÔ HÌNH: {prediction.modelUsed || prediction.model_used || 'gemini-2.5-flash'}</span>
                    </div>
                  )}

                  {/* Home/Away Analyses */}
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                      {getTeamFlag(match.homeTeam, "w-5 h-3.5")}
                      <span>Phân tích tuyển {match.homeTeam}:</span>
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.homeTeam || prediction.home_team_analysis || 'Đội tuyển sở hữu lối chơi đồng đều, tuyến tiền vệ tổ chức tốt.'}</p>
                  </div>

                  <div className="space-y-1 pt-1.5">
                    <h4 className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                      {getTeamFlag(match.awayTeam, "w-5 h-3.5")}
                      <span>Phân tích tuyển {match.awayTeam}:</span>
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.awayTeam || prediction.away_team_analysis || 'Đội hình có thiên hướng phòng ngự phản công kỷ luật cao.'}</p>
                  </div>

                  {/* Key Factors */}
                  {prediction.analysis?.keyFactors && (
                    <div className="space-y-1.5 pt-1.5">
                      <h4 className="font-extrabold text-xs text-white">Yếu tố quyết định trận đấu:</h4>
                      <ul className="space-y-1">
                        {prediction.analysis.keyFactors.map((factor, idx) => (
                          <li key={idx} className="flex items-start text-xs text-gray-300">
                            <span className="text-primary mr-1.5">✓</span>
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tactical reasoning */}
                  <div className="space-y-1.5 pt-1.5">
                    <h4 className="font-extrabold text-xs text-white">Lý giải chi tiết:</h4>
                    <div className="text-xs text-gray-300 leading-relaxed bg-card-border/10 border border-card-border/40 p-3 rounded-lg font-medium">
                      {renderMessageContent(prediction.analysis?.predictionReasoning || prediction.prediction_reasoning || 'AI đánh giá cao khả năng áp đặt lối chơi và ghi bàn đột biến của bên tấn công.')}
                    </div>
                  </div>
                </div>

                {/* Runs Comparison/History List */}
                {historyList.length > 0 && (
                  <div className="glass-panel rounded-xl p-4 border border-card-border">
                    <h3 className="text-gray-400 font-bold text-xs mb-3 uppercase tracking-wider flex items-center justify-between">
                      <span>Lịch sử các lần dự đoán</span>
                      <span className="text-[10px] text-gray-500 font-normal">Click để so sánh</span>
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {historyList.map((run, idx) => {
                        const isActive = run.id === prediction.id;
                        // Read score fields supporting database fields or nested API payload fields
                        const pHome = run.predicted_home_score ?? run.predictedScore?.home;
                        const pAway = run.predicted_away_score ?? run.predictedScore?.away;

                        const pType = run.predict_type || run.predictType || 'full_time';
                        const isFirstHalfType = pType === 'first_half';
                        const actH = isFirstHalfType ? (run.actual_first_half_home_score ?? run.actualFirstHalfHomeScore) : run.actual_home_score;
                        const actA = isFirstHalfType ? (run.actual_first_half_away_score ?? run.actualFirstHalfAwayScore) : run.actual_away_score;
                        const hasActualResult = actH !== null && actH !== undefined && actA !== null && actA !== undefined;

                        return (
                          <div
                            key={run.id}
                            onClick={() => {
                              setPrediction(run);
                              saveLastUsedModel(run.modelUsed || run.model_used);

                              // Phone: Tự động cuộn lên trên phiên dự đoán
                              if (typeof window !== 'undefined' && window.innerWidth < 640) {
                                const section = document.getElementById('prediction-section');
                                if (section) {
                                  try {
                                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  } catch (e) {
                                    section.scrollIntoView();
                                  }
                                }
                              }
                            }}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150 flex items-center justify-between ${isActive
                                ? 'border-primary bg-primary/5 text-white shadow-sm glow-green'
                                : 'border-card-border/60 hover:border-card-border bg-card-border/10 text-gray-400 hover:text-white'
                              }`}
                          >
                            <div className="flex flex-col space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold"># Lượt {historyList.length - idx}</span>
                                <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${pType === 'first_half'
                                    ? 'bg-primary/20 text-primary border border-primary/20'
                                    : pType === 'second_half'
                                      ? 'bg-secondary/20 text-secondary border border-secondary/20'
                                      : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                  }`}>
                                  {pType === 'first_half' ? 'H1' : (pType === 'second_half' ? 'H2' : 'FT')}
                                </span>
                              </div>
                              <span className="text-[9px] text-gray-500">{formatDate(run.created_at)}</span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-extrabold text-sm text-gray-200 bg-card-border/30 px-2 py-0.5 rounded border border-card-border/30">
                                Dự đoán: {pHome}-{pAway}
                              </span>
                              {hasActualResult && (() => {
                                const status = getPredictionStatus(
                                  pHome,
                                  pAway,
                                  run.actual_home_score,
                                  run.actual_away_score,
                                  pType,
                                  run.actual_first_half_home_score ?? run.actualFirstHalfHomeScore,
                                  run.actual_first_half_away_score ?? run.actualFirstHalfAwayScore
                                );
                                return (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${status.colorClass}`}>
                                    {status.text} ({actH}-{actA})
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Grounded Sources */}
                {prediction.sources && prediction.sources.length > 0 && (
                  <div className="glass-panel rounded-xl p-4 border border-card-border">
                    <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-3">
                      Nguồn tin tham khảo (Google Search Grounding)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {prediction.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-card-border/20 border border-card-border hover:border-primary/50 transition-colors flex items-center space-x-1.5 text-xs text-gray-300 hover:text-primary"
                        >
                          <span>📰</span>
                          <span className="truncate flex-1 font-semibold text-[10px]">{src.title}</span>
                          <span className="text-gray-500 font-bold text-[10px]">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Results Update Panel */}
                <div className="glass-panel rounded-xl p-4 border border-card-border space-y-3.5">
                  <div>
                    <h3 className="text-gray-400 font-bold text-xs mb-1 uppercase tracking-wider">Cập Nhật Kết Quả Thực Tế</h3>
                    <p className="text-[10px] text-gray-500 leading-normal">
                      AI sẽ tự động tra cứu tỉ số thực tế trực tuyến thông qua Google Search để cập nhật kết quả và chấm điểm các dự đoán.
                    </p>
                  </div>

                  {/* Auto Update Button */}
                  <button
                    type="button"
                    onClick={handleAutoUpdateResult}
                    disabled={updatingAuto}
                    className="w-full bg-[#151E2E] hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-bold py-2 px-3 rounded-lg text-xs tracking-wider transition-all flex items-center justify-center space-x-1.5 shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    <span>🤖</span>
                    <span>{updatingAuto ? 'Đang tìm kiếm & chấm điểm...' : 'TỰ ĐỘNG CẬP NHẬT (AI & GOOGLE SEARCH)'}</span>
                  </button>

                  {resMessage && (
                    <div className={`mt-3 p-2.5 rounded-lg border text-xs leading-relaxed ${resMessage.success
                        ? 'border-primary/30 bg-primary/5 text-primary'
                        : 'border-red-500/30 bg-red-950/10 text-red-400'
                      }`}>
                      {resMessage.text}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Tab: Soi kèo */}
            {activeTab === 'bets' && (
              <div className="space-y-4 animate-fade-in">

                {/* Recommended Bets Card */}
                {(() => {
                  const evalDetails = prediction.bet_evaluation_details;
                  const showOutcome = evalDetails && (prediction.actual_home_score !== null && prediction.actual_home_score !== undefined);

                  const renderBetOutcomeBadge = (betType) => {
                    if (!showOutcome || !evalDetails[betType]) return null;
                    const { outcome, reason } = evalDetails[betType];
                    if (outcome === 'correct') {
                      return (
                        <span className="bg-primary/20 text-primary border border-primary/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                          <span>🟢 Đúng</span>
                        </span>
                      );
                    } else if (outcome === 'incorrect') {
                      return (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                          <span>🔴 Sai</span>
                        </span>
                      );
                    } else if (outcome === 'refund') {
                      return (
                        <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                          <span>🟡 Hòa</span>
                        </span>
                      );
                    }
                    return null;
                  };

                  return (
                    <div className="glass-panel rounded-xl p-4 border border-card-border">
                      <h3 className="text-gray-400 font-bold text-xs mb-3 uppercase tracking-wider">Soi Kèo Cùng AI Pundit</h3>

                      <div className="space-y-3 text-xs">
                        {/* Kèo 1X2 */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Châu Âu (1X2)</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-primary/20 text-primary border border-primary/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_1x2 ?? prediction.bets?.oneXTwo?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('oneXTwo')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.oneXTwo?.reason || 'Phân tích dựa trên sức mạnh kiểm soát và lợi thế tổng thể.'}</p>
                        </div>

                        {/* Kèo Tài Xỉu */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Tài Xỉu (O/U {prediction.ou_line ?? prediction.bets?.overUnder?.line ?? 2.5})</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-secondary/20 text-secondary border border-secondary/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_ou ?? prediction.bets?.overUnder?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('overUnder')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.overUnder?.reason || 'Tính toán tần suất và phong độ tấn công/phòng ngự của 2 đội.'}</p>
                        </div>

                        {/* Kèo Chấp */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Chấp Châu Á</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-accent/20 text-accent border border-accent/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_handicap ?? prediction.bets?.handicap?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('handicap')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.handicap?.reason || 'Đánh giá tỷ lệ chấp kèo châu Á tương quan lực lượng.'}</p>
                        </div>

                        {/* Kèo Cả Hai Đội Ghi Bàn (BTTS) */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Cả Hai Đội Ghi Bàn (BTTS)</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-[#1D4ED8]/25 text-blue-400 border border-[#1D4ED8]/30 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_btts ?? prediction.bets?.btts?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('btts')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.btts?.reason || 'Phân tích khả năng ghi bàn từ cả hai câu lạc bộ.'}</p>
                        </div>

                        {/* Kèo Phạt Góc */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Phạt Góc (O/U {prediction.corners_line ?? prediction.bets?.corners?.line ?? 8.5})</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-[#581C87]/25 text-purple-400 border border-[#581C87]/30 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_corners ?? prediction.bets?.corners?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('corners')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.corners?.reason || 'Tỷ lệ phạt góc dựa trên nhịp độ trận đấu và thói quen đá biên.'}</p>
                        </div>

                        {/* Kèo Thẻ Phạt */}
                        <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Thẻ Phạt (O/U {prediction.cards_line ?? prediction.bets?.cards?.line ?? 3.5})</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="bg-[#D97706]/20 text-[#F59E0B] border border-[#D97706]/35 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                {translateRecommendation(prediction.recommendation_cards ?? prediction.bets?.cards?.recommendation)}
                              </span>
                              {renderBetOutcomeBadge('cards')}
                            </div>
                          </div>
                          <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.cards?.reason || 'Đánh giá số lượng thẻ phạt từ mức độ quyết liệt và lịch sử phạm lỗi.'}</p>
                        </div>
                      </div>

                      {showOutcome && evalDetails && evalDetails.summary && (
                        <div className="mt-3 pt-2.5 border-t border-card-border/30 text-[10px] text-gray-400 italic">
                          📢 <span className="font-bold text-gray-350">AI Nhận Xét:</span> {evalDetails.summary}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            )}

            {/* Tab: Trợ lý soi kèo (luôn mount, ẩn/hiện bằng class hidden để bảo toàn trạng thái chat) */}
            <div className={`space-y-4 ${activeTab === 'chat' ? 'animate-fade-in' : 'hidden'}`}>

              {/* Khung trò chuyện cùng AI Soi kèo */}
              <div className="glass-panel rounded-xl p-4 border border-card-border space-y-4">
                <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-card-border/50 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span>💬</span>
                    <span>Trò chuyện cùng AI Soi kèo</span>
                  </div>
                  {loadingChat && <span className="text-[10px] text-primary animate-pulse">Đang tải...</span>}
                </h3>

                {/* Message List */}
                <div ref={chatContainerRef} className="space-y-3 max-h-[500px] overflow-y-auto pr-1.5 custom-scrollbar flex flex-col">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs">
                      Chưa có hội thoại nào. Hãy đặt câu hỏi cho AI về trận đấu này!
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const isUser = msg.sender === 'user';
                      return (
                        <div
                          key={idx}
                          data-sender={msg.sender}
                          className={`flex flex-col space-y-1 max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'
                            }`}
                        >
                          <span className="text-[9px] text-gray-555 font-semibold px-1">
                            {isUser ? 'Bạn' : `Chuyên gia ${formatModelName(msg.model_used || msg.modelUsed)}`}
                          </span>
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${isUser
                                ? 'bg-primary/20 text-primary border border-primary/20 rounded-tr-none'
                                : 'bg-[#151E2E] text-gray-200 border border-card-border rounded-tl-none'
                              }`}
                          >
                            {msg.imageUrls.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-1.5 max-w-[380px]">
                                {msg.imageUrls.map((url, uIdx) => (
                                  <button
                                    key={uIdx}
                                    type="button"
                                    onClick={() => setPreviewImageUrl(url)}
                                    className="block relative aspect-square w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px] rounded-lg overflow-hidden border border-card-border shadow-sm hover:opacity-90 transition-opacity focus:outline-none cursor-pointer"
                                  >
                                    <img
                                      src={url}
                                      alt={`Đính kèm ${uIdx + 1}`}
                                      className="w-full h-full object-cover"
                                      onLoad={() => {
                                        if (activeTab === 'chat') {
                                          scrollChatToLatestUserMessage('auto', 60);
                                        }
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                            {isUser ? (
                              <p className="whitespace-pre-line">{msg.message}</p>
                            ) : (
                              renderMessageContent(msg.message)
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {sendingChat && (
                    <div className="flex flex-col space-y-1 max-w-[85%] self-start items-start animate-pulse">
                      <span className="text-[9px] text-gray-550 font-semibold px-1">
                        {formatModelName(prediction?.modelUsed || prediction?.model_used || 'gemini-2.5-flash')} đang suy nghĩ...
                      </span>
                      <div className="rounded-2xl rounded-tl-none px-3.5 py-2 text-xs bg-[#151E2E] text-gray-400 border border-card-border">
                        Đang phân tích dữ liệu trận đấu và kèo cược...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Suggested Questions */}
                <div className="relative">
                  {!sendingChat && (
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(!showSuggestions)}
                        className="text-[10px] text-gray-400 hover:text-primary bg-card-border/30 hover:bg-primary/10 border border-card-border/50 rounded-lg px-2.5 py-1 transition-all cursor-pointer font-bold flex items-center space-x-1"
                      >
                        <span>💡 Gợi ý hỏi nhanh</span>
                        <span className="text-[8px]">{showSuggestions ? '▲' : '▼'}</span>
                      </button>
                    </div>
                  )}

                  {showSuggestions && !sendingChat && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-full max-w-sm bg-[#0B0F17]/95 border border-card-border rounded-xl p-2 shadow-2xl z-20 space-y-1 backdrop-blur-md">
                      {suggestedQuestions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          type="button"
                          onClick={() => {
                            handleSuggestedQuestionClick(q);
                            setShowSuggestions(false);
                          }}
                          className="w-full text-left text-[11px] text-gray-300 hover:bg-primary/20 hover:text-primary rounded-lg px-2.5 py-1.5 transition-all cursor-pointer font-medium border border-transparent hover:border-primary/20"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Image Previews Box */}
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 animate-fade-in">
                    {imagePreviews.map((preview, pIdx) => (
                      <div key={pIdx} className="relative w-fit bg-card-border/20 border border-card-border p-1.5 rounded-xl flex items-center space-x-2">
                        <img src={preview} alt={`Xem trước ${pIdx + 1}`} className="w-12 h-12 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(pIdx)}
                          className="absolute -top-1.5 -right-1.5 bg-rose-500/80 hover:bg-rose-600 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold border border-rose-600 cursor-pointer shadow-md"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input form */}
                <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-card-border/30">
                  {activeModelSupportsImage && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sendingChat}
                        className="bg-[#151E2E] hover:bg-[#1f2d47] border border-card-border hover:border-white/25 text-gray-400 hover:text-white w-9.5 h-9.5 rounded-xl transition-all flex items-center justify-center cursor-pointer disabled:opacity-45"
                        title="Đính kèm hình ảnh"
                      >
                        📷
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        accept="image/*"
                        className="hidden"
                      />
                    </>
                  )}
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onPaste={handleInputPaste}
                    disabled={sendingChat}
                    placeholder={activeModelSupportsImage ? "Hỏi AI hoặc đính kèm ảnh phân tích bảng kèo..." : "Hỏi AI về chiến thuật, kèo phạt góc, tài xỉu..."}
                    className="flex-1 bg-[#070b14] border border-card-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-primary/80 transition-colors placeholder:text-gray-655"
                  />
                  <button
                    type="submit"
                    disabled={sendingChat || (!chatInput.trim() && imagePreviews.length === 0)}
                    className="bg-primary hover:bg-primary/95 disabled:opacity-40 disabled:hover:bg-primary text-black font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    Gửi
                  </button>
                </form>
              </div>

              {/* Modal preview ảnh */}
              {previewImageUrl && (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fade-in"
                  onClick={() => setPreviewImageUrl(null)}
                >
                  <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center">
                    <button
                      type="button"
                      className="absolute -top-12 right-0 bg-card-border/60 hover:bg-card-border hover:text-white text-gray-300 w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer shadow-lg"
                      onClick={() => setPreviewImageUrl(null)}
                    >
                      ✕
                    </button>
                    <img
                      src={previewImageUrl}
                      alt="Xem chi tiết ảnh"
                      className="max-w-full max-h-[80vh] object-contain rounded-xl border border-card-border/40 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}

            </div>


          </div>
        )}

      </div>
    </div>
  );
}
