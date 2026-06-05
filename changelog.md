# Changelog

Tất cả những thay đổi nổi bật đối với dự án **FIFA World Cup 2026 AI Predictor** sẽ được tài liệu hóa trong file này.

---

## [1.1.0] - 2026-06-06

### Added (Thêm mới)
* **Tự động Cập nhật Kết quả trên Trang chủ:** Tích hợp trực tiếp nút **🤖 Cập nhật** trên mỗi card/dòng trận đấu của trang chủ (cả chế độ Lưới và chế độ Danh sách). Hệ thống sẽ tự động dự đoán trước (nếu chưa có lịch sử) để tạo bản ghi SQLite, sau đó tra cứu trực tuyến bằng AI + Google Search để chấm điểm.
* **Đồng bộ hóa kết quả vào `fixtures.json`:** Điểm số thực tế sau khi cập nhật tự động (hoặc thủ công) sẽ được ghi đè trực tiếp vào file dữ liệu cấu trúc [fixtures.json](file:///d:/Projects/Football_Predict/src/data/fixtures.json) để lưu trữ bền vững.
* **Hiển thị tỉ số trực tiếp ở trang chủ:** Hiển thị tỉ số thực tế dạng `2 - 1` và nhãn `FT` (đã kết thúc) thay thế cho chữ `VS` mặc định đối với các trận đấu đã có kết quả.
* **Đồng bộ hóa Tỉ số SQLite lên Homepage:** Cập nhật trang chủ server-side [page.js](file:///d:/Projects/Football_Predict/src/app/page.js) để lấy các tỉ số thực tế mới nhất từ cơ sở dữ liệu SQLite và tự động merge ngược vào client props, tránh tình trạng cache hoặc mất dữ liệu khi tải lại trang.

### Fixed (Sửa lỗi)
* **Khắc phục lỗi Parse JSON của Gemini AI:**
  * Viết lại hàm `cleanJsonText` nâng cao trong cả 3 route API chính:
    1. [results/auto/route.js](file:///d:/Projects/Football_Predict/src/app/api/results/auto/route.js)
    2. [predict/route.js](file:///d:/Projects/Football_Predict/src/app/api/predict/route.js)
    3. [fixtures/sync/route.js](file:///d:/Projects/Football_Predict/src/app/api/fixtures/sync/route.js)
  * Logic mới sử dụng Regex bóc tách khối mã markdown ` ```json ... ``` ` và dò tìm các cặp dấu ngoặc đóng/mở (`{}` hoặc `[]`) để cắt chính xác chuỗi JSON thô, khắc phục hoàn toàn lỗi `SyntaxError: "undefined" is not valid JSON` do AI trả về lời thoại thừa ở đầu/cuối response.
* **Sửa lỗi lệch mốc thời gian khi tìm kiếm (Temporal Date Shift Fix):**
  * Cập nhật Prompt cho Gemini trong API tra cứu kết quả. Chỉ dẫn AI bỏ qua năm giả lập 2026 của hệ thống và sử dụng Google Search để tìm kiếm trận đối đầu thực tế gần nhất giữa hai đội tuyển (ví dụ các trận đấu giao hữu năm 2024 như *Bồ Đào Nha vs Croatia* ngày 08/06/2024 hay *Pháp vs Canada* ngày 09/06/2024), lấy kết quả đó để chấm điểm.

### Removed (Loại bỏ)
* **Tính năng cập nhật thủ công:** 
  * Loại bỏ hoàn toàn các trường nhập tỉ số thủ công, nút gửi kết quả thủ công, và đường chia ngăn cách trên giao diện chi tiết trận đấu [MatchClient.js](file:///d:/Projects/Football_Predict/src/app/match/%5Bid%5D/MatchClient.js) và giao diện giả lập tự do [page.js (custom)](file:///d:/Projects/Football_Predict/src/app/custom/page.js).
  * Xóa bỏ các state và hàm xử lý liên quan (`handleUpdateResult`) để tối ưu hóa hiệu năng và tránh dead code.

---

## [1.0.0] - 2026-06-05

### Added
* **Hỗ trợ 6 loại kèo cược hoàn chỉnh:** 1X2, Tài Xỉu 2.5, Chấp Châu Á, Cả hai đội ghi bàn (BTTS), Phạt góc (O/U 8.5), Thẻ phạt (O/U 3.5) kèm nhận xét chi tiết của AI Pundit.
* **Lịch sử & Phân tích nhanh tại Trang chủ (Quick Predict):** Phân tích nhanh ngay lập tức và hiển thị kết quả trong modal glassmorphic đẹp mắt.
* **SQLite Database Integration:** Tích hợp SQLite lưu trữ lịch sử dự đoán bền vững và hỗ trợ tự động di chuyển schema (Self-healing migrations).
* **Quản lý & hiển thị Model Gemini đã dùng:** Lưu trữ model Gemini đã chạy thành công gần nhất vào `localStorage` và hiển thị động nhãn trên Header thông qua Component `<ModelBadge />`.
* **Lưu trạng thái bộ lọc trang chủ (State Persistence):** Ghi nhớ tab, tìm kiếm, thứ tự sắp xếp và bộ lọc bảng đấu của người dùng khi tải lại trang.
