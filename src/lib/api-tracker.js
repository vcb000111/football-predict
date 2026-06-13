'use client';

import { useState, useEffect } from 'react';

// Class quản lý danh sách và trạng thái các API request
class ApiRequestTracker {
  constructor() {
    this.activeRequests = new Map();
    this.historyRequests = [];
    this.listeners = new Set();
    this.counter = 0;
  }

  // Đọc lịch sử từ localStorage sau khi client mount
  initHistory() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('api_activity_history');
        if (stored) {
          this.historyRequests = JSON.parse(stored);
        }
      } catch (e) {
        console.error('Lỗi khi đọc api_activity_history:', e);
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Trả về hàm unsub
    return () => this.listeners.delete(listener);
  }

  notify() {
    const activeList = Array.from(this.activeRequests.values());
    this.listeners.forEach(listener => listener({
      active: activeList,
      history: this.historyRequests
    }));
  }

  // Dịch URL API thô sang tên thao tác tiếng Việt thân thiện
  translateUrl(url, method) {
    const cleanUrl = url.split('?')[0];
    
    // So khớp các tác vụ chi tiết trước
    if (cleanUrl.includes('/api/admin/backtest')) {
      return 'Chạy kiểm thử Backtest';
    }
    if (cleanUrl.includes('/api/admin/teams/ai-update')) {
      return 'AI cập nhật ELO đội bóng';
    }
    if (cleanUrl.includes('/api/fixtures/import')) {
      return 'Import lịch thi đấu';
    }
    if (cleanUrl.includes('/api/fixtures/sync')) {
      return 'Đồng bộ lịch thi đấu';
    }
    if (cleanUrl.includes('/api/predict')) {
      return 'Dự đoán trận đấu';
    }
    if (cleanUrl.includes('/api/match/chat')) {
      return 'Hỏi đáp AI trận đấu';
    }
    if (cleanUrl.includes('/api/results')) {
      return 'Cập nhật tỷ số';
    }
    if (cleanUrl.includes('/api/admin/config')) {
      return 'Cấu hình AI';
    }
    if (cleanUrl.includes('/api/admin/prompts')) {
      return 'Cập nhật System Prompt';
    }
    if (cleanUrl.includes('/api/admin/teams')) {
      return 'Cập nhật ELO đội bóng';
    }
    
    // Thao tác mặc định nếu không khớp
    return `${method} ${cleanUrl.replace('/api/', '')}`;
  }

  // Chỉ ghi nhận lịch sử cho các thao tác chủ động chính
  shouldRecordHistory(url) {
    const cleanUrl = url.split('?')[0];
    return (
      cleanUrl.includes('/api/predict') ||
      cleanUrl.includes('/api/match/chat') ||
      cleanUrl.includes('/api/results') ||
      cleanUrl.includes('/api/admin/') ||
      cleanUrl.includes('/api/fixtures/')
    );
  }

  addRequest(url, method, pathname) {
    this.counter++;
    const id = this.counter;
    const requestName = this.translateUrl(url, method);
    
    this.activeRequests.set(id, {
      id,
      url,
      method,
      name: requestName,
      pathname,
      startTime: Date.now()
    });
    
    this.notify();
    return id;
  }

  removeRequest(id, isSuccess = true) {
    if (this.activeRequests.has(id)) {
      const req = this.activeRequests.get(id);
      this.activeRequests.delete(id);

      // Thêm vào lịch sử nếu thỏa mãn bộ lọc
      if (this.shouldRecordHistory(req.url)) {
        const historyItem = {
          id: req.id + '_' + Date.now(),
          name: req.name,
          url: req.url,
          method: req.method,
          pathname: req.pathname,
          duration: Date.now() - req.startTime,
          timestamp: Date.now(),
          isSuccess
        };

        // Đẩy vào đầu mảng lịch sử, giới hạn 7 phần tử
        this.historyRequests = [historyItem, ...this.historyRequests].slice(0, 7);

        // Lưu vào localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('api_activity_history', JSON.stringify(this.historyRequests));
          } catch (e) {}
        }
      }

      this.notify();
    }
  }
}

export const apiTracker = new ApiRequestTracker();

// Override Fetch Interceptor toàn cục
let isIntercepted = false;
export function useApiInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined' || isIntercepted) return;

    // Load lịch sử ban đầu từ localStorage
    apiTracker.initHistory();

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'API Request');
      const options = args[1] || {};
      const method = options.method || 'GET';

      // Chỉ theo dõi các API nội bộ bắt đầu bằng /api/
      const isInternalApi = url.includes('/api/');
      let requestId = null;

      if (isInternalApi) {
        // Lưu pathname trang hiện tại phát sinh request
        const currentPath = window.location.pathname + window.location.search;
        requestId = apiTracker.addRequest(url, method, currentPath);
      }

      let isSuccess = false;
      try {
        const response = await originalFetch(...args);
        isSuccess = response.ok;
        return response;
      } catch (err) {
        isSuccess = false;
        throw err;
      } finally {
        if (requestId !== null) {
          apiTracker.removeRequest(requestId, isSuccess);
        }
      }
    };

    isIntercepted = true;
  }, []);
}
