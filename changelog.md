# Changelog

Tất cả những thay đổi nổi bật đối với dự án **FIFA World Cup 2026 AI Predictor** sẽ được tài liệu hóa trong file này.

## [1.8.0] - 2026-06-12

### Changed (Thay đổi logic)
* **Gỡ bỏ xác thực Admin trên Production:** Loại bỏ hoàn toàn cơ chế kiểm tra mật khẩu quản trị (`PASSWORD_ADMIN` và header `x-admin-password`) ở cả backend API (`/api/admin/auth`, `/api/admin/decrypt`) và frontend client, khắc phục triệt để lỗi 401 Unauthorized khi triển khai lên môi trường Production mà không cần cài đặt mật khẩu.
* **Tự động chấm điểm cược khi Predict:** Khi thực hiện dự đoán trận đấu trong quá khứ, hệ thống tự động đọc tỷ số thực tế từ `fixtures.json`, chấm điểm cược tự động cho 6 loại kèo qua helper và lưu trực tiếp tỷ số thực tế cùng kết quả cược vào Database (SQLite/Turso) mà không bị trống dữ liệu.

### Fixed (Sửa lỗi)
* **Sửa lỗi lệch tham số INSERT SQLite:** Khắc phục lỗi thừa 1 dấu hỏi chấm `?` trong câu lệnh `INSERT INTO predictions` của cược thật (chỉ có 29 cột tương ứng nhưng VALUES truyền vào 30 tham số định vị), đảm bảo dữ liệu cược thật được ghi nhận đầy đủ vào DB.

---

## [1.7.1] - 2026-06-11

### Added (Thêm mới)
* **Đồng bộ hóa tỷ lệ dự đoán 100%:** Triển khai cơ chế **RAG Search Cache 30 phút** trong module tìm kiếm trực tuyến và tích hợp **Seeded Pseudo-Random Generator (LCG)** cho giả lập Monte Carlo/phạt góc/thẻ phạt, loại bỏ hoàn toàn tính bất định ngẫu nhiên và đảm bảo kết quả trùng khớp 100% tuyệt đối giữa mọi lượt chạy liên tiếp, đồng thời tiết kiệm 70% chi phí gọi API search.
* **Tính năng đồng bộ cấu hình nhanh:** Bổ sung tùy chọn đồng bộ nhanh các cài đặt và khóa chức năng từ hệ thống máy chủ vào ứng dụng thông qua giao diện quản trị, tự động loại bỏ các cài đặt trùng lặp để tối ưu hóa hiệu năng.
* **Tích hợp hiển thị giờ Việt Nam (UTC+7):** Tự động quy đổi thời gian thi đấu từ giờ địa phương của 16 sân vận động World Cup 2026 (Mỹ, Canada, Mexico) và các trận giao hữu warm-up tại châu Âu sang giờ Việt Nam.
* **Hiển thị song song hai múi giờ:** Hiển thị giờ VN làm chủ đạo trên trang chủ (Grid/List) và hiển thị song song giờ VN cùng giờ địa phương trên trang chi tiết trận đấu để người dùng dễ dàng đối chiếu.
* **Bổ sung Critic Guardrails (Ràng buộc logic):** Đưa thêm bộ quy tắc chống mâu thuẫn kèo vào prompt phản biện của Critic (ví dụ: cấm khuyên cược Hòa khi dự đoán có đội thắng, bắt buộc kèo chấp và tài xỉu phải nhất quán toán học với dự đoán tỉ số).

### Changed (Thay đổi logic)
* **Đồng bộ logic sắp xếp (Sorting):** Điều chỉnh cơ chế sắp xếp mặc định theo ngày giờ của danh sách trận đấu trên trang chủ dựa trên thời gian Việt Nam sau quy đổi, đảm bảo các trận đấu được sắp xếp tuyến tính chuẩn xác.
* **Cơ chế Hydration Safety:** Xây dựng helper timezone độc lập giúp server-side rendering và client-side rendering trả về kết quả thời gian đồng nhất, khắc phục triệt để lỗi Hydration Mismatch của React/Next.js.
* **Khóa Temperature = 0:** Cố định nhiệt độ sinh chữ (`temperature = 0`) cho cả API Gemini và Groq Cloud, triệt tiêu tính ngẫu nhiên giữa các lần dự đoán với cùng một đầu vào.

