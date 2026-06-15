'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function UserNav() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
    // Lắng nghe sự kiện để reload user khi đăng nhập thành công
    window.addEventListener('auth-state-changed', fetchUser);
    return () => {
      window.removeEventListener('auth-state-changed', fetchUser);
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setUser(null);
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error('Lỗi đăng xuất:', err);
    }
  };

  if (loading) {
    return <div className="h-8 w-24 bg-card-border/50 rounded-lg animate-pulse"></div>;
  }

  if (user) {
    return (
      <div className="flex items-center space-x-4">
        <span className="text-gray-300 text-sm font-medium">
          Chào, <span className="text-primary font-bold">{user.username}</span>
        </span>
        <button
          onClick={handleLogout}
          className="text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-card-border hover:bg-[#1E293B] transition-colors duration-200 cursor-pointer"
        >
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      <Link
        href="/login"
        className="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors duration-200"
      >
        Đăng nhập
      </Link>
      <Link
        href="/signup"
        className="text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-3.5 py-1.5 rounded-lg transition-colors duration-200 shadow-md glow-green/5"
      >
        Đăng ký
      </Link>
    </div>
  );
}
