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
  translateUrl(url, method, bodyText) {
    const cleanUrl = url.split('?')[0];
    let matchInfo = '';

    // Bóc tách tên hai đội từ body của request
    if (bodyText && typeof bodyText === 'string') {
      try {
        const bodyObj = JSON.parse(bodyText);
        if (bodyObj.homeTeam && bodyObj.awayTeam) {
          matchInfo = `${bodyObj.homeTeam} vs ${bodyObj.awayTeam}`;
          if (bodyObj.matchId && typeof window !== 'undefined') {
            localStorage.setItem(`match_teams_${bodyObj.matchId}`, matchInfo);
          }
        } else if (bodyObj.matchId && typeof window !== 'undefined') {
          const cached = localStorage.getItem(`match_teams_${bodyObj.matchId}`);
          if (cached) matchInfo = cached;
        }
      } catch (e) {}
    }

    // Bóc tách từ document.title nếu đang ở trang chi tiết trận đấu
    if (!matchInfo && typeof window !== 'undefined' && window.location.pathname.startsWith('/match/')) {
      const title = document.title;
      if (title && title.includes(' vs ')) {
        const parts = title.split(' - ');
        if (parts[0].includes(' vs ')) {
          matchInfo = parts[0];
          const matchId = window.location.pathname.split('/').pop();
          if (matchId) {
            localStorage.setItem(`match_teams_${matchId}`, matchInfo);
          }
        }
      }
    }

    // Bóc tách từ URL query parameter nếu có matchId
    if (!matchInfo && typeof window !== 'undefined') {
      try {
        const urlObj = new URL(url, window.location.origin);
        const matchId = urlObj.searchParams.get('matchId');
        if (matchId) {
          const cached = localStorage.getItem(`match_teams_${matchId}`);
          if (cached) matchInfo = cached;
        }
      } catch (e) {}
    }

    const suffix = matchInfo ? `: ${matchInfo}` : '';

    // So khớp các tác vụ chi tiết trước
    if (cleanUrl.includes('/api/admin/backtest')) {
      return 'Chạy kiểm thử Backtest';
    }
    if (cleanUrl.includes('/api/admin/teams/ai-update')) {
      return `AI cập nhật ELO đội bóng${suffix}`;
    }
    if (cleanUrl.includes('/api/fixtures/import')) {
      return 'Import lịch thi đấu';
    }
    if (cleanUrl.includes('/api/fixtures/sync')) {
      return 'Đồng bộ lịch thi đấu';
    }
    if (cleanUrl.includes('/api/predict')) {
      return `Dự đoán trận đấu${suffix}`;
    }
    if (cleanUrl.includes('/api/match/chat')) {
      return `Hỏi đáp AI trận đấu${suffix}`;
    }
    if (cleanUrl.includes('/api/results')) {
      return `Cập nhật tỷ số${suffix}`;
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
    return `${method} ${cleanUrl.replace('/api/', '')}${suffix}`;
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

  addRequest(url, method, pathname, bodyText) {
    this.counter++;
    const id = this.counter;
    const requestName = this.translateUrl(url, method, bodyText);
    
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
        requestId = apiTracker.addRequest(url, method, currentPath, options.body);
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
