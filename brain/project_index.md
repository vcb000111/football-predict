# Project Index — FIFA World Cup 2026 AI Predictor

**Version:** 1.10.0  
**Last sync:** 2026-06-28 (from commit `30a98c4`)

---

## Core Stack

| Layer | Path / Tech |
|-------|-------------|
| Framework | Next.js 16 App Router — `src/app/` |
| UI Client | `src/app/HomePageClient.js`, `src/components/` |
| Database | SQLite local / Turso — `src/lib/db.js` |
| AI | Gemini — `src/app/api/predict/`, chat routes |
| Schedule engine | `src/lib/schedule/` |

---

## Canonical Schedule Module

```
src/lib/schedule/
├── normalizer.js          # Chuẩn hóa fixture candidate
├── validator.js           # Cross-source validation vs canonical_fixtures
├── repository.js          # CRUD canonical_fixtures, sync_runs, candidates
└── sources/
    ├── fifa.js            # Priority 1 — FIFA Calendar API
    └── roadtrips.js       # Priority 2 — HTML parse + local seed fallback
```

### Sync flow

```
HomePageClient.handleSyncFixtures()
  → POST /api/fixtures/sync
  → preview candidates in modal (checkbox selection)
  → POST /api/fixtures/sync/apply { syncRunId, candidateIds[] }
  → mergeAppliedFixtures + removeAppliedPreviewMatches
  → reload only when preview empty
```

### External dependencies (sync)

| Source | URL | Auth |
|--------|-----|------|
| FIFA Calendar | `api.fifa.com/api/v3/calendar/matches?...` | None (public JSON) |
| Roadtrips | `roadtrips.com/.../schedule.htm` | None (HTML scrape) |

---

## Key API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/fixtures/sync` | Quét nguồn, tạo sync run + candidates, trả preview diff |
| `POST /api/fixtures/sync/apply` | Apply validated candidates → canonical + fixtures |
| `POST /api/fixtures/import` | Legacy import — **blocked** for World Cup 2026 |
| `POST /api/admin/teams` | CRUD team stats (incl. corners, cards, play_style) |
| `POST /api/admin/teams/ai-update` | AI extract stats from search |
| `POST /api/predict` | Hybrid Poisson + LLM consensus |

---

## Database Tables (schedule-related)

| Table | Role |
|-------|------|
| `canonical_fixtures` | Nguồn chân lý lịch WC 2026 |
| `sync_runs` | Lịch sử lần quét |
| `sync_candidates` | Ứng viên thêm/cập nhật từ sync |
| `fixtures` | Lịch hiển thị UI (mirror từ canonical apply) |
| `teams` | Stats 48 đội — incl. `play_style`, `avg_corners_*`, `avg_cards_received` |

---

## Timezone

- **Storage:** Giờ địa phương sân (FIFA `LocalDate`)
- **Display:** VN UTC+7 via `src/lib/timezone.js` (`getVNTime`)

---

## Admin UI

| Component | Path |
|-----------|------|
| Teams tab | `src/components/admin/TeamsTab.js` |
| Edit team modal | `src/components/admin/EditTeamModal.js` |
| Admin page | `src/app/admin/page.js` |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate.mjs` | Schema migrations incl. teams.play_style |
| `scripts/seed-canonical-schedule.mjs` | Seed/backfill canonical (baseline 30a98c4) |

---

## Version History Pointer

- **1.10.0** (2026-06-28): FIFA API, batch apply UI, team stats extension — commit `106be09`
- **Baseline 30a98c4**: Canonical schedule engine, apply API, validator, repository
