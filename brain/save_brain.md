# CHANGE ANALYSIS

## Critical Changes
* Không có thay đổi hạ tầng Docker, port hay biến môi trường mới trong phạm vi `30a98c4..HEAD`.

## Feature Changes
* **FIFA Calendar API (`src/lib/schedule/sources/fifa.js`)**: Nguồn chính priority 1 gọi `https://api.fifa.com/api/v3/calendar/matches?from=2026-06-01&to=2026-07-31&idCompetition=17&idSeason=285023&count=500`, parse `LocalDate`, `StageName`, tên đội thật vòng knockout; fallback dynamic import Roadtrips khi API lỗi.
* **Roadtrips HTML parser (`src/lib/schedule/sources/roadtrips.js`)**: Parse bảng HTML live, decode entity, map stage/group/venue; fallback dataset cục bộ `getWorldCup2026OfficialFixtures()`.
* **Modal preview sync batch apply (`src/app/HomePageClient.js`)**: State `selectedPreviewKeys`, checkbox từng trận, chọn tất cả, apply theo lô qua `/api/fixtures/sync/apply` với `candidateIds[]`; popup giữ mở, merge `localFixtures`, reload chỉ khi preview rỗng.
* **Mở rộng stats đội tuyển**: Cột `play_style`, form admin corners/cards/play style, AI update và predict pipeline đồng bộ `avg_cards_received` + `play_style`.

## Localized Changes
* Nút sync đổi label "Bắt đầu quét" (bỏ "(AI)").
* Thông báo khi sync không có diff: hiện `syncMessage` panel thay vì chỉ toast.
* `poisson.js`: đọc `play_style` trước `style_of_play` khi điều chỉnh lambda phạt góc.

# KNOWLEDGE IMPACT ANALYSIS

## Architecture Impact
* Luồng canonical schedule: FIFA API → validator cross-source → sync candidates → preview UI → apply API → `canonical_fixtures` + `fixtures`.
* UI apply không còn hard reload sau mỗi trận; optimistic merge client-side rồi reload một lần khi xong.

## Database Impact
* Bảng `teams`: thêm cột `play_style TEXT DEFAULT 'mixed'` (migration `scripts/migrate.mjs` + auto ALTER trong `src/lib/db.js`).
* Không migration schema mới cho canonical schedule trong delta này (schema đã có từ commit baseline `30a98c4`).

## API Impact
* **Không đổi contract** `/api/fixtures/sync` và `/api/fixtures/sync/apply` — apply vẫn nhận `{ syncRunId, candidateIds: number[] }`.
* **POST `/api/admin/teams`**: body bổ sung `avg_corners_won`, `avg_corners_conceded`, `avg_cards_received`, `play_style`.
* **POST `/api/admin/teams/ai-update`**: prompt và UPDATE SQL bổ sung cards + play_style/style_of_play sync.

## Infrastructure Impact
* Phụ thuộc outbound HTTP tới `api.fifa.com` và `roadtrips.com` khi sync (không cần API key).
* Không thay đổi `.env.local`.

## Business Logic Impact
* Vòng 32+ sync khớp FIFA chính thức → preview diff tin cậy hơn cho apply.
* Dự đoán Poisson corners/cards và prompt LLM dùng stats đội đầy đủ hơn.
* Apply theo lô giảm thao tác lặp, tránh mất context preview giữa chừng.

# UPDATED DOCUMENTATION

## Architecture Docs
* `brain/project_index.md` — cập nhật module schedule sources và luồng sync UI.

## Database Docs
* Ghi nhận cột `teams.play_style` trong save brain và CHANGELOG v1.10.0.

## API Docs
* FIFA Calendar API endpoint nội bộ (adapter), không expose ra client.

## Business Docs
* Quy tắc apply: chỉ candidate đã validate (`isValidated !== false`) mới tick được; không trộn canonical candidate với import thô.

## Deployment Docs
* Không thay đổi deploy; sync FIFA cần server có outbound internet.

