# Onyx DJ Companion & Tauri App — Master Architecture & Decisions Log

> **Repository:** `meirymobile/OnyxYoutubeDownloader-Tauri`  
> **Target OS:** macOS (Apple Silicon / Intel Universal)  
> **Last Updated:** October 2026  
> **Scope:** Complete Architectural Specifications, Subsystems, Design Decisions, and Development History

---

## 1. System Overview & Vision

**Onyx** is an end-to-end live DJ performance and crowd engagement ecosystem designed for professional DJs, event producers, and club venues. It unifies:

1. **A Native macOS Desktop Application (Tauri + React + Rust):**
   * High-speed YouTube, Spotify, and Soundcloud audio/video downloading and tagging.
   * Deep integration with Algoriddim djay Pro and Serato DJ Pro via native binary injection (`djay_reader.dylib`).
   * Live Stage Projection Window (`QrStageWindow.jsx`) showing real-time song spotlights, guest dedications, and dynamic QR codes.
   * Full DJ Management Console (`GuestRequestsModal.jsx`) for managing crowd requests, approving stage shout-outs, and broadcasting Crowd FX lighting shows.

2. **A Zero-Install Mobile Web App for Event Guests (`Dj-OnyxDownloader-Guest-Requests`):**
   * Accessible instantly by scanning the DJ's stage QR code.
   * Real-time song requests with dedication messages and photo uploads.
   * Live Crowd FX Lighting Engine: Transforms all guest smartphones into a synchronized light show and arena strobe.
   * High-resolution Souvenir Card Generator (16:9 Stage View and 9:16 Instagram Story) with instant WhatsApp sharing.

---

## 2. System Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Onyx macOS Desktop App                 │
                  │              (Tauri v2 + Rust + React)                 │
                  └───────────┬────────────────────────────┬───────────────┘
                              │                            │
             Native Mach-O Dylib Hooking         Real-Time Event Broadcast
             (Algoriddim djay Pro Integration)   (Dual MQTT + HTTPS NTFY)
                              │                            │
                              ▼                            ▼
                  ┌───────────────────────┐    ┌───────────────────────────┐
                  │   djay Pro Engine     │    │   HiveMQ / EMQX Brokers   │
                  │   djay_reader.dylib   │    │      (Port 8884/8084)     │
                  │   IPC Socket / SQLite │    │    ntfy.sh Fallback (443) │
                  └───────────────────────┘    └─────────────┬─────────────┘
                                                             │
                                                  WebSockets / HTTPS
                                                             │
                                                             ▼
                                               ┌───────────────────────────┐
                                               │    Guest Web Application  │
                                               │ (Vercel CDN / Vanilla JS) │
                                               │  • Crowd FX Strobe Engine │
                                               │  • Dual Anti-Sleep Sentinel
                                               │  • Stage Spotlight & Cards│
                                               └───────────────────────────┘
```

---

## 3. Core Subsystems & Technical Decisions

### 3.1 Crowd FX Lighting & Global Epoch Modulo Strobe Engine

#### Problem:
In large concert halls and wedding venues, crowd strobes driven by standard network polling suffer from 100ms–800ms jitter due to mobile LTE/Wi-Fi latency. Phones flashing out of phase create a messy blur instead of a punchy stadium lighting effect. Conversely, some DJs prefer an organic "sparkling galaxy" look where each phone flashes independently.

#### Architectural Solution:
We implemented four distinct modes with dual-timing engines in both the DJ Console and Guest Web App:

1. **`strobe` (⚡ לבן חופשי - Organic Free-Running):**
   * Uses independent `setInterval(flashRateMs)` with random start offsets per device.
   * Creates an organic, shimmering starry night / firefly atmosphere across the dance floor.

2. **`strobe_synced` (🌐 לבן מסונכרן - 100% Phase-Locked Master Sync):**
   * Powered by **Global Epoch Modulo Sync** via `requestAnimationFrame`:
     ```javascript
     const beatMs = Math.round(60000 / bpm);
     const flashOnMs = Math.round(beatMs * 0.35); // 35% on, 65% off for crisp punch
     const phase = Date.now() % beatMs;
     const shouldBeOn = (phase < flashOnMs);
     ```
   * Because `Date.now()` is synchronized to global NTP time on all modern iOS and Android devices, every phone in the venue calculates the exact same flash state at the identical millisecond, with **zero latency drift**.

3. **`strobe_rainbow` (🎨 צבעוני חופשי - Multi-Color Free-Running):**
   * Free-running interval where each phone cycles randomly through vivid neon hues (`#ff0055`, `#00ffcc`, `#ffcc00`, `#ff00ff`, `#00e5ff`, etc.).
   * Produces an asynchronous psychedelic party vibe.

