# 🏆 FIFA World Cup 2026 AI Predictor & Sports Analytics

Hệ thống dự đoán kết quả bóng đá và phân tích kèo đấu thông minh dành cho FIFA World Cup 2026. Ứng dụng kết hợp sức mạnh của các mô hình ngôn ngữ lớn (LLM - Google Gemini) và kỹ thuật RAG (Retrieval-Augmented Generation) đa nguồn để cập nhật thông tin thời gian thực và chấm điểm tự động.

---

## 🌟 Tính Năng Nổi Bật

### 1. Phân Tích & Dự Đoán Kèo Đấu Chuyên Sâu
* Hỗ trợ dự đoán **6 loại kèo phổ biến**:
  * Kèo châu Âu (1X2)
  * Kèo Tài Xỉu bàn thắng (Over/Under 2.5)
  * Kèo Chấp châu Á (Asian Handicap)
  * Cả hai đội ghi bàn (BTTS)
  * Kèo Phạt góc (Over/Under)
  * Kèo Thẻ phạt (Over/Under)
* Cung cấp phân tích chi tiết của AI Pundit (Chuyên gia nhận định ảo) dựa trên phong độ, lịch sử đối đầu và chấn thương.

### 2. Hệ Thống RAG Search Đa Nguồn Động
* Tích hợp 3 dịch vụ API tìm kiếm thời gian thực tốt nhất hiện nay:
  * **Tavily Search API** (API chuyên dụng tối ưu cho RAG).
  * **Brave Search API** (API tìm kiếm toàn cầu độc lập chất lượng cao).
  * **Serper Google Search API** (Google Search siêu nhanh).
* **Cơ chế Xoay Vòng & Dự phòng (Rotation & Failover):**
  * Cho phép thêm nhiều API Keys cho mỗi nhà cung cấp.
  * Tự động xoay vòng key khi gặp lỗi hạn mức hoặc lỗi mạng.
  * Tự động chuyển đổi sang nhà cung cấp kế tiếp nếu nhà cung cấp hiện tại lỗi toàn bộ.
  * Tự động fallback về DuckDuckGo Scraper làm dự phòng cuối cùng.

### 3. Trang Quản Trị Cấu Hình Tập Trung (`/admin`)
* Cho phép cấu hình trực tiếp các API Keys của Google Gemini.
* Quản lý danh sách AI Models hoạt động, sắp xếp thứ tự ưu tiên bằng nút di chuyển (Up/Down) và bật/tắt linh hoạt.
* Quản lý thứ tự ưu tiên của các Search Engines (Tavily, Brave, Serper) và thêm/xóa/bật/tắt API Keys của từng Engine.
* Toàn bộ cấu hình được lưu trữ bền vững vào **SQLite Database** (`worldcup_predictions.db`), hoàn toàn loại bỏ việc sử dụng biến môi trường cứng trong mã nguồn.

### 4. Tự Động Cập Nhật Kết Quả & Chấm Điểm
* Tự động quét internet để tìm tỉ số, phạt góc, thẻ phạt thực tế của trận đấu sau khi diễn ra.
* Đối chiếu kết quả và chấm điểm (Đúng/Sai/Hòa tiền) cho toàn bộ các kèo dự đoán trước đó.
* Đồng bộ hóa tỉ số trực tuyến ngược vào file dữ liệu cấu trúc [fixtures.json](file:///d:/Projects/Football_Predict/src/data/fixtures.json) và hiển thị trực tiếp lên giao diện trang chủ với các nhãn màu sinh động.

---

## 💻 Công Nghệ Sử Dụng

* **Frontend/Backend:** Next.js (App Router), React, TailwindCSS.
* **Database:** SQLite (sqlite3 & open) lưu trữ cấu hình hệ thống và lịch sử dự đoán.
* **AI Model:** Google Gemini API (hỗ trợ xoay vòng gemini-2.5-flash, gemini-3.5-flash, ...).
* **RAG Search APIs:** Tavily API, Brave Search API, Serper API.

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Cài đặt các gói phụ thuộc:
```bash
npm install
```

### 2. Thiết lập cơ sở dữ liệu và seed dữ liệu ban đầu:
Hệ thống sẽ tự động khởi tạo file database `worldcup_predictions.db`, chạy các migrations và nhập (seeding) dữ liệu cấu hình mặc định (bao gồm các keys lấy từ `.env.local` nếu có) trong lần khởi chạy đầu tiên.

### 3. Chạy môi trường phát triển:
```bash
npm run dev
```

### 4. Truy cập giao diện:
* Trang chủ: [http://localhost:3000](http://localhost:3000)
* Trang quản trị: [http://localhost:3000/admin](http://localhost:3000/admin)
