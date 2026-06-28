# Walkthrough — Delta `30a98c4..106be09`

**Baseline commit:** `30a98c4` — feat: enhance migration and fixture synchronization for World Cup 2026  
**Head commit:** `106be09` — feat: enhance team statistics and synchronization for World Cup 2026  
**Date:** 2026-06-28

---

## 1. FIFA Calendar API (`src/lib/schedule/sources/fifa.js`)

| Trước | Sau |
|-------|-----|
| Wrap toàn bộ Roadtrips, re-tag source FIFA | Gọi FIFA Calendar API, map 104 trận |
| Vòng 32 placeholder | Tên đội thật từ `Home`/`Away` |
| Không fallback có điều kiện | `catch` → dynamic import Roadtrips |

**Parser chính:** `mapFifaMatch()` — `LocalDate` → date/time local sân, `normalizeStage()`, `resolveGroup()`.

---

## 2. Roadtrips live HTML (`src/lib/schedule/sources/roadtrips.js`)

- Thêm `parseRoadtripsTable()`, `fetchRoadtripsHtml()`, decode HTML entities.
- Thử parse live trước; nếu fail → `getWorldCup2026OfficialFixtures()` cục bộ.

---

## 3. Preview sync UI (`src/app/HomePageClient.js`)

**State mới:** `selectedPreviewKeys`

**Helpers:**
- `getPreviewMatchKey` — `candidate-{id}` | `fixture-{id}` | `preview-{index}`
- `buildDefaultPreviewSelection` — tick sẵn trận valid
- `mergeAppliedFixtures` — cập nhật grid trang chủ ngay
- `removeAppliedPreviewMatches` — gỡ khỏi preview, reload nếu rỗng

**UI modal:**
- Header: Chọn tất cả + counter "Đã chọn: N"
- Mỗi dòng: checkbox (disabled nếu invalid)
- Footer: "Apply đã chọn (N)" — không còn nút apply từng dòng

---

## 4. Team statistics

| File | Thay đổi |
|------|----------|
| `scripts/migrate.mjs`, `src/lib/db.js` | Cột `play_style` |
| `EditTeamModal.js` | Inputs corners, cards, select play_style |
| `TeamsTab.js`, `admin/page.js` | Wire form fields |
| `api/admin/teams/route.js` | Persist new fields |
| `api/admin/teams/ai-update/route.js` | Prompt + SQL cards/play_style |
| `api/predict/route.js` | Stats string + fallback normalization |
| `poisson.js` | `play_style \|\| style_of_play` |

---

## 5. Kiểm thử thực tế (phiên trước)

- Sync preview sau fix FIFA: ~32 mới + ~72 cập nhật (chủ yếu venue/status).
- Giờ DB = giờ sân (`LocalDate`); UI VN khớp FIFA VN qua `timezone.js`.
- Apply 1 trận: popup giữ mở, list giảm — **pass** sau fix UI.

---

## Files changed (13)

```
scripts/migrate.mjs
src/app/HomePageClient.js
src/app/admin/page.js
src/app/api/admin/teams/ai-update/route.js
src/app/api/admin/teams/route.js
src/app/api/predict/route.js
src/components/admin/EditTeamModal.js
src/components/admin/TeamsTab.js
src/lib/db.js
src/lib/poisson.js
src/lib/schedule/sources/fifa.js
src/lib/schedule/sources/roadtrips.js
src/lib/schedule/validator.js
```

**Diff stat:** +583 / -49 lines
