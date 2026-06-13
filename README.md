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
* Giao diện quản trị cấu hình AI & RAG trực quan.
* Quản lý danh sách AI Models hoạt động, sắp xếp thứ tự ưu tiên bằng nút di chuyển (Up/Down) và bật/tắt linh hoạt.
* Quản lý thứ tự ưu tiên của các Search Engines (Tavily, Brave, Serper) và thêm/xóa/bật/tắt API Keys của từng Engine.
* Toàn bộ cấu hình được lưu trữ bền vững vào **SQLite Database** (`worldcup_predictions.db`), hoàn toàn loại bỏ việc sử dụng biến môi trường cứng trong mã nguồn.

### 4. Tự Động Cập Nhật Kết Quả & Chấm Điểm
* Tự động quét internet để tìm tỉ số, phạt góc, thẻ phạt thực tế của trận đấu sau khi diễn ra.
* Đối chiếu kết quả và chấm điểm (Đúng/Sai/Hòa tiền) cho toàn bộ các kèo dự đoán trước đó.
* Đồng bộ hóa tỉ số trực tuyến ngược vào file dữ liệu cấu trúc [fixtures.json](file:///d:/Projects/Football_Predict/src/data/fixtures.json) và hiển thị trực tiếp lên giao diện trang chủ với các nhãn màu sinh động.

### 5. Hệ Thống Dự Đoán Hybrid Chuyên Sâu (Poisson + AI Consensus)
* **Mô hình Phân phối Poisson:** Tự động tính số bàn thắng kỳ vọng (xG) và xác suất Thắng - Hòa - Thua (1X2) của 2 đội làm baseline định lượng. Áp dụng hệ số lợi thế sân nhà (+0.3 xG) cho 3 nước chủ nhà (Mexico, Canada, USA) khi thi đấu tại nước họ.
* **Consensus Engine (Đồng thuận đa mô hình):** Gửi prompt dự đoán song song đến 2 AI Models hàng đầu đang bật để lấy trung bình cộng xác suất thắng/hòa/thua, tối ưu độ tin cậy.
* **Prompting Nâng Cao:** Sử dụng Few-Shot mẫu nhận định, ép AI suy luận chiến thuật logic chi tiết (Chain of Thought - CoT) trước khi đưa ra kết luận tỷ số.

### 6. Quản Lý Thực Lực 48 Đội Tuyển & Đồng Bộ Stats (AI/Search)
* **Cơ sở dữ liệu Đội tuyển:** Lưu trữ FIFA Rank, ELO Rating, phong độ gần đây, bàn thắng/thua trung bình 10 trận, danh sách ngôi sao, phân tích chiến thuật của 48 đội tuyển World Cup 2026.
* **Chỉnh sửa thủ công (Manual Update):** Tab quản lý đội tuyển trong trang `/admin` cho phép tìm kiếm, lọc theo bảng đấu và chỉnh sửa nhanh chỉ số bằng Modal Glassmorphism.
* **Đồng bộ tự động bằng AI/Search:**
  - Trên trang `/stats`: Panel chọn nhanh đội tuyển và click cập nhật chỉ số tự động từ Internet bằng RAG Search và AI Gemini.
  - Trên Trang chủ: Nút **"⚡ Stats AI"** (Grid View) và icon **📊** (List View) trên Card trận đấu cho phép đồng bộ song song chỉ số thực lực của 2 đội bóng, đi kèm Toast thông báo glassmorphism.

### 7. Caching Kết Quả & Mô Phỏng Monte Carlo 10,000 Lần
* **Cơ chế Caching 24 giờ:** Tự động lưu trữ kết quả dự đoán vào SQLite và trả về tức thì ở những lần gọi sau. Tự động vô hiệu hóa cache nếu chỉ số thực lực của bất kỳ đội tuyển nào thay đổi.
* **Mô phỏng Monte Carlo 10,000 lần:** Giả lập trận đấu 10,000 lần trực tuyến bằng toán học Poisson để tính xác suất động (thập phân), tỷ lệ BTTS, Tài Xỉu, và xếp hạng 5 tỷ số dễ xảy ra nhất.
* **Giao diện trực quan cao cấp:** Hiển thị biểu đồ phân phối Monte Carlo, nhãn trạng thái Cache rõ ràng và nút làm mới dự đoán bằng AI.

### 8. Tự Động Quy Đổi & Hiển Thị Giờ Việt Nam (UTC+7)
* **Timezone Converter Helper:** Xây dựng cơ chế tự động phát hiện múi giờ địa phương dựa trên địa điểm thi đấu (`venue`) của 16 sân vận động World Cup 2026 và các trận giao hữu ở châu Âu, quy đổi chuẩn xác sang giờ Việt Nam (UTC+7).
* **Hiển thị song song thông minh:** Thiết kế hiển thị giờ Việt Nam nổi bật làm chủ đạo trên trang chủ (Grid/List) và hiển thị song song giờ VN cùng giờ địa phương tại header chi tiết trận đấu giúp dễ dàng đối chiếu.
* **Đồng bộ Sắp xếp & Hydration Safety:** Sắp xếp danh sách trận đấu trên trang chủ chạy tuyến tính chuẩn xác theo ngày giờ Việt Nam thực tế, đồng thời triệt tiêu hoàn toàn lỗi Hydration Mismatch đặc thù của Next.js SSR.

### 9. Dự Đoán Hiệp 1 & Hiệp 2 (Chuyên Sâu)
* Hỗ trợ dự đoán và phân tích chiến thuật chuyên biệt riêng cho **Hiệp 1 (First Half)** hoặc **Hiệp 2 (Second Half)**.
* Thuật toán Poisson tự động chia nhỏ tỷ lệ Lambda theo từng hiệp đấu (Hiệp 1: góc * 0.47, thẻ * 0.35, lambda * 0.45; Hiệp 2: góc * 0.53, thẻ * 0.65, lambda * 0.55).
* Mô phỏng Monte Carlo Hiệp 2 tự động tích lũy và cộng dồn tỷ số Hiệp 1 thực tế để đảm bảo kết quả giả lập cả trận đồng bộ.
* Chấm điểm cược động và phân tách biểu đồ thống kê hiệu suất (đúng tỷ số & đúng kết quả 1X2) của AI độc lập theo loại dự đoán.

---

## 💻 Công Nghệ Sử Dụng

* **Frontend/Backend:** Next.js (App Router), React, TailwindCSS.
* **Database:** SQLite (sqlite3 & open) lưu trữ cấu hình hệ thống, thông tin đội tuyển và lịch sử dự đoán.
* **AI Model:** Google Gemini API (hỗ trợ xoay vòng và đồng thuận gemini-3.5-flash, gemini-3-flash-preview, ...).
* **RAG Search APIs:** Tavily API, Brave Search API, Serper API, DuckDuckGo Web Scraper.

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Cài đặt các gói phụ thuộc:
```bash
npm install
```

### 2. Thiết lập cơ sở dữ liệu và seed dữ liệu ban đầu:
Hệ thống sẽ tự động khởi tạo file database `worldcup_predictions.db`, chạy các migrations và nhập (seeding) dữ liệu cấu hình và 48 đội tuyển mặc định trong lần khởi chạy đầu tiên.

### 3. Chạy môi trường phát triển:
```bash
npm run dev
```

### 4. Truy cập giao diện:
* Trang chủ: [http://localhost:3000](http://localhost:3000)
* Trang thống kê & gợi ý kèo (BA): [http://localhost:3000/stats](http://localhost:3000/stats)
* Trang quản trị & cấu hình: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🛠️ Nhật Ký Thay Đổi (Changelog)

### [2026-06-13] - Dự đoán Hiệp 1 & Hiệp 2, tích hợp form cập nhật thủ công (v1.9.0)
* **Tính năng dự đoán Hiệp 1 và Hiệp 2:** Dự đoán, lưu trữ và thống kê hiệu suất riêng biệt.
* **Cập nhật tỷ lệ Poisson:** Hiệp 1 (góc * 0.47, thẻ * 0.35, lambda * 0.45); Hiệp 2 (góc * 0.53, thẻ * 0.65, lambda * 0.55 + cộng dồn tỷ số H1 thực tế).
* **Tích hợp form cập nhật thủ công:** Cho phép admin nhập tỷ số cả trận và tỷ số hiệp 1 thực tế trên trang chi tiết trận đấu để chấm cược.
* **Sửa lỗi lệch tham số INSERT SQLite:** Xóa bỏ 1 dấu hỏi chấm `?` bị thừa trong câu lệnh `INSERT INTO predictions` của API Predict, giúp lưu trữ dự đoán thành công vào database mà không bị crash.

### [2026-06-12] - Gỡ bỏ xác thực Admin trên Production & Tự động chấm cược (v1.8.0)
* **Gỡ bỏ xác thực Admin:** Loại bỏ hoàn toàn password gate trên môi trường production.
* **Tự động chấm cược:** AI tự động đọc tỷ số thực tế từ fixtures.json để chấm điểm cược khi dự đoán trận đấu quá khứ.

### [2026-06-11] - Tính năng đồng bộ cấu hình nhanh và sửa lỗi dự đoán (v1.7.1)
* **Tính năng đồng bộ cấu hình nhanh:** Bổ sung tùy chọn đồng bộ nhanh các cài đặt và khóa chức năng từ hệ thống máy chủ vào ứng dụng thông qua giao diện quản trị, tự động loại bỏ các cài đặt trùng lặp để tối ưu hóa hiệu năng.
* **Khắc phục lỗi dự đoán:** Sửa lỗi phân tích trận đấu bị gián đoạn và không hiển thị kết quả khi chạy thực tế.

### [2026-06-07] - Nạp 50 trận đấu CLB mới, bộ lọc Mùa giải, Cải tiến Logic Handicap & Phạt góc & Chống Look-ahead Bias (v1.7.0)
* **Tích hợp 50 trận đấu thực tế mới**: Thêm 30 trận EPL và 20 trận La Liga mùa giải 2024-2025 vào dữ liệu. Bổ sung thuộc tính `season` cho toàn bộ 187 trận đấu trong `fixtures.json`.
* **Bộ lọc mùa giải trên Trang chủ**: Thiết kế bộ lọc Mùa giải (Season Filter) cạnh dropdown Giải đấu, hỗ trợ khôi phục/lưu `localStorage` (`homepage_season_filter`) và UX Gating tự động reset tránh màn hình trống.
* **Cải tiến logic cược Handicap & Phạt góc**: Lưu mốc chấp nhà cái `handicap_line` vào SQLite, bắt buộc AI đối chiếu tỉ số dự đoán để khuyên dùng kèo Handicap chuẩn xác; tích hợp kịch bản phạt góc (wing-play/tiki-taka) và thẻ phạt (knock-out/derby) vào prompt.
* **Mốc neo Poisson cứng**: Ép AI bắt buộc phải lấy tỷ số Poisson thô làm điểm tựa thực lực, mọi điều chỉnh tỷ số sau đó chỉ được phép dao động tối đa **±1 bàn**.
* **Chống rò rỉ dữ liệu tương lai (Look-ahead Bias)**: Phát triển cơ chế tự động tái dựng chỉ số lịch sử (`recent_form`, `asian_handicap_form`, bàn thắng trung bình) của hai đội tại thời điểm trước ngày diễn ra trận đấu dựa trên dữ liệu các trận đã đấu trước đó trong `fixtures.json` khi chạy Backtest các trận đấu quá khứ.
* **Quản lý ELO an toàn & Phân biệt CLB/ĐTQG**: Phân biệt query search internet cho CLB (`club`) và ĐTQG (`national team`). Tích hợp logic validate ELO trong khoảng `1000 - 2500` để tránh việc AI cào nhầm thứ hạng thế giới thành điểm ELO.
* **Cập nhật UI Stats hiển thị 4 trường mới**: Panel kết quả cập nhật AI tại trang Thống kê hiển thị phạt góc trung bình, lối chơi dịch nghĩa và phong độ handicap dạng vòng tròn màu (W/D/L) có cơ chế optional chaining chống crash giao diện.
* **Sửa lỗi Quota Exceeded (429) ở kết quả tự động**: Tái sử dụng API Key/Model đã chạy thành công trước đó trong tiến trình Self-Retrospective, và bỏ qua việc gọi AI tạo bài học mới nếu đã tồn tại `match_id` trong DB.
* **Logo và cờ Câu lạc bộ**: Tự động render logo tròn từ CDN cho các câu lạc bộ (EPL & La Liga) thay vì cờ quốc gia.

### [2026-06-07] - Tăng cỡ mẫu qua dữ liệu Euro 2024 & Bộ lọc giải đấu (v1.6.0)
* **Dữ liệu thực tế Euro 2024:** Nhập 51 trận đấu có sẵn tỉ số thực tế của Euro 2024 dưới dạng trận test (`isTest: true`).
* **Bộ lọc giải đấu trang chủ & thống kê:** Thêm bộ lọc dropdown chọn giải đấu (World Cup 2026 / Euro 2024) ở cả trang chủ và thống kê giúp dễ dàng phân loại, theo dõi hiệu suất.
* **Bảng điều khiển Backtesting:** Xây dựng Tab Backtest trong `/admin` với cơ chế Client-Driven Loop gọi API tuần tự (delay 2s), tắt RAG Search chống rò rỉ kết quả và chạy Fast Mode (Gemini Flash) tiết kiệm chi phí.
* **Tài liệu hóa:** Cập nhật CHANGELOG.md và README.md lên phiên bản v1.6.0.
* **Sửa lỗi chấm điểm Backtest:** Sửa lỗi logic hiển thị Đúng/Sai ở Client-side admin page và chuẩn hóa cấu trúc kết quả tự động.

### [2026-06-06] - Tích hợp 4 Option nâng cấp độ tin cậy AI & Cơ chế Model Rotation (v1.5.0)
* **Consensus đa tác nhân & Groq API:** Tích hợp Groq REST API, chạy song song Gemini + Groq tạo bản nháp và dùng Gemini làm trọng tài phản biện Critic.
* **Model Rotation (Xoay vòng AI Models):** Tự động chuyển đổi sang mô hình có độ ưu tiên thấp hơn tiếp theo nếu mô hình ưu tiên trước gặp lỗi (413, 429, 503), đi kèm Cool Down thông minh 5 phút.
* **Tự động rút kinh nghiệm (Self-Retrospective):** Tự động phân tích lý do đoán sai kèo và ghi nhận bài học kinh nghiệm vào database để phục vụ In-Context Learning.
* **ELO Scraper thời gian thực:** Quét internet cập nhật ELO và FIFA Rank của đội tuyển trước khi dự đoán.
* **Hybrid ML Model:** Viết thuật toán Logistic Regression & Naive Bayes bằng JS thuần tính toán xác suất baseline định lượng.
* **Sửa lỗi Admin panel:** Sửa lỗi sập trang Admin (ReferenceError) liên quan đến `newKeyProvider` và `newModelProvider`.
* **Đồng bộ nhãn header:** Format trực quan thông tin mô hình đồng thuận (`Đa tác nhân: Gemini... + Groq...`) và hiển thị động trên Header của trang chi tiết.

### [2026-06-06] - Cập nhật Cache dự đoán & Mô phỏng Monte Carlo 10,000 lần (v1.4.0)
* **Cơ chế Caching thông minh (SQLite):** Lưu trữ kết quả dự đoán trận đấu, tự động bypass cache nếu quá 24h hoặc nếu chỉ số của 2 đội bóng thay đổi trong database.
* **Mô phỏng Monte Carlo:** Triển khai thuật toán Knuth ngẫu nhiên Poisson chạy 10,000 lần để tính toán xác suất 1X2 động, BTTS, Tài Xỉu, và top 5 tỉ số khả thi nhất. Tích hợp dữ liệu mô phỏng này vào Prompt AI làm thông tin định lượng đầu vào.
* **Giao diện Modal Dự Đoán Nâng Cao:** Thiết kế Panel Monte Carlo trực quan cao cấp, hiển thị nhãn cache rõ ràng và thêm nút bấm **"🔄 Phân tích lại"** để người dùng làm mới dự đoán AI bất cứ lúc nào.
* **Tài liệu hóa:** Cập nhật CHANGELOG.md và README.md lên phiên bản 1.4.0.

### [2026-06-06] - Cập nhật đồng bộ Stats AI/Search & Thống kê
* **Tính năng mới:** Phát triển API `/api/admin/teams/ai-update` cho phép cập nhật chỉ số đội tuyển từ Internet (FIFA Rank, ELO, Goals, Form, Stars, Tactics) bằng AI Gemini kết hợp Search RAG.
* **Giao diện trang Stats:** Bổ sung Panel "Đồng bộ Stats bằng AI & Search" cho phép chọn nhanh đội tuyển từ danh sách để chạy đồng bộ.
* **Giao diện Trang chủ:** Bổ sung nút **"⚡ Stats AI"** (Grid view) và **📊** (List view) trên mỗi Card trận đấu giúp cập nhật stats nhanh của 2 đội bóng song song, đi kèm Toast thông báo glassmorphism cao cấp.
* **Tài liệu:** Khởi tạo tài liệu [walkthrough.md](file:///C:/Users/Admin/.gemini/antigravity-ide/brain/057d7df7-a0a7-45e4-aee3-bf2a9fdf7082/walkthrough.md) và [task.md](file:///C:/Users/Admin/.gemini/antigravity-ide/brain/057d7df7-a0a7-45e4-aee3-bf2a9fdf7082/task.md) để theo dõi tiến độ và nghiệm thu.

### [2026-06-05] - Cập nhật Hybrid AI Predictor & Quản lý đội tuyển SQLite
* **SQLite teams Schema & Seeding:** Khởi tạo bảng `teams` trong SQLite và seed dữ liệu chi tiết cho 48 đội tuyển World Cup 2026.
* **Poisson Model:** Xây dựng thuật toán phân phối Poisson tính xG và xác suất trận đấu làm baseline định lượng cho AI, áp dụng hệ số sân nhà (+0.3 xG) cho Mexico, Canada, USA.
* **Consensus Engine:** Triển khai Multi-Model Consensus Engine gọi song song 2 models AI hàng đầu để lấy tỷ lệ xác suất đồng thuận.
* **Admin nâng cấp:** Thêm Tab "Quản lý đội tuyển" trong `/admin` và Modal Glassmorphism cho phép chỉnh sửa thủ công (Manual Update).
* **Đồng bộ lịch thi đấu:** Đồng bộ 48 trận đấu vòng bảng chính thức vào [fixtures.json](file:///d:/Projects/Football_Predict/src/data/fixtures.json), sửa cờ Ivory Coast và khắc phục triệt để lỗi cờ trắng.
* **Trang thống kê:** Xây dựng trang `/stats` thống kê hiệu suất dự đoán lịch sử của AI và gợi ý kèo ngon BA (Bet Analyst) tự động.