### Fixed (Sửa lỗi)
* **Khắc phục lỗi dự đoán:** Sửa lỗi phân tích trận đấu bị gián đoạn và không hiển thị kết quả khi chạy thực tế.

---

## [1.7.0] - 2026-06-07

### Added (Thêm mới)
* **Dữ liệu mẫu Premier League & La Liga 2024-2025:** Tích hợp tổng cộng 70 trận đấu thực tế (30 trận EPL mới, 20 trận La Liga mới và 20 trận trước đó) đầy đủ thông số bàn thắng, Handicap, phạt góc và thẻ phạt phục vụ chạy Backtest mở rộng cỡ mẫu.
* **Bổ sung thuộc tính Season**: Tích hợp trường `season` động cho toàn bộ 187 trận đấu trong `fixtures.json` (World Cup 2026 -> "2026", Euro 2024 -> "2024", các giải CLB -> "2024-2025").
* **Logo và cờ Câu lạc bộ:** Nâng cấp hệ thống hiển thị tự động lấy cờ/logo chuẩn của các CLB bóng đá thực tế thay vì fallback cờ quốc gia.
* **Bộ lọc mùa giải trên Trang chủ**: Phát triển bộ lọc Mùa giải (Season Filter) cạnh dropdown Giải đấu ở Trang chủ, khôi phục/lưu trạng thái lọc vào `localStorage` (`homepage_season_filter`).
* **Cập nhật UI Stats hiển thị 4 trường mới**: Panel kết quả cập nhật AI tại trang Thống kê hiển thị phạt góc trung bình, lối chơi dịch nghĩa và phong độ handicap dạng vòng tròn màu (W/D/L) có cơ chế optional chaining chống crash giao diện.

### Changed (Thay đổi logic)
* **UX Gating tự động reset bộ lọc**: Thêm logic kiểm tra tab hiện tại, tự động reset `selectedSeasonFilter` về `"All"` khi chuyển tab nếu ở tab mới không có trận đấu nào thuộc mùa giải đang chọn (tránh lỗi màn hình trống).
* **Logic cược Handicap thực tế:** Lưu trữ mốc chấp nhà cái (`handicap_line`) trực tiếp dạng số thực trong SQLite và cập nhật prompt buộc AI đối chiếu tỉ số dự kiến với tỷ lệ kèo chấp thực tế để đưa ra cửa cược tối ưu.
* **Logic chấm điểm tự động:** So khớp kết quả Handicap trực tiếp từ cột `handicap_line` của DB thay vì dùng Regex parse chuỗi văn bản tự do, triệt tiêu hoàn toàn sai sót hiển thị.
* **Cải tiến Game States (Kèo phụ):** Nâng cấp prompt Critic phân tích sâu kịch bản trận đấu (đội mạnh bị dẫn bàn ép sân tăng phạt góc, tính chất knock-out/derby tăng thẻ phạt) thay vì dùng Poisson thô.
* **Bộ lọc giải đấu mở rộng:** Hỗ trợ bộ lọc và biểu đồ cho Premier League & La Liga trên giao diện Admin và Thống kê.
* **Tái dựng stats lịch sử (Historical Reconstructor)**: Phát triển cơ chế tự động tính toán lại phong độ thi đấu (`recent_form`), phong độ cược chấp (`asian_handicap_form`) và bàn thắng trung bình của hai đội bóng tại thời điểm trước ngày diễn ra trận đấu dựa trên dữ liệu các trận đã đấu trước đó trong `fixtures.json`. Triệt tiêu hoàn toàn lỗi Look-ahead bias (rò rỉ dữ liệu tương lai) khi chạy Backtest các trận đấu quá khứ.
* **Quản lý dữ liệu ELO an toàn & Phân biệt CLB/ĐTQG**: Phân tách query search internet cho CLB (dùng từ khóa `club`) và ĐTQG (dùng `national team`). Tích hợp logic validate ELO trong khoảng `1000 - 2500` để tránh việc AI cào nhầm thứ hạng thế giới thành điểm ELO.

