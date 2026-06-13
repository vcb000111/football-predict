'use client';

export default function AdminPasswordModal({
  show,
  passwordInput,
  setPasswordInput,
  passwordError,
  verifyingPassword,
  onSubmit
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="bg-[#0b1220]/90 border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 backdrop-filter backdrop-blur-xl animate-fade-in">
        <div className="text-center space-y-4">
          <span className="text-4xl block">🛡️</span>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Xác thực mật khẩu admin</h2>
          <p className="text-[11px] text-gray-500">
            Hệ thống đang chạy trên môi trường sản xuất. Vui lòng nhập mật khẩu để quản trị hệ thống.
          </p>
          <form onSubmit={onSubmit} className="space-y-4 pt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full bg-[#070b14] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white text-center focus:outline-none focus:border-primary/80 transition-colors"
              autoFocus
            />
            {passwordError && (
              <p className="text-[10px] text-rose-450 font-semibold">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={verifyingPassword || !passwordInput}
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-gray-800 disabled:opacity-50 text-black text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              {verifyingPassword ? 'Đang xác thực...' : 'Xác nhận'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
