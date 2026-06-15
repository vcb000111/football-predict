'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { renderMessageContent } from '@/lib/markdown';

// Hàm loại bỏ thẻ XML <followups>...</followups> khi hiển thị nội dung chat
const cleanMessageContent = (content) => {
  if (!content) return '';
  return content.replace(/<followups>[\s\S]*?<\/followups>/g, '').trim();
};

// Hàm trích xuất các câu gợi ý tiếp theo từ thẻ XML <followups>
const extractFollowups = (content) => {
  if (!content) return [];
  const followupRegex = /<followups>([\s\S]*?)<\/followups>/;
  const match = content.match(followupRegex);
  if (match) {
    const rawFollowups = match[1];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    const followups = [];
    while ((itemMatch = itemRegex.exec(rawFollowups)) !== null) {
      const cleanItem = itemMatch[1].trim();
      if (cleanItem) {
        followups.push(cleanItem);
      }
    }
    return followups;
  }
  return [];
};

export default function Chatbox() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [suggestedFollowups, setSuggestedFollowups] = useState([
    "Xem lịch thi đấu hôm nay",
    "Tối nay có trận nào hot không?",
    "Tỷ lệ dự đoán đúng của AI là bao nhiêu?"
  ]);
  const [showFollowupsDropdown, setShowFollowupsDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Đóng dropdown khi click ra ngoài vùng dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowFollowupsDropdown(false);
      }
    };
    if (showFollowupsDropdown) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showFollowupsDropdown]);

  // Các state hỗ trợ phân trang lịch sử chat (Infinite Scroll)
  const [hasMore, setHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // State quản lý hình ảnh đính kèm
  const [selectedImages, setSelectedImages] = useState([]);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // 1. Kiểm tra trạng thái đăng nhập và tải lịch sử tương ứng
  useEffect(() => {
    const checkAndLoad = async () => {
      let currentUser = null;
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          currentUser = data.user;
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        setUser(null);
      }

      if (currentUser) {
        // Đã đăng nhập: tải lịch sử từ DB
        try {
          setLoadingHistory(true);
          const res = await fetch('/api/chat/assistant/history?limit=30');
          const data = await res.json();
          if (data.success && data.messages) {
            setMessages(data.messages);
            setHasMore(data.hasMore);
            
            // Trích xuất followups từ tin nhắn assistant cuối cùng
            const lastAssistantMsg = [...data.messages].reverse().find(msg => msg.role === 'assistant');
            if (lastAssistantMsg) {
              const followups = extractFollowups(lastAssistantMsg.content);
              if (followups.length > 0) {
                setSuggestedFollowups(followups);
              }
            }
          }
        } catch (err) {
          console.error('Lỗi tải lịch sử chat từ DB:', err);
        } finally {
          setLoadingHistory(false);
        }
      } else {
        // Chưa đăng nhập: tải lịch sử từ sessionStorage
        const savedChats = sessionStorage.getItem('assistant_chats');
        if (savedChats) {
          try {
            const loadedMsgs = JSON.parse(savedChats);
            setMessages(loadedMsgs);
            
            // Trích xuất followups từ tin nhắn assistant cuối cùng
            const lastAssistantMsg = [...loadedMsgs].reverse().find(msg => msg.role === 'assistant');
            if (lastAssistantMsg) {
              const followups = extractFollowups(lastAssistantMsg.content);
              if (followups.length > 0) {
                setSuggestedFollowups(followups);
              }
            }
          } catch (e) {
            console.error('Lỗi parse sessionStorage:', e);
          }
        } else {
          setMessages([
            {
              role: 'assistant',
              content: 'Xin chào! Tôi là trợ lý AI chuyên gia soi kèo bóng đá World Cup 2026. Bạn có thể hỏi tôi về lịch thi đấu, phân tích phong độ các đội bóng hoặc dán link trận đấu vào đây để tôi phân tích nhé!'
            }
          ]);
        }
        setHasMore(false);
      }
    };

    checkAndLoad();
  }, [reloadTrigger]);

  // Lắng nghe sự thay đổi trạng thái đăng nhập để cập nhật lịch sử chat
  useEffect(() => {
    const handleAuthChange = () => {
      setReloadTrigger(prev => prev + 1);
    };
    window.addEventListener('auth-state-changed', handleAuthChange);
    return () => {
      window.removeEventListener('auth-state-changed', handleAuthChange);
    };
  }, []);

  // Tự động cuộn xuống cuối khi mở chatbox lần đầu hoặc nhận tin nhắn mới của người dùng
  useEffect(() => {
    if (messages.length > 0 && !loadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen, loadingHistory]);

  // Lưu tin nhắn vào sessionStorage (chỉ dùng cho chế độ Guest)
  const saveGuestMessages = (newMessages) => {
    setMessages(newMessages);
    if (!user) {
      sessionStorage.setItem('assistant_chats', JSON.stringify(newMessages));
    }
  };

  // 2. Xử lý tải thêm lịch sử khi cuộn lên trên đỉnh (Infinite Scroll)
  const handleScroll = async () => {
    const container = chatContainerRef.current;
    if (!container || loadingHistory || !hasMore || !user) return;

    // Khi cuộn lên đỉnh (scrollTop === 0)
    if (container.scrollTop === 0) {
      const oldestMessage = messages[0];
      const beforeId = oldestMessage?.id;

      if (!beforeId) return;

      setLoadingHistory(true);
      const oldScrollHeight = container.scrollHeight;

      try {
        const res = await fetch(`/api/chat/assistant/history?beforeId=${beforeId}&limit=30`);
        const data = await res.json();

        if (data.success && data.messages) {
          const fetchedMessages = data.messages;

          setMessages(prev => [...fetchedMessages, ...prev]);
          setHasMore(data.hasMore);

          // Bù đắp scrollHeight chênh lệch để chống giật cuộn (Scroll Jump)
          setTimeout(() => {
            if (chatContainerRef.current) {
              const newScrollHeight = chatContainerRef.current.scrollHeight;
              chatContainerRef.current.scrollTop = newScrollHeight - oldScrollHeight;
            }
          }, 30);
        }
      } catch (err) {
        console.error('Lỗi tải thêm lịch sử phân trang:', err);
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  // 3. Xử lý hình ảnh và nén Canvas phía Client dùng chung
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

    const currentCount = selectedImages.length;
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

    setSelectedImages(prev => [...prev, ...compressedResults]);
    e.target.value = ''; // Reset file input
  };

  // Hỗ trợ Ctrl+V paste ảnh từ Clipboard
  const handleInputPaste = async (e) => {
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

    const currentCount = selectedImages.length;
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

    setSelectedImages(prev => [...prev, ...compressedResults]);
    e.preventDefault();
  };

  const removeSelectedImage = (indexToRemove) => {
    setSelectedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Trích xuất thông tin trang hiện tại để gửi làm context
  const getPageContext = () => {
    if (typeof window === 'undefined') return null;

    const mainElement = document.querySelector('main');
    const rawText = mainElement ? mainElement.innerText : document.body.innerText;

    const cleanText = rawText
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500); // Lấy tối đa 1500 ký tự đầu

    return {
      url: window.location.href,
      title: document.title,
      content: cleanText
    };
  };

  const sendMessage = async (directText = null) => {
    const textToSend = directText !== null ? directText : inputValue;
    const currentSelectedImages = [...selectedImages];

    if ((!textToSend.trim() && currentSelectedImages.length === 0) || loading) return;

    setInputValue('');
    setSelectedImages([]);
    setSuggestedFollowups([]); // Reset gợi ý cũ ngay khi gửi
    setShowFollowupsDropdown(false); // Ẩn dropdown

    // Định dạng tin nhắn của User hiển thị trực tiếp trên UI
    const userMessageObj = {
      role: 'user',
      content: textToSend || '[Hình ảnh]',
      imageUrls: currentSelectedImages
    };

    const newMessages = [...messages, userMessageObj];
    saveGuestMessages(newMessages);
    setLoading(true);

    // Chuẩn bị tin nhắn assistant trống để stream chữ chạy
    const assistantIndex = newMessages.length;
    const updatedMessages = [...newMessages, { role: 'assistant', content: '' }];
    saveGuestMessages(updatedMessages);

    try {
      const pageContext = getPageContext();
      // Bổ sung matchId vào context nếu đang ở trang chi tiết trận đấu
      if (pageContext && pathname.startsWith('/match/')) {
        const pathParts = pathname.split('/');
        const activeMatchId = pathParts[pathParts.length - 1];
        if (activeMatchId) {
          pageContext.matchId = activeMatchId;
        }
      }

      const response = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          pageContext,
          images: currentSelectedImages
        })
      });

      if (!response.ok) {
        throw new Error('Kết nối API thất bại.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finished = false;
      let accumulatedText = '';

      while (!finished) {
        const { value, done } = await reader.read();
        finished = done;
        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  accumulatedText = `Lỗi: ${data.error}`;
                  finished = true;
                } else if (data.text) {
                  accumulatedText += data.text;

                  updatedMessages[assistantIndex] = {
                    role: 'assistant',
                    content: accumulatedText
                  };
                  saveGuestMessages([...updatedMessages]);
                }
              } catch (parseErr) {
                // Chấp nhận bỏ qua nếu chunk json cắt dòng chưa hoàn thiện
              }
            }
          }
        }
      }

      // Xử lý trích xuất câu hỏi gợi ý tiếp theo (Dynamic Followups) ở cuối stream
      if (accumulatedText) {
        const followups = extractFollowups(accumulatedText);
        const cleanedText = cleanMessageContent(accumulatedText);
        
        updatedMessages[assistantIndex] = {
          role: 'assistant',
          content: cleanedText
        };
        saveGuestMessages([...updatedMessages]);

        if (followups.length > 0) {
          setSuggestedFollowups(followups);
        }
      }

      if (user) {
        setReloadTrigger(prev => prev + 1);
      }

    } catch (err) {
      console.error('Lỗi stream chat:', err);
      updatedMessages[assistantIndex] = {
        role: 'assistant',
        content: 'Không thể kết nối với trợ lý AI. Vui lòng thử lại sau.'
      };
      saveGuestMessages([...updatedMessages]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    sendMessage();
  };

  const handleFollowupClick = (item) => {
    sendMessage(item);
  };

  const clearHistory = async () => {
    if (confirm('Sếp có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện không?')) {
      if (user) {
        // Nếu đã đăng nhập, ta sẽ không xóa hẳn trên DB để giữ lưu trữ audit, nhưng tạm thời reset view bằng sessionStorage guest
        setMessages([
          {
            role: 'assistant',
            content: 'Đã ẩn lịch sử chat DB trên màn hình sếp. Tin nhắn chào mừng: Hãy đặt câu hỏi bất kỳ cho trợ lý AI World Cup 2026.'
          }
        ]);
      } else {
        sessionStorage.removeItem('assistant_chats');
        setMessages([
          {
            role: 'assistant',
            content: 'Lịch sử chat khách đã được dọn dẹp sạch sẽ.'
          }
        ]);
      }
    }
  };

  return (
    // Di chuyển vị trí sang bên phải và căn chỉnh với tasks history
    <div className="fixed bottom-20 right-4 sm:right-6 md:bottom-6 z-[9999] flex flex-col items-end font-sans">

      {/* Cửa sổ chat */}
      {isOpen && (
        // Responsive Mobile: thích ứng chiều cao màn hình, PC: sm:w-[400px] sm:h-[560px]
        <div className="w-[calc(100vw-32px)] sm:w-[400px] h-[calc(100vh-140px)] max-h-[520px] sm:h-[560px] sm:max-h-none rounded-2xl glass-panel flex flex-col mb-3 overflow-hidden border border-[#223147] shadow-2xl glow-cyan/10">

          {/* Header */}
          <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-b border-[#223147] bg-[#0F172A] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary live-indicator"></div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Trợ lý AI soi kèo</h4>
                <p className="text-[10px] text-gray-400">
                  {user ? `Lịch sử lưu DB: ${user.username}` : 'Chế độ khách (sessionStorage)'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={clearHistory}
                title="Dọn dẹp lịch sử"
                className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Khung chứa các tin nhắn */}
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-grow p-2.5 sm:p-3 overflow-y-auto space-y-2.5 bg-[#0B0F17]/95"
          >
            {loadingHistory && (
              <div className="text-center text-xs text-secondary animate-pulse py-1">
                Đang tải thêm lịch sử cũ...
              </div>
            )}

            {messages.map((msg, index) => {
              // Bỏ qua tin nhắn assistant rỗng (chưa bắt đầu stream) để không hiện khung nhỏ rỗng
              if (msg.role === 'assistant' && !msg.content) return null;

              return (
                <div
                  key={index}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                        ? 'bg-secondary text-white rounded-br-none'
                        : 'bg-[#151E2E] text-gray-200 border border-[#223147] rounded-bl-none'
                      }`}
                  >
                    <div className="whitespace-pre-wrap select-text">
                      {msg.role === 'assistant' ? renderMessageContent(cleanMessageContent(msg.content)) : msg.content}
                    </div>

                    {/* Hiển thị mảng ảnh đính kèm của tin nhắn */}
                    {msg.imageUrls && msg.imageUrls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {msg.imageUrls.map((url, idx) => (
                          <a href={url} target="_blank" rel="noreferrer" key={idx} className="block w-16 h-16 rounded overflow-hidden border border-white/10 hover:border-white/30 transition-colors">
                            <img src={url} className="w-full h-full object-cover" alt="attachment" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && !messages[messages.length - 1]?.content && (
              <div className="flex justify-start">
                <div className="bg-[#151E2E] border border-[#223147] rounded-2xl rounded-bl-none px-4 py-2.5 flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Lưới xem trước hình ảnh đính kèm */}
          {selectedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-[#0F172A] border-t border-[#223147] flex-shrink-0">
              {selectedImages.map((img, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#223147]">
                  <img src={img} className="w-full h-full object-cover" alt="preview" />
                  <button
                    type="button"
                    onClick={() => removeSelectedImage(idx)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 rounded-full text-white text-[8px] hover:bg-red-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form nhập liệu */}
          <form
            onSubmit={handleSendMessage}
            className="p-2 sm:p-2.5 border-t border-[#223147] bg-[#0F172A] flex items-center space-x-2 flex-shrink-0"
          >
            {/* Input chọn nhiều ảnh ẩn */}
            <input
              type="file"
              multiple
              accept="image/*"
              id="assistant-image-input"
              onChange={handleImageChange}
              className="hidden"
            />

            {/* Nút bấm chọn ảnh */}
            <label
              htmlFor="assistant-image-input"
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1E293B] cursor-pointer flex items-center justify-center flex-shrink-0"
              title="Đính kèm hình ảnh bảng kèo"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </label>

            {/* Nút gợi ý câu hỏi (Popover/Dropdown) */}
            {!loading && suggestedFollowups.length > 0 && (
              <div className="relative flex-shrink-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFollowupsDropdown(!showFollowupsDropdown)}
                  className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                    showFollowupsDropdown ? 'text-primary bg-[#1E293B]' : 'text-gray-400 hover:text-white hover:bg-[#1E293B]'
                  }`}
                  title="Câu hỏi gợi ý"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>

                {showFollowupsDropdown && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-80px)] rounded-xl border border-[#223147] bg-[#151E2E] p-2 shadow-2xl z-[99999] flex flex-col space-y-1.5 max-h-[240px] overflow-y-auto">
                    <div className="text-[10px] font-bold text-gray-400 px-2 py-0.5 border-b border-[#223147]/50 pb-1 flex justify-between items-center flex-shrink-0">
                      <span>💡 GỢI Ý CÂU HỎI</span>
                      <button 
                        type="button" 
                        onClick={() => setShowFollowupsDropdown(false)}
                        className="text-gray-500 hover:text-gray-300 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {suggestedFollowups.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          handleFollowupClick(item);
                          setShowFollowupsDropdown(false);
                        }}
                        className="text-left text-[11px] text-gray-300 hover:text-white hover:bg-[#1E293B] px-2.5 py-1.5 rounded-lg border border-[#223147]/30 bg-[#0B0F17]/40 transition-colors cursor-pointer w-full whitespace-normal break-words"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPaste={handleInputPaste}
              placeholder="Nhập tin nhắn phân tích kèo..."
              disabled={loading}
              className="flex-grow px-3 py-2 rounded-lg bg-[#0B0F17] border border-[#223147] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-secondary transition-colors"
            />

            <button
              type="submit"
              disabled={loading || (!inputValue.trim() && selectedImages.length === 0)}
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/90 text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
            >
              <svg className="h-4 w-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Bubble float button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 w-10 sm:h-14 sm:w-14 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer glow-cyan"
      >
        {isOpen ? (
          <svg className="h-5.5 w-5.5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg className="h-5.5 w-5.5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