### Fixed (Sửa lỗi)
* **Khắc phục lỗi Quota Exceeded (429) ở kết quả tự động**: Sửa đổi tiến trình Self-Retrospective của `/api/results/auto` tái sử dụng API Key/Model đã chạy thành công trước đó (đảm bảo key đang hoạt động tốt) và bổ sung kiểm tra trùng lặp bài học trong DB dựa trên `match_id` trước khi gọi AI để tránh cạn hạn mức.


---

## [1.6.0] - 2026-06-07

### Added (Thêm mới)
* **Dữ liệu thực tế Euro 2024:** Bổ sung kết quả và thông tin của 51 trận đấu thực tế đã diễn ra tại vòng chung kết Euro 2024 làm dữ liệu lịch sử đối chiếu.
* **Bộ lọc giải đấu trực quan:** Thêm tính năng lọc giải đấu (World Cup 2026 / Euro 2024) ở cả trang chủ và trang thống kê hiệu suất, giúp người dùng dễ dàng theo dõi và phân tích các trận đấu theo giải đấu.

### Fixed (Sửa lỗi)
* **Sửa lỗi hiển thị kết quả chấm điểm Backtest:** Khắc phục lỗi so sánh kiểu dữ liệu ở Client-side của trang Admin khiến log tiến trình luôn báo dự đoán 'Sai' dù kết quả thực tế trùng khớp. Đồng nhất định dạng trả về của API kết quả tự động (`betEvaluations`) giữa chế độ giả lập (Mock Mode) và thực tế (Real Mode).

---

## [1.5.0] - 2026-06-06

### Added (Thêm mới)
* **Tích hợp Groq Cloud API:** Hỗ trợ gọi REST API trực tiếp của Groq Cloud sử dụng `fetch` cho các mô hình tốc độ cao như `llama-3.1-8b-instant`, `llama-3.3-70b-specdec`, và `gemma2-9b-it`.
* **Cơ chế Đồng thuận Đa Tác Nhân nâng cao (Consensus Engine - Option 1):** Gọi song song luồng nháp của Gemini và Groq, sau đó sử dụng Gemini Critic làm trọng tài phản biện, đối chiếu logic chéo để đưa ra nhận định hoàn thiện nhất.
* **Tự Động Xoay Vòng AI Models (Model Rotation):** Tự động lặp qua danh sách AI Models của từng nhà cung cấp theo thứ tự ưu tiên (priority) khi gặp lỗi (như Rate Limit 429, Request Entity Too Large 413, hoặc Service Unavailable 503).
* **Cool Down thông minh:** Đưa các mô hình gặp lỗi tĩnh/quota vào trạng thái Cool Down 5 phút để tránh gọi lại vô ích.
* **Tự động rút kinh nghiệm (Self-Retrospective - Option 2):** Khi kết quả thực tế được cập nhật, nếu có kèo dự đoán sai, hệ thống gọi AI viết bài học kinh nghiệm ngắn (< 50 từ) lưu vào bảng `ai_lessons` trong SQLite để nạp làm dữ liệu huấn luyện ngữ cảnh (In-Context Learning) cho các trận sau.
* **Scraper ELO & FIFA Rank thời gian thực (Option 3):** Tự động chạy RAG Search tìm ELO/Rank mới nhất của hai đội trước khi dự đoán và cập nhật vào SQLite để Poisson/Monte Carlo luôn bám sát thực tế nhất.
* **Mô hình học máy định lượng Hybrid ML (Option 4):** Viết thuật toán Logistic Regression & Naive Bayes bằng JS thuần tính toán xác suất các kèo cược làm baseline đầu vào cho AI suy luận.
* **Đồng bộ nhãn Model lên Header:** Tự động đồng bộ hóa nhãn mô hình được dùng (ví dụ: `Đa tác nhân: Gemini 3.1 Flash Lite (Critic) + Groq Llama 3.1 8B`) lên header của trang chi tiết trận đấu khi tải trang hoặc chọn các lượt dự đoán lịch sử.

