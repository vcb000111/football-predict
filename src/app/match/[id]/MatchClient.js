'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getTeamFlag } from '@/lib/flags';
import { saveLastUsedModel } from '@/lib/models-client';
import { getVNTime } from '@/lib/timezone';

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

function renderMessageContent(text) {
  if (!text) return null;
  
  const lines = text.split('\n');
  
  return lines.map((line, lineIdx) => {
    let currentLine = line.trim();
    if (!currentLine) {
      return <div key={lineIdx} className="h-2" />;
    }
    
    if (currentLine.startsWith('**') && currentLine.endsWith('**')) {
      currentLine = currentLine.substring(2, currentLine.length - 2).trim();
    }
    
    let isHeading = false;
    let headingLevel = 0;
    if (currentLine.startsWith('###')) {
      isHeading = true;
      headingLevel = 3;
      currentLine = currentLine.substring(3).trim();
    } else if (currentLine.startsWith('##')) {
      isHeading = true;
      headingLevel = 2;
      currentLine = currentLine.substring(2).trim();
    } else if (currentLine.startsWith('#')) {
      isHeading = true;
      headingLevel = 1;
      currentLine = currentLine.substring(1).trim();
    }
    
    let isListItem = false;
    if (!isHeading && (currentLine.startsWith('* ') || currentLine.startsWith('- ') || currentLine.startsWith('• '))) {
      isListItem = true;
      currentLine = currentLine.substring(2).trim();
    }
    
    const parseBold = (str) => {
      const parts = str.split('**');
      return parts.map((part, partIdx) => {
        if (partIdx % 2 === 1) {
          return <strong key={partIdx} className="font-extrabold text-white">{part}</strong>;
        }
        return part;
      });
    };
    
    const content = parseBold(currentLine);
    
    if (isHeading) {
      if (headingLevel === 1) return <h1 key={lineIdx} className="text-sm font-black text-white mt-3 mb-1.5 uppercase tracking-wider">{content}</h1>;
      if (headingLevel === 2) return <h2 key={lineIdx} className="text-xs font-black text-white mt-2.5 mb-1.5 uppercase tracking-wider">{content}</h2>;
      return <h3 key={lineIdx} className="text-[11px] font-black text-primary mt-2 mb-1 uppercase tracking-wider">{content}</h3>;
    }
    
    if (isListItem) {
      return (
        <div key={lineIdx} className="flex items-start pl-2.5 my-0.5">
          <span className="text-primary mr-1.5 select-none">•</span>
          <span className="flex-1 text-[11px] text-gray-300">{content}</span>
        </div>
      );
    }
    
    return (
      <div key={lineIdx} className="my-1 text-gray-300 text-xs leading-relaxed">
        {content}
      </div>
    );
  });
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

export default function MatchClient({ match, activeModelSupportsImage }) {
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingStep, setLoadingStep] = useState(0);

  // States cho Chat AI Persistent
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // States hỗ trợ đính kèm hình ảnh đa phương thức
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('Kích thước ảnh phải dưới 4MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInputPaste = (e) => {
    if (!activeModelSupportsImage) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 4 * 1024 * 1024) {
            alert('Kích thước ảnh phải dưới 4MB');
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            setImagePreview(reader.result);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  // States cho Form cập nhật kết quả thực tế
  const [resMessage, setResMessage] = useState(null);
  const [updatingAuto, setUpdatingAuto] = useState(false);

  // States cho pham vi du doan
  const [predictType, setPredictType] = useState('full_time');
  const [firstHalfHomeScore, setFirstHalfHomeScore] = useState('');
  const [firstHalfAwayScore, setFirstHalfAwayScore] = useState('');

  const suggestedQuestions = [
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

  const fetchChatHistory = async () => {
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/match/chat?matchId=${match.id}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Lỗi tải lịch sử chat:', err);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const timer = setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [chatMessages, loadingChat, sendingChat, prediction]);

  // Load history when match changes or on mount
  useEffect(() => {
    let active = true;
    
    const initAndLoad = async () => {
      setLoading(true);
      setError(null);
      setPrediction(null);
      setHistoryList([]);
      setResMessage(null);
      fetchChatHistory();
      
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

  const sendMessageToAI = async (messageText, base64Image = null) => {
    if (!messageText.trim() && !base64Image) return;
    if (sendingChat) return;

    const tempUserMsg = { 
      sender: 'user', 
      message: messageText, 
      image: base64Image,
      created_at: new Date().toISOString() 
    };
    setChatMessages(prev => [...prev, tempUserMsg]);
    setSendingChat(true);

    try {
      const res = await fetch('/api/match/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          matchId: match.id, 
          message: messageText,
          image: base64Image
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const historyRes = await fetch(`/api/match/chat?matchId=${match.id}`);
        if (historyRes.ok) {
          const histData = await historyRes.json();
          // Bảo lưu hình ảnh tạm thời để hiển thị trên UI phiên chat hiện tại
          const updatedMsgs = (histData.messages || []).map((msg, mIdx) => {
            if (mIdx === histData.messages.length - 2 && msg.sender === 'user') {
              return { ...msg, image: base64Image };
            }
            return msg;
          });
          setChatMessages(updatedMsgs.length > 0 ? updatedMsgs : histData.messages);
        }
      } else {
        throw new Error(data.error || 'Gửi tin nhắn thất bại');
      }
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'ai', message: `❌ Lỗi: ${err.message || 'Không thể kết nối đến máy chủ AI.'}`, created_at: new Date().toISOString() }]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if ((!chatInput.trim() && !imagePreview) || sendingChat) return;

    const userMsgText = chatInput.trim();
    const currentImg = imagePreview;
    setChatInput('');
    handleRemoveImage();
    await sendMessageToAI(userMsgText, currentImg);
  };

  const handleSuggestedQuestionClick = async (question) => {
    await sendMessageToAI(question, null);
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
      const d = new Date(dateStr);
      // SQLite returns UTC, format cleanly in VN timezone
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Inline Notifications (Error / Progress) */}
            {error && (
              <div className="lg:col-span-12 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-400 leading-relaxed flex items-center justify-between animate-fade-in shadow-lg">
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
              <div className="lg:col-span-12 p-3 rounded-xl border border-secondary/30 bg-secondary/5 text-[11px] text-secondary leading-relaxed flex items-center space-x-2 animate-pulse shadow-lg">
                <span>🧠</span>
                <div>
                  <strong>Tiến trình AI:</strong>{' '}
                  <span className="text-gray-300">{loadingSteps[loadingStep]}</span>
                </div>
              </div>
            )}
            
            {/* Left Column: Match Predictions & Bets & Runs History (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              
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
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                    prediction.predict_type === 'first_half' || prediction.predictType === 'first_half'
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
                    className={`w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-2.5 px-4 rounded-xl text-xs tracking-wider transition-all duration-150 flex items-center justify-center space-x-1.5 shadow-md shadow-primary/10 ${
                      predicting ? 'opacity-50 cursor-not-allowed scale-100' : 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
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
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    prediction.predict_type === 'first_half' || prediction.predictType === 'first_half'
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
                    <span className="text-3xl sm:text-4xl font-black text-white glow-cyan">{prediction.predicted_away_score ?? prediction.predictedScore?.away}</span>
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
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150 flex items-center justify-between ${
                            isActive 
                              ? 'border-primary bg-primary/5 text-white shadow-sm glow-green' 
                              : 'border-card-border/60 hover:border-card-border bg-card-border/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex flex-col space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold"># Lượt {historyList.length - idx}</span>
                              <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${
                                pType === 'first_half'
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

            {/* Right Column: AI Analysis & Search Sources & Result Entry (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              
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
                  <p className="text-xs text-gray-300 leading-relaxed bg-card-border/10 border border-card-border/40 p-3 rounded-lg font-medium">
                    {prediction.analysis?.predictionReasoning || prediction.prediction_reasoning || 'AI đánh giá cao khả năng áp đặt lối chơi và ghi bàn đột biến của bên tấn công.'}
                  </p>
                </div>
              </div>

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
                  <div className={`mt-3 p-2.5 rounded-lg border text-xs leading-relaxed ${
                    resMessage.success 
                      ? 'border-primary/30 bg-primary/5 text-primary' 
                      : 'border-red-500/30 bg-red-950/10 text-red-400'
                  }`}>
                    {resMessage.text}
                  </div>
                )}
              </div>

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
                          className={`flex flex-col space-y-1 max-w-[85%] ${
                            isUser ? 'self-end items-end' : 'self-start items-start'
                          }`}
                        >
                          <span className="text-[9px] text-gray-500 font-semibold px-1">
                            {isUser ? 'Bạn' : `Chuyên gia ${formatModelName(msg.model_used || msg.modelUsed)}`}
                          </span>
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                              isUser
                                ? 'bg-primary/20 text-primary border border-primary/20 rounded-tr-none'
                                : 'bg-[#151E2E] text-gray-200 border border-card-border rounded-tl-none'
                            }`}
                          >
                            {(msg.imageUrl || msg.image) && (
                              <img src={msg.imageUrl || msg.image} alt="Đính kèm" className="max-w-[180px] sm:max-w-[240px] rounded-xl mb-1.5 border border-card-border shadow-md object-cover animate-fade-in" />
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

                {/* Image Preview Box */}
                {imagePreview && (
                  <div className="relative w-fit bg-card-border/20 border border-card-border p-1.5 rounded-xl flex items-center space-x-2 animate-fade-in mb-2">
                    <img src={imagePreview} alt="Xem trước" className="w-12 h-12 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500/80 hover:bg-rose-600 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold border border-rose-600 cursor-pointer shadow-md"
                    >
                      ✕
                    </button>
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
                    disabled={sendingChat || (!chatInput.trim() && !imagePreview)}
                    className="bg-primary hover:bg-primary/95 disabled:opacity-40 disabled:hover:bg-primary text-black font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    Gửi
                  </button>
                </form>
              </div>

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

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
