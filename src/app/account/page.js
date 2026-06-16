'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Swal from 'sweetalert2';

function AccountContent() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // States cho form đổi mật khẩu
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          // Chưa đăng nhập thì redirect về login
          router.push('/login?redirect=/account');
        }
      } catch (err) {
        console.error('Lỗi tải thông tin user:', err);
        router.push('/login?redirect=/account');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        // Phát sự kiện reload header
        window.dispatchEvent(new Event('auth-state-changed'));
        
        Swal.fire({
          title: 'Đăng xuất thành công',
          text: 'Hẹn gặp lại sếp!',
          icon: 'success',
          background: '#151E2E',
          color: '#fff',
          confirmButtonText: 'Đóng',
          confirmButtonColor: '#10B981',
          customClass: {
            popup: 'border border-[#223147] rounded-2xl shadow-2xl'
          },
          didOpen: () => {
            const container = Swal.getContainer();
            if (container) container.style.zIndex = '999999';
          }
        });
        
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error('Lỗi đăng xuất:', err);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      Swal.fire({
        title: 'Thông báo',
        text: 'Vui lòng điền đầy đủ các trường thông tin.',
        icon: 'warning',
        background: '#151E2E',
        color: '#fff',
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#F59E0B',
        customClass: {
          popup: 'border border-[#223147] rounded-2xl shadow-2xl'
        },
        didOpen: () => {
          const container = Swal.getContainer();
          if (container) container.style.zIndex = '999999';
        }
      });
      return;
    }

    if (newPassword.length < 6) {
      Swal.fire({
        title: 'Lỗi định dạng',
        text: 'Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.',
        icon: 'error',
        background: '#151E2E',
        color: '#fff',
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#06B6D4',
        customClass: {
          popup: 'border border-[#223147] rounded-2xl shadow-2xl'
        },
        didOpen: () => {
          const container = Swal.getContainer();
          if (container) container.style.zIndex = '999999';
        }
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      Swal.fire({
        title: 'Mật khẩu không khớp',
        text: 'Mật khẩu xác nhận không trùng khớp với mật khẩu mới.',
        icon: 'error',
        background: '#151E2E',
        color: '#fff',
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#E11D48',
        customClass: {
          popup: 'border border-[#223147] rounded-2xl shadow-2xl'
        },
        didOpen: () => {
          const container = Swal.getContainer();
          if (container) container.style.zIndex = '999999';
        }
      });
      return;
    }

    setChanging(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        Swal.fire({
          title: 'Đổi mật khẩu thất bại',
          text: data.error || 'Có lỗi xảy ra khi cập nhật mật khẩu.',
          icon: 'error',
          background: '#151E2E',
          color: '#fff',
          confirmButtonText: 'Thử lại',
          confirmButtonColor: '#E11D48',
          customClass: {
            popup: 'border border-[#223147] rounded-2xl shadow-2xl'
          },
          didOpen: () => {
            const container = Swal.getContainer();
            if (container) container.style.zIndex = '999999';
          }
        });
      } else {
        Swal.fire({
          title: 'Đổi mật khẩu thành công',
          text: 'Mật khẩu của sếp đã được cập nhật thành công.',
          icon: 'success',
          background: '#151E2E',
          color: '#fff',
          confirmButtonText: 'Đồng ý',
          confirmButtonColor: '#10B981',
          customClass: {
            popup: 'border border-[#223147] rounded-2xl shadow-2xl'
          },
          didOpen: () => {
            const container = Swal.getContainer();
            if (container) container.style.zIndex = '999999';
          }
        });

        // Reset form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      Swal.fire({
        title: 'Lỗi kết nối',
        text: 'Không thể kết nối đến máy chủ.',
        icon: 'error',
        background: '#151E2E',
        color: '#fff',
        confirmButtonText: 'Đóng',
        confirmButtonColor: '#E11D48',
        customClass: {
          popup: 'border border-[#223147] rounded-2xl shadow-2xl'
        },
        didOpen: () => {
          const container = Swal.getContainer();
          if (container) container.style.zIndex = '999999';
        }
      });
    } finally {
      setChanging(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      let normalizedStr = dateStr;
      if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) {
        normalizedStr = dateStr.replace(' ', 'T') + 'Z';
      }
      const d = new Date(normalizedStr);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 rounded-full border-3 border-card-border border-t-primary animate-spin"></div>
          <span>Đang tải thông tin tài khoản...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const userInitial = user.username ? user.username.charAt(0).toUpperCase() : 'U';

  return (
    <div className="min-h-screen py-8 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14] px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Tiêu đề trang */}
        <div className="text-center mb-8">
          <span className="inline-flex items-center space-x-1.5 bg-primary/10 border border-primary/30 rounded-full px-3 py-1 text-[10px] font-bold text-primary mb-3 tracking-wider uppercase">
            👤 Profile
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Thông tin tài khoản
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-xs sm:text-sm">
            Quản lý thông tin hồ sơ cá nhân và bảo mật tài khoản dự đoán World Cup 2026.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Cột trái: Thông tin tổng quan (5 Cols) */}
          <div className="md:col-span-5 space-y-6">
            <div className="glass-panel rounded-2xl p-6 border border-card-border glow-cyan flex flex-col items-center text-center">
              {/* Avatar giả lập từ chữ cái đầu */}
              <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white text-3xl font-black shadow-lg glow-green/20 mb-4 select-none">
                {userInitial}
              </div>
              
              <h2 className="text-xl font-bold text-white mb-1">{user.username}</h2>
              <p className="text-gray-400 text-sm mb-6">{user.email}</p>

              <div className="w-full space-y-3 pt-4 border-t border-card-border/50 text-left text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Loại tài khoản:</span>
                  <span className="font-bold text-white capitalize">
                    {user.oauthProvider === 'google' ? 'Liên kết Google' : 'Cục bộ (local)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Ngày tham gia:</span>
                  <span className="font-semibold text-white">{formatDate(user.createdAt)}</span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="mt-8 w-full py-2.5 px-4 rounded-xl border border-card-border bg-[#151E2E] hover:bg-[#1E293B] text-white text-xs font-bold transition-all duration-200 cursor-pointer shadow-md"
              >
                Đăng xuất
              </button>
            </div>
          </div>

          {/* Cột phải: Form đổi mật khẩu (7 Cols) */}
          <div className="md:col-span-7">
            {user.oauthProvider === 'local' ? (
              <div className="glass-panel rounded-2xl p-6 border border-card-border glow-green">
                <h3 className="text-base font-bold text-white mb-4 pb-2 border-b border-card-border/50">
                  Đổi mật khẩu bảo mật
                </h3>
                
                <form className="space-y-4" onSubmit={handleChangePassword}>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1" htmlFor="currentPassword">
                      Mật khẩu hiện tại
                    </label>
                    <input
                      id="currentPassword"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#223147] text-white focus:outline-none focus:border-primary transition-colors duration-200 text-sm"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1" htmlFor="newPassword">
                      Mật khẩu mới
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#223147] text-white focus:outline-none focus:border-primary transition-colors duration-200 text-sm"
                      placeholder="Tối thiểu 6 ký tự"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1" htmlFor="confirmPassword">
                      Xác nhận mật khẩu mới
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#223147] text-white focus:outline-none focus:border-primary transition-colors duration-200 text-sm"
                      placeholder="Nhập lại mật khẩu mới"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={changing}
                      className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer shadow-lg glow-green/10"
                    >
                      {changing ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-6 border border-card-border text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center mx-auto text-secondary text-xl">
                  💡
                </div>
                <h3 className="text-base font-bold text-white">Liên kết Google OAuth</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                  Tài khoản của sếp được liên kết và đăng nhập an toàn thông qua Google. Không có mật khẩu cục bộ nào được cấu hình cho tài khoản này.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
        Đang tải trang cá nhân...
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
