'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiTracker, useApiInterceptor } from '@/lib/api-tracker';

export default function ApiActivityFloat() {
  // Đăng ký hook interceptor
  useApiInterceptor();

  const router = useRouter();
  const [activeRequests, setActiveRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    // Đăng ký nhận thông báo thay đổi trạng thái request
    const unsubscribe = apiTracker.subscribe((state) => {
      setActiveRequests(state.active);
      setHistoryRequests(state.history);
    });

    // Đồng bộ danh sách lịch sử ban đầu sau khi client mount
    setActiveRequests(Array.from(apiTracker.activeRequests.values()));
    setHistoryRequests(apiTracker.historyRequests);

    return unsubscribe;
  }, []);

  // Đóng popover khi nhấp chuột ra ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tự động đánh dấu đã đọc khi mở Popover
  useEffect(() => {
    if (isOpen) {
      apiTracker.markAllAsRead();
    }
  }, [isOpen]);

  const activeCount = activeRequests.length;
  const unreadCount = historyRequests.filter((item) => item.isUnread).length;

  // Tính khoảng cách thời gian thân thiện (ví dụ: vừa xong, 10s trước...)
  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'Vừa xong';
    if (seconds < 60) return `${seconds}s trước`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}p trước`;
  };

  // Điều hướng quay lại trang đã thao tác
  const handleNavigate = (path) => {
    setIsOpen(false);
    router.push(path);
  };

  return (
    <div ref={containerRef} className="fixed bottom-20 right-4 z-50 md:bottom-6">
      {/* Nút tròn Float */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative h-10 w-10 rounded-full flex items-center justify-center border transition-all duration-300 shadow-xl cursor-pointer ${
          activeCount > 0
            ? 'bg-gradient-to-tr from-rose-500/20 to-amber-500/20 border-rose-500/60 text-rose-400 glow-rose animate-pulse'
            : 'bg-[#0D1324]/80 hover:bg-[#0D1324] border-card-border/70 text-gray-400 hover:text-white'
        }`}
        title="Theo dõi API & Lịch sử thao tác"
      >
        {activeCount > 0 ? (
          <svg className="animate-spin h-5.5 w-5.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5.5 h-5.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        )}

        {/* Badge số lượng API đang chạy hoặc chấm đỏ chưa xem */}
        {activeCount > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black h-4.5 w-4.5 rounded-full flex items-center justify-center border border-[#0B0F17]">
            {activeCount}
          </span>
        ) : (
          unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-rose-500 h-2.5 w-2.5 rounded-full border border-[#0B0F17] animate-pulse"></span>
          )
        )}
      </button>

      {/* Popover chi tiết */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-72 sm:w-80 max-h-96 sm:max-h-[420px] overflow-y-auto glass-panel border border-card-border/80 rounded-2xl p-2.5 sm:p-3.5 shadow-2xl z-50 text-[11px] sm:text-xs text-gray-300">
          
          {/* Section 1: Yêu cầu API đang hoạt động */}
          <div className="mb-3">
            <div className="font-bold text-gray-200 border-b border-card-border/60 pb-1 mb-1.5 sm:pb-1.5 sm:mb-2 flex justify-between items-center">
              <span className="uppercase tracking-wider text-[9px] sm:text-[10px] text-gray-400 font-extrabold">Đang xử lý ({activeCount})</span>
              <span className={`px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded text-[7px] sm:text-[9px] font-black uppercase ${activeCount > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-gray-500/10 text-gray-400'}`}>
                {activeCount > 0 ? 'Loading' : 'Idle'}
              </span>
            </div>

            {activeCount > 0 ? (
              <div className="space-y-1">
                {activeRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between bg-card-border/10 p-1.5 sm:p-2 rounded-lg border border-card-border/30">
                    <div className="flex flex-col min-w-0 pr-1.5">
                      <span className="font-bold text-[9px] sm:text-xs text-gray-200">{req.name}</span>
                      <span className="font-mono text-[7px] sm:text-[9px] text-gray-450 truncate" title={req.url}>{req.method} {req.url.split('?')[0]}</span>
                    </div>
                    <span className="text-[8px] sm:text-[10px] text-gray-400 flex-shrink-0 bg-card-border/30 px-1 py-0.5 rounded font-mono">
                      {Math.round((Date.now() - req.startTime) / 100) / 10}s
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-1.5 text-center text-gray-500 text-[9px] sm:text-[11px]">
                Không có yêu cầu API nào đang chạy
              </div>
            )}
          </div>

          {/* Section 2: Lịch sử thao tác & Điều hướng nhanh */}
          <div>
            <div className="font-bold text-gray-200 border-b border-card-border/60 pb-1 mb-1.5 sm:pb-1.5 sm:mb-2 uppercase tracking-wider text-[9px] sm:text-[10px] text-gray-400 font-extrabold">
              Lịch sử thao tác ({historyRequests.length})
            </div>

            {historyRequests.length > 0 ? (
              <div className="space-y-1">
                {historyRequests.map((his) => (
                  <button
                    key={his.id}
                    onClick={() => handleNavigate(his.pathname)}
                    className="w-full text-left flex items-center justify-between p-1.5 sm:p-2.5 bg-card-border/5 hover:bg-card-border/15 border border-card-border/20 hover:border-card-border/50 rounded-lg transition-colors cursor-pointer group"
                    title={`Bấm để chuyển về trang ${his.pathname}`}
                  >
                    <div className="flex flex-col min-w-0 pr-1.5 flex-1">
                      <span className="font-bold text-[9px] sm:text-xs text-gray-255 group-hover:text-primary transition-colors flex items-center">
                        {his.isUnread && (
                          <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary inline-block mr-1 flex-shrink-0 animate-pulse" title="Chưa xem"></span>
                        )}
                        <span className="truncate">{his.name}</span>
                        <span className="text-[7px] sm:text-[9px] text-gray-500 font-normal ml-1 flex-shrink-0">→ Quay lại</span>
                      </span>
                      <span className="font-mono text-[8px] sm:text-[10px] text-gray-550 truncate mt-0.5">{his.matchInfo || 'Hệ thống'}</span>
                    </div>

                    <div className="flex flex-col items-end flex-shrink-0 space-y-0.5 ml-1">
                      <span className={`px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded text-[6px] sm:text-[9px] font-black uppercase ${his.isSuccess ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {his.isSuccess ? 'Xong' : 'Lỗi'}
                      </span>
                      <span className="text-[7px] sm:text-[9px] text-gray-500 font-medium">{formatTimeAgo(his.timestamp)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center text-gray-500 text-[9px] sm:text-[11px]">
                Chưa ghi nhận lịch sử thao tác nào
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