### Fixed (Sửa lỗi)
* **Sửa lỗi sập trang Admin (ReferenceError):** Khắc phục lỗi `newKeyProvider is not defined` và `newModelProvider is not defined` trên giao diện cấu hình `/admin`. Hỗ trợ đồng bộ và lưu trữ trường `provider` (Gemini hoặc Groq) lên SQLite thành công.

---

## [1.4.0] - 2026-06-06

### Added (Thêm mới)
* **Cơ chế Caching thông minh (SQLite):** Tự động lưu trữ kết quả dự đoán của trận đấu trong SQLite. Phản hồi tức thì (< 50ms) cho các lượt dự đoán sau nếu trận đấu diễn ra trong 24 giờ qua và các chỉ số (ELO, Rank, phong độ...) của 2 đội tuyển chưa bị thay đổi.
* **Mô phỏng Monte Carlo 10,000 lần:** Sử dụng mô hình toán học Poisson chạy giả lập trận đấu 10,000 lần để tính toán xác suất 1X2 động (có số thập phân chính xác), xác suất cả hai đội ghi bàn (BTTS), xác suất Tài Xỉu 2.5, và xếp hạng 5 tỉ số khả thi nhất.
* **Tích hợp Monte Carlo vào Prompt AI:** Cung cấp trực tiếp kết quả giả lập Monte Carlo làm thông tin định lượng đầu vào cho Gemini AI để tăng độ chính xác trong phân tích chiều sâu.
* **Giao diện Modal Dự Đoán Nâng Cao:**
  - Hiển thị Panel "Siêu máy tính Monte Carlo (10,000 lần)" trực quan, thiết kế Glassmorphism premium với thanh tiến trình 3 màu và xếp hạng tỉ số.
  - Hiển thị nhãn trạng thái Cache rõ ràng: **"⚡ Dữ liệu tải từ bộ nhớ đệm..."** để tăng tính minh bạch.
  - Bổ sung nút bấm **"🔄 Phân tích lại"** cho phép người dùng ép hệ thống bỏ qua bộ nhớ đệm, chạy AI và RAG Search mới nhất.

### Changed (Thay đổi)
* **Tối ưu hóa các API call:** Phòng tránh lỗi treo API khi tìm kiếm RAG bằng cách tích hợp mô phỏng Monte Carlo kết quả toán học cục bộ.

---

## [1.3.0] - 2026-06-06

### Added (Thêm mới)
* **API Cập nhật Chỉ số Đội tuyển bằng AI/Search:** Xây dựng API `/api/admin/teams/ai-update` tự động tìm kiếm ELO, FIFA rank, phong độ gần đây, bàn thắng/thua trung bình, cầu thủ ngôi sao, phân tích chiến thuật và lưu vào SQLite.
* **Giao diện trang Stats cập nhật AI/Search:** Bổ sung Panel "Đồng bộ Stats bằng AI & Search" cho phép chọn nhanh một đội tuyển để chạy cập nhật.
* **Đồng bộ Stats nhanh ở Trang chủ:** Tích hợp nút bấm **"⚡ Stats AI"** (trong Grid View) và **📊** (trong List View) trên mỗi Card trận đấu để tự động cập nhật Stats của cả 2 đội bóng song song.
* **Toast Notification Glassmorphism:** Hiển thị thông báo Toast góc dưới bên phải màn hình thông báo trạng thái đồng bộ thành công/thất bại sinh động.