4. **`strobe_rainbow_synced` (🌈 צבע מסונכרן - 100% Synchronized Color Wave):**
   * Combines Global Epoch Phase Locking with **Universal Beat Indexing**:
     ```javascript
     const beatIndex = Math.floor(Date.now() / beatMs);
     const color = RAINBOW_PALETTE[beatIndex % RAINBOW_PALETTE.length];
     ```
   * **All devices worldwide calculate the exact same beat index at the exact same millisecond.**
   * Result: The entire venue illuminates in unison in Neon Pink on Beat 1, Cyber Cyan on Beat 2, Laser Yellow on Beat 3, Ultra Violet on Beat 4, etc.

---

### 3.2 Dual-Engine Anti-Sleep ("מסך דולק ברחבה") Architecture

#### Problem:
Mobile Safari (iOS) and Chrome (Android) aggressively sleep the display after 10–30 seconds of inactivity. 
The W3C `navigator.wakeLock.request('screen')` API:
* Often fails or releases immediately on iOS without a direct user gesture.
* Drops the lock within 2–3 seconds if acquired during initial page load watchdog cycles.
* Placing video keep-awake elements off-screen (`top: -9999px`) causes WebKit to pause them immediately.

#### Architectural Solution:
A **Dual-Engine Hybrid Keep-Awake Sentinel** with a **Persistent User Intent State Machine**:
1. **Engine A (W3C Screen Wake Lock API):** High-efficiency system lock for modern supporting browsers.
2. **Engine B (Looping H.264 MP4 Micro-Video):** Apple-certified H.264 silent video (`nosleep.mp4` + base64 fallback) placed **inside the active viewport**:
   ```css
   #anti-sleep-video {
     position: fixed;
     top: 0;
     left: 0;
     width: 1px;
     height: 1px;
     opacity: 0.001;
     pointer-events: none;
     z-index: -999;
   }
   ```
3. **Intent Decoupling:** `isAntiSleepActive` represents user intent and is defaulted to `true` (`פעיל 🟢`). Transient OS release events no longer switch the UI to "off".
4. **Gesture Watchdog:** Any user touch (`touchstart`, `touchend`, `click`, `pointerdown`) or `visibilitychange` automatically re-engages and locks both engines.

---

### 3.3 Dual-Broker Realtime Networking Architecture

To guarantee 100% message delivery in noisy club environments:
1. **Primary Broker:** HiveMQ Cloud WebSockets (`broker.hivemq.com:8884/mqtt`).
2. **Secondary Broker:** EMQX Cloud WebSockets (`broker.emqx.io:8084/mqtt`).
3. **HTTPS Fallback (Port 443):** Direct HTTP POST to `ntfy.sh/onyx_fx_<room>` ensuring delivery even on guest Wi-Fi networks that block non-standard MQTT ports.
4. **Retained Messages:** FX state is published with MQTT `retain = true`, so guests who open the web page midway through a song immediately sync to the active light show.

---

### 3.4 macOS Packaging & Gatekeeper Resolution Pipeline