## README / Setup Docs
* README.md: thêm mục "Canonical Schedule Sync (World Cup 2026)" và entry v1.10.0 trong Project Structure.

# API SYNC STATUS
* **Trạng thái:** ĐỒNG BỘ HOÀN TOÀN (FULLY SYNCED)
* **Chi tiết:** `/api/fixtures/sync`, `/api/fixtures/sync/apply`, `/api/admin/teams`, `/api/admin/teams/ai-update`, `/api/predict` — logic client/server khớp commit `106be09`.

# DATABASE SYNC STATUS
* **Trạng thái:** ĐỒNG BỘ HOÀN TOÀN (FULLY SYNCED)
* **Chi tiết:** Migration `play_style` trên `teams`; canonical tables từ baseline `30a98c4` không đổi thêm.

# BUSINESS RULE SYNC STATUS
* **Trạng thái:** ĐỒNG BỘ HOÀN TOÀN (FULLY SYNCED)
* **Chi tiết:** World Cup 2026 import tự do bị chặn (commit baseline); apply batch qua candidateIds; giờ DB = giờ địa phương sân, UI quy đổi VN.

# INFRASTRUCTURE SYNC STATUS
* **Trạng thái:** ĐỒNG BỘ HOÀN TOÀN (FULLY SYNCED)

# PERFORMANCE KNOWLEDGE SYNC
* Apply batch một request POST với mảng `candidateIds` thay vì N request từng trận (UI gom selected trước khi gọi).
* FIFA API `count=500` một lần, `cache: 'no-store'` — tránh stale preview.
* Reload trang deferred 600ms chỉ khi preview list rỗng.

# CHANGELOG UPDATES
* Thêm `[1.10.0] - 2026-06-28` vào `CHANGELOG.md` với nhóm Added/Changed/Fixed cho FIFA API, batch apply UI, team stats, Poisson play_style.

# OPERATIONAL KNOWLEDGE CAPTURED
* Sync World Cup 2026: chạy từ trang chủ → modal cấu hình sync → preview → tick chọn trận → "Apply đã chọn (N)".
* Nếu FIFA API down: log cảnh báo fallback Roadtrips; vòng 32 Roadtrips vẫn có placeholder — ưu tiên đảm bảo FIFA API reachable trên prod.
* Sau apply một phần: popup còn mở, trận đã apply biến mất; tiếp tục tick/apply hoặc đóng thủ công.
* Chạy `node scripts/migrate.mjs` hoặc khởi động app để ALTER `play_style` trên DB cũ.

# DEBUGGING KNOWLEDGE CAPTURED
* **Vòng 32 sai tên đội**: Root cause FIFA adapter cũ chỉ re-tag Roadtrips fallback. Fix: parse FIFA Calendar API `Home`/`Away` + `PlaceHolderA/B`.
* **Apply 1 trận ẩn popup**: Root cause `setSyncPreviewMatches(null)` + reload ngay trong `handleImportMatches`. Fix: `mergeAppliedFixtures` + `removeAppliedPreviewMatches`, reload conditional.
* **Giờ trận đấu**: DB lưu `LocalDate` FIFA (giờ sân); UI VN qua `getVNTime` — không phải lỗi apply.
* **Poisson corners không đổi theo play style mới**: Cần field `play_style` (enum) không phải chỉ `style_of_play` (text tiếng Việt).

# REMAINING UNSYNCHRONIZED ITEMS
* Không có.

# TRACEABILITY STATUS
* **Yêu cầu founder** ➜ **Mã nguồn** ➜ **Changelog gốc** ➜ **README gốc** ➜ **Save Brain**: Khớp hoàn toàn 100%.
* Phạm vi git: `30a98c4e7423c39fc66526df77fcb741f78acca0..106be09e3e8c8396650af690b69a483ddd4c86ee` (1 commit).

# FINAL MEMORY STATUS
- FULLY SYNCHRONIZED
