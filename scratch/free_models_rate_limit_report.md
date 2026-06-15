# Báo cáo Kiểm tra Lỗi Rate Limit (429) của các Model Free

*Thời gian kiểm tra: 14:12:27 15/6/2026*

| STT | Model ID | Trạng thái (Rate Limit 429?) | Response Time | Chi tiết phản hồi / Mã lỗi |
| --- | --- | --- | --- | --- |
| 1 | `nex-agi/nex-n2-pro:free` | ✅ HOẠT ĐỘNG tốt | 1.19s | Phản hồi: "OK" |
| 2 | `nvidia/nemotron-3.5-content-safety:free` | ✅ HOẠT ĐỘNG tốt | 1.12s | Phản hồi: "" |
| 3 | `nvidia/nemotron-3-ultra-550b-a55b:free` | ⏱️ TIMEOUT (10s) | 10.00s | The operation was aborted due to timeout |
| 4 | `openrouter/owl-alpha` | ⏱️ TIMEOUT (10s) | 10.00s | The operation was aborted due to timeout |
| 5 | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | ✅ HOẠT ĐỘNG tốt | 0.69s | Phản hồi: "" |
| 6 | `poolside/laguna-xs.2:free` | ✅ HOẠT ĐỘNG tốt | 1.12s | Phản hồi: "" |
| 7 | `poolside/laguna-m.1:free` | ✅ HOẠT ĐỘNG tốt | 2.48s | Phản hồi: "" |
| 8 | `google/gemma-4-26b-a4b-it:free` | 🛑 BỊ RATE LIMIT (429) | 0.52s | HTTP 429: Provider returned error |
| 9 | `google/gemma-4-31b-it:free` | ✅ HOẠT ĐỘNG tốt | 1.57s | Phản hồi: "OK" |
| 10 | `google/lyria-3-pro-preview` | ❌ LỖI KHÁC | 1.14s | HTTP 502: error code: 502 |
| 11 | `google/lyria-3-clip-preview` | ❌ LỖI KHÁC | 1.35s | HTTP 502: error code: 502 |
| 12 | `nvidia/nemotron-3-super-120b-a12b:free` | ✅ HOẠT ĐỘNG tốt | 0.60s | Phản hồi: "User wants "OK" in exactly one word." |
| 13 | `openrouter/free` | ✅ HOẠT ĐỘNG tốt | 0.66s | Phản hồi: "OK" |
| 14 | `liquid/lfm-2.5-1.2b-thinking:free` | ✅ HOẠT ĐỘNG tốt | 0.70s | Phản hồi: "" |
| 15 | `liquid/lfm-2.5-1.2b-instruct:free` | ✅ HOẠT ĐỘNG tốt | 0.70s | Phản hồi: "OK" |
| 16 | `nvidia/nemotron-3-nano-30b-a3b:free` | ✅ HOẠT ĐỘNG tốt | 0.56s | Phản hồi: "" |
| 17 | `nvidia/nemotron-nano-12b-v2-vl:free` | ⏱️ TIMEOUT (10s) | 10.00s | The operation was aborted due to timeout |
| 18 | `qwen/qwen3-next-80b-a3b-instruct:free` | 🛑 BỊ RATE LIMIT (429) | 0.66s | HTTP 429: Provider returned error |
| 19 | `nvidia/nemotron-nano-9b-v2:free` | ✅ HOẠT ĐỘNG tốt | 1.37s | Phản hồi: "" |
| 20 | `openai/gpt-oss-120b:free` | ✅ HOẠT ĐỘNG tốt | 4.38s | Phản hồi: "OK" |
| 21 | `openai/gpt-oss-20b:free` | ⏱️ TIMEOUT (10s) | 10.00s | The operation was aborted due to timeout |
| 22 | `qwen/qwen3-coder:free` | 🛑 BỊ RATE LIMIT (429) | 0.80s | HTTP 429: Provider returned error |
| 23 | `cognitivecomputations/dolphin-mistral-24b-venice-edition:free` | 🛑 BỊ RATE LIMIT (429) | 0.66s | HTTP 429: Provider returned error |
| 24 | `meta-llama/llama-3.3-70b-instruct:free` | 🛑 BỊ RATE LIMIT (429) | 0.66s | HTTP 429: Provider returned error |
| 25 | `meta-llama/llama-3.2-3b-instruct:free` | 🛑 BỊ RATE LIMIT (429) | 0.72s | HTTP 429: Provider returned error |
| 26 | `nousresearch/hermes-3-llama-3.1-405b:free` | 🛑 BỊ RATE LIMIT (429) | 0.63s | HTTP 429: Provider returned error |
