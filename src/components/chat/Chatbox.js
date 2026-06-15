'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function Chatbox() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Load lịch sử chat từ sessionStorage khi khởi chạy
  useEffect(() => {
    const savedChats = sessionStorage.getItem('assistant_chats');
    if (savedChats) {
      try {
        setMessages(JSON.parse(savedChats));
      } catch (e) {
        console.error('Lỗi parse history chat:', e);
      }
    } else {
      // Tin nhắn chào mừng mặc định
      setMessages([
        {
          role: 'assistant',
          content: 'Xin chào! Tôi là trợ lý AI chuyên gia soi kèo bóng đá World Cup 2026. Bạn có thể hỏi tôi về lịch thi đấu, phân tích phong độ các đội bóng hoặc dán link trận đấu vào đây để tôi phân tích nhé!'
        }
      ]);
    }
  }, []);

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Lưu tin nhắn vào sessionStorage mỗi khi thay đổi
  const saveMessages = (newMessages) => {
    setMessages(newMessages);
    sessionStorage.setItem('assistant_chats', JSON.stringify(newMessages));
  };

  // Trích xuất thông tin trang hiện tại để gửi làm context
  const getPageContext = () => {
    if (typeof window === 'undefined') return null;
    
    // Tìm thẻ main hoặc lấy body text thô
    const mainElement = document.querySelector('main');
    const rawText = mainElement ? mainElement.innerText : document.body.innerText;
    
    // Clean text để giảm token tiêu thụ
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const userText = inputValue;
    setInputValue('');

    const newMessages = [...messages, { role: 'user', content: userText }];
    saveMessages(newMessages);
    setLoading(true);

    // Chuẩn bị tin nhắn assistant trống để stream
    const assistantIndex = newMessages.length;
    const updatedMessages = [...newMessages, { role: 'assistant', content: '' }];
    saveMessages(updatedMessages);

    try {
      const pageContext = getPageContext();

      const response = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          pageContext
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
                  
                  // Cập nhật stream content liên tục
                  updatedMessages[assistantIndex] = {
                    role: 'assistant',
                    content: accumulatedText
                  };
                  saveMessages([...updatedMessages]);
                }
              } catch (parseErr) {
                // Ignore lines that are not full JSON chunks
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Lỗi stream chat:', err);
      updatedMessages[assistantIndex] = {
        role: 'assistant',
        content: 'Không thể kết nối với trợ lý AI. Vui lòng thử lại sau.'
      };
      saveMessages([...updatedMessages]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    const defaultMsg = [
      {
        role: 'assistant',
        content: 'Xin chào! Tôi là trợ lý AI chuyên gia soi kèo bóng đá World Cup 2026. Bạn có thể hỏi tôi về lịch thi đấu, phân tích phong độ các đội bóng hoặc dán link trận đấu vào đây để tôi phân tích nhé!'
      }
    ];
    saveMessages(defaultMsg);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end font-sans">
      {/* Cửa sổ chat */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[520px] rounded-2xl glass-panel flex flex-col mb-4 overflow-hidden border border-[#223147] shadow-2xl glow-cyan/10">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#223147] bg-[#0F172A] flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary live-indicator"></div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Trợ lý AI soi kèo</h4>
                <p className="text-[10px] text-gray-400">Tự động nhận diện trang hiện tại</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={clearHistory}
                title="Xóa lịch sử chat"
                className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Danh sách tin nhắn */}
          <div 
            ref={chatContainerRef}
            className="flex-grow p-4 overflow-y-auto space-y-4 bg-[#0B0F17]/95"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-secondary text-white rounded-br-none'
                      : 'bg-[#151E2E] text-gray-200 border border-[#223147] rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap select-text">{msg.content}</div>
                </div>
              </div>
            ))}
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

          {/* Nhập liệu */}
          <form 
            onSubmit={handleSendMessage}
            className="p-3 border-t border-[#223147] bg-[#0F172A] flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Hỏi về trận đấu này hoặc dán link..."
              disabled={loading}
              className="flex-grow px-3.5 py-2 rounded-lg bg-[#0B0F17] border border-[#223147] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-secondary transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/90 text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center"
            >
              <svg className="h-4 w-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Nút bật tắt widget float bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer glow-cyan"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