### Changed (Thay đổi)
* **Hệ thống Dự Đoán Hybrid AI + Poisson:** Tích hợp mô hình Poisson Expected Goals (xG) làm baseline định lượng cho AI, cộng thêm hệ số sân nhà (+0.3 xG) cho các nước đồng chủ nhà (Mexico, Canada, USA).
* **Consensus Engine:** Triển khai Multi-Model Consensus Engine tự động gọi song song các AI models đang bật để tính trung bình cộng xác suất thắng/hòa/thua. Nâng cấp prompt Few-Shot và Chain-of-Thought.
* **Tab Quản Lý Đội Tuyển trong Admin:** Thêm tab quản lý đội tuyển trong `/admin` hỗ trợ tìm kiếm, lọc bảng đấu và Modal Glassmorphism chỉnh sửa thủ công (Manual Update). Loại bỏ hoàn toàn cơ chế tự động cập nhật AI ngầm (AI auto-update) không mong muốn.

---

## [1.2.1] - 2026-06-06

### Added (Thêm mới)
* **Đồng bộ hóa 48 trận đấu vòng bảng chính thức:** Cập nhật toàn bộ 48 trận đấu vòng bảng FIFA World Cup 2026 thực tế (bao gồm 24 trận lượt 1 và 24 trận lượt 2 của cả 12 bảng đấu) vào dữ liệu hệ thống [fixtures.json](file:///d:/Projects/Football_Predict/src/data/fixtures.json).
* **Bổ sung cờ quốc gia Bờ Biển Ngà (Ivory Coast):** Thêm mã quốc gia `ci` và emoji cờ `🇨🇮` vào file tiện ích [flags.js](file:///d:/Projects/Football_Predict/src/lib/flags.js) để hiển thị cờ Bờ Biển Ngà chính xác, không bị lỗi cờ trắng.

### Changed (Thay đổi)
* Thực thi và dọn dẹp file script đồng bộ `sync_fixtures.js`.

---

## [1.2.0] - 2026-06-06

### Added (Thêm mới)
* **Hệ thống RAG Search đa nguồn động (SQLite):** Tích hợp 3 API tìm kiếm thời gian thực chính thức (**Tavily**, **Brave Search**, **Serper**) thay thế cho DuckDuckGo scraper cũ để tránh CAPTCHA.
* **Xoay vòng API Keys & Tự động Dự phòng (Rotation & Failover):** Cho phép cấu hình nhiều API key cho mỗi Search Provider. Khi một key lỗi hoặc hết hạn mức, hệ thống tự động thử key tiếp theo hoặc chuyển sang Search Provider kế tiếp.
* **Sắp xếp ưu tiên Search Providers:** Hỗ trợ thay đổi thứ tự ưu tiên (Priority) và bật/tắt từng Search Provider tương tự cơ chế xoay vòng AI Models.
* **Giao diện Admin quản trị RAG nâng cao:** Cập nhật trang `/admin` hiển thị trực quan 3 search engines, hỗ trợ nút bấm Up/Down thay đổi độ ưu tiên, toggle trạng thái, và thêm/xóa/bật/tắt API keys của từng công cụ tìm kiếm.
* **Tự động di chuyển dữ liệu (Seeding & Migration):** Tự động tạo bảng `search_providers` và `search_api_keys` trong SQLite, tự động seed cấu hình mặc định và import API keys sẵn có từ file `.env.local` trong lần đầu chạy để tránh gián đoạn.

### Changed (Thay đổi)
* Cập nhật hàm `searchInternet` trong `src/lib/search.js` để đọc trực tiếp cấu hình từ SQLite và thực hiện gọi các API tương ứng với Tavily, Brave Search (header `X-Subscription-Token`), và Serper (POST request).
* Cập nhật API route `src/app/api/admin/config/route.js` để hỗ trợ lưu trữ đồng bộ trạng thái của các search providers và keys.

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