#### Problem:
Tauri 2 `cargo tauri build` automatically removes the uncompressed app bundle `src-tauri/target/release/bundle/macos/OnyxYoutubeDownloader.app` after creating the initial DMG. Older packaging scripts copied from this deleted folder, resulting in a hollow 57 KB bundle that triggered the macOS Gatekeeper error: *"You can't open the application 'OnyxYoutubeDownloader' because it may be damaged or incomplete."*

#### Architectural Solution ([`package_dmg.sh`](file:///Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/package_dmg.sh)):
1. Mounts Tauri's generated disk image to safely extract the complete 283 MB executable bundle.
2. Injects the native Mach-O `djay_reader.dylib` into both `Contents/Frameworks` and `Contents/MacOS`.
3. Strips all quarantine flags: `xattr -cr OnyxYoutubeDownloader.app`.
4. Performs ad-hoc deep code signing: `codesign --force --deep --sign - OnyxYoutubeDownloader.app`.
5. Verifies signature validity via `codesign -v`.
6. Generates the final installer at `./install/OnyxYoutubeDownloader.dmg`.

---

## 4. Chronological Milestone Log

| Phase | Description | Key Commits / Decisions |
|---|---|---|
| **P1** | **Core Downloader & Player** | Tauri v2 desktop application, YouTube & Spotify audio scrapers, local playback queue. |
| **P2** | **Algoriddim djay Pro Hook** | Built `djay_reader.dylib` for real-time BPM, deck state, and track metadata sniffing without official APIs. |
| **P3** | **Live Stage Experience & Crowd Requests** | Introduced `GuestRequestsModal.jsx` and `QrStageWindow.jsx`. Integrated Paho MQTT. |
| **P4** | **Crowd FX Light Show Suite** | Added `strobe`, `candle`, `glow`, and `white` modes to guest mobile web app. |
| **P5** | **Souvenir Card Generator** | Built high-res Canvas export for 16:9 Stage and 9:16 Story formats with WhatsApp integration. |
| **P6** | **Global Epoch Modulo Sync (`strobe_synced`)** | Replaced interval-based strobe with zero-latency `Date.now() % beatMs` phase-locking. |
| **P7** | **Dual-Engine Anti-Sleep Sentinel** | Resolved mobile screen timeouts with hybrid WakeLock + H.264 in-viewport micro-video. |
| **P8** | **Gatekeeper & Packaging Fix** | Overhauled `package_dmg.sh` to extract complete 283MB bundles, inject dylibs, and sign with ad-hoc codesign. |
| **P9** | **Synchronized Color Wave (`strobe_rainbow_synced`)** | Added universal beat index modulo to synchronize color shifts across all smartphones simultaneously. |

---

## 5. Directory Structure of Historical Backups

All raw transcripts and original feature specification artifacts are permanently committed to this repository under `docs/history/`:

* **Master Specifications (`docs/history/specs/`):**
  * [`crowd_requests_feature_plan.md`](file:///Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/docs/history/specs/crowd_requests_feature_plan.md) — Comprehensive plan for crowd requests, voting, and stage display.
  * [`crowd_stage_live_experience_plan.md`](file:///Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/docs/history/specs/crowd_stage_live_experience_plan.md) — Live stage visualizer and spotlight system.
  * [`dj_performance_shield_spec.md`](file:///Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/docs/history/specs/dj_performance_shield_spec.md) — Performance shield, anti-crash, and safety specs.
  * [`stage_preview_draggable_text_plan.md`](file:///Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/docs/history/specs/stage_preview_draggable_text_plan.md) — Interactive canvas text positioning specifications.

* **Raw Conversation Transcripts (`docs/history/transcripts/`):**
  * `conversation_current_transcript.jsonl` — Compact token-efficient transcript of the active development session.
  * `conversation_current_transcript_full.jsonl` — Complete, untruncated verbatim record of all prompt steps and tool invocations.
  * `conversation_previous_transcript.jsonl` — Previous conversation compact transcript.
  * `conversation_previous_transcript_full.jsonl` — Previous conversation complete verbatim transcript.
