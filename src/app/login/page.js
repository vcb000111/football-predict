'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      if (err === 'env_missing') {
        setError('Thiếu cấu hình biến môi trường Google OAuth.');
      } else if (err === 'token_failed') {
        setError('Không thể lấy mã thông báo truy cập từ Google.');
      } else if (err === 'profile_failed') {
        setError('Không thể lấy thông tin người dùng từ Google.');
      } else if (err === 'system_error') {
        setError('Đã xảy ra lỗi hệ thống khi đăng nhập bằng Google.');
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Đăng nhập không thành công.');
      } else {
        setSuccess('Đăng nhập thành công! Đang chuyển hướng...');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1500);
      }
    } catch (err) {
      setError('Kết nối máy chủ thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const res = await fetch('/api/auth/google');
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError('Không thể khởi tạo luồng đăng nhập Google.');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="max-w-md w-full glass-panel p-8 rounded-2xl glow-cyan">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Chào mừng trở lại</h2>
          <p className="text-gray-400 text-sm">Đăng nhập để xem dự đoán AI chi tiết</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-sm">
            {success}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="email">
              Địa chỉ email
            </label>
            <input
              id="email"
              type="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#223147] text-white focus:outline-none focus:border-secondary transition-colors duration-200"
              placeholder="ten@viethu.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="password">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#223147] text-white focus:outline-none focus:border-secondary transition-colors duration-200"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-secondary hover:bg-secondary/90 text-white font-medium transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-lg glow-cyan/10"
          >
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#223147]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[#151E2E] text-gray-400">Hoặc tiếp tục với</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-[#223147] text-white font-medium transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5.04c1.67 0 3.2.58 4.39 1.71l3.27-3.27C17.69 1.54 15.03 1 12 1 7.24 1 3.2 3.73 1.24 7.72l3.89 3.01C6.07 7.74 8.78 5.04 12 5.04z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.57l3.73 2.89c2.18-2.01 3.7-4.97 3.7-8.62z"
            />
            <path
              fill="#FBBC05"
              d="M5.13 14.73c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.24 7.14C.45 8.72 0 10.49 0 12.37c0 1.88.45 3.65 1.24 5.23l3.89-3.01c-.24-.72-.38-1.49-.38-2.29z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.89c-1.1.74-2.51 1.18-4.23 1.18-3.22 0-5.93-2.7-6.87-5.69L1.24 15.7C3.2 19.69 7.24 23 12 23z"
            />
          </svg>
          <span>Đăng nhập bằng Google</span>
        </button>

        <p className="mt-8 text-center text-sm text-gray-400">
          Chưa có tài khoản?{' '}
          <Link href="/signup" className="text-secondary hover:underline">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
