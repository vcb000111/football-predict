import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/lib/auth-helper.js';

console.log('🧪 Bắt đầu kiểm thử Auth Helper...');

// 1. Test Password Hashing
const rawPassword = 'TonyMinhSuperSecure2026';
const hashed = hashPassword(rawPassword);
console.log('- Mật khẩu băm:', hashed);

const isMatch = verifyPassword(rawPassword, hashed);
console.log('- So khớp mật khẩu đúng:', isMatch ? '✅ Đạt' : '❌ Thất bại');

const isWrongMatch = verifyPassword('wrong_password', hashed);
console.log('- So khớp mật khẩu sai (kết quả mong đợi false):', !isWrongMatch ? '✅ Đạt' : '❌ Thất bại');

// 2. Test JWT Sign & Verify
const payload = { userId: 42, username: 'tony_minh', email: 'tony@predict.com' };
const token = signToken(payload, 5); // token sống 5 giây
console.log('- Token đã sinh:', token);

const decoded = verifyToken(token);
console.log('- Giải mã token:', decoded ? '✅ Thành công' : '❌ Thất bại');
if (decoded) {
  console.log(`  + User ID: ${decoded.userId} (Mong đợi: 42)`);
  console.log(`  + Username: ${decoded.username} (Mong đợi: tony_minh)`);
}

// Test Token Expiry
console.log('- Đang đợi 6 giây để kiểm tra token hết hạn...');
setTimeout(() => {
  const expiredDecoded = verifyToken(token);
  console.log('- Giải mã token đã hết hạn (kết quả mong đợi null):', expiredDecoded === null ? '✅ Đạt (Đã hết hạn)' : '❌ Thất bại (Token vẫn dùng được)');
  
  if (isMatch && !isWrongMatch && decoded && expiredDecoded === null) {
    console.log('🎉 TẤT CẢ KIỂM THỬ AUTH FLOW ĐỀU ĐẠT!');
    process.exit(0);
  } else {
    console.error('❌ CÓ BƯỚC KIỂM THỬ THẤT BẠI!');
    process.exit(1);
  }
}, 6000);
