# Poker Sync Pro

A modern, progressive web application for tracking and synchronizing poker game sessions with real-time collaboration features.

## ✨ Features

### Core Functionality
- 🎮 **Real-time Game Management** - Create and join poker games with live synchronization
- 💰 **Buy-in & Stack Tracking** - Track player buy-ins, rebuys, and current stacks
- 📊 **Settlement System** - Automatic profit/loss calculation with customizable exchange rates
- 👥 **Multi-player Support** - Support up to 10 players per game
- 🔗 **Invite System** - Share game links to invite players to specific seats

### 🗓️ Live Events (Sessions)
A scheduling layer above tables — plan a poker night once, and let sign-ups drive the tables:
- 🕑 **Time-period Model** - An event holds ordered periods (cash / tournament / custom), each with its own RSVP roster and player cap
- ✋ **Per-period RSVP** - Players sign up or cancel per period via a shared LIFF link; new periods added while editing copy existing sign-ups
- 📣 **Roster Cards to LINE** - RSVP changes auto-post an updated roster Flex card to the group chat
- 🔗 **Table Linkage** - Activating a period lazily creates the underlying cash/tournament table and routes participants to it; auto-advances between periods
- 🧑‍💼 **Host Console** - Manage periods, dissolve/settle linked tables, and return participants to the event page afterward
- ⚡ **Personal Quick-setup** - Save your usual event configuration for one-tap event creation

### 🏆 Tournament System
- 🕐 **Tournament Clock** - Full-screen blind level timer with auto-advance, break periods, and sound alerts
- 🎛️ **Dealer Clock Mode** - Dedicated dealer view with anonymous auth, shareable via URL
- ⏱️ **Time Bank** - Configurable countdown timer with quick presets, synced via Firestore
- 📋 **Tournament Presets** - Save and reuse custom blind structures and tournament configurations
- 🎮 **Tournament Game View** - Integrated game management with re-entry controls and prize pool tracking
- 💤 **Screen Wake Lock** - Prevents device sleep during tournament clock display (cross-browser, including iOS)
- 🔄 **Re-entry Management** - Per-player buy-in count limits with undo support and session counter sync

### Analytics & Reports
- 📈 **Profit Trend Charts** - Visualize your poker performance over time
- 🎯 **Win Rate Analysis** - Track wins, losses, and win rate percentages
- 📅 **Time Period Filters** - Analyze by week, month, year, or all-time
- 💾 **CSV Export** - Export game history for external analysis
- 📋 **Game Reports** - Copy formatted reports to share with friends
- 📆 **Daily Reports** - Aggregate settlements by date range with player rankings

### Social Features
- 👫 **Friend System** - Add friends and track their performance
- 🏆 **Leaderboards** - Compete with friends on monthly/quarterly rankings
- 💬 **Game Chat** - Real-time chat during games with emoji support
- 🎯 **Friend Invitations** - Directly invite friends to your games

### 🃏 Live Texas Hold'em
- 🃏 **Server-side Dealing** - Fair card dealing handled by Cloud Functions
- 👥 **Multiplayer** - Up to 10 players per table
- 💰 **Integrated Ledger** - Seamless integration with the existing buy-in tracking system
- 📱 **Mobile Optimized** - Touch-optimized betting controls with slider and quick buttons
- ⚡ **Real-time Sync** - Firestore real-time listeners for instant game state updates
- 🎬 **Animations** - Card reveal and showdown animations

### Advanced Game Features
- ⏱️ **Blind Timer** - Customizable blind level timer with break periods
- 🔊 **Sound Notifications** - Web Audio API alerts (audible over background music, iOS/LINE WebView compatible)
- 💱 **Multi-currency Support** - Track in TWD, USD, CNY, or JPY
- 📜 **Rebuy History** - Complete tracking of all rebuys during a session
- 📝 **Hand Records** - View, create, and manage individual hand histories
- 🎚️ **Cash Table Presets** - Save and reuse cash game configurations with a unified create-game flow

### Admin Tools
- 🗂️ **Table Management** - Browse and manage all cash games and tournament sessions (`/admin/tables`)
- ✏️ **Cash Table Edit** - Edit live cash game state, buy-ins, and history with diff preview (`/admin/cash/:gameId`)
- 🏆 **Tournament Edit** - Edit tournament sessions and settlement results (`/admin/tournament/:sessionId`)

### LINE Integration
- 📱 **LINE Login** - Sign in with LINE account via LIFF SDK
- 💬 **Chat Room Messages** - Send buy-in/settlement notifications to LINE chat via Flex Messages
- 🔗 **Game Invites** - Share game links to LINE friends/groups with `shareTargetPicker`
- 📒 **Transaction Audit** - Full buy-in history with "who did it for whom" tracking
- ↩️ **Undo Support** - Reverse buy-in transactions with audit trail
- 🏆 **Tournament Links** - Deep links route correctly to tournament game views

### Internationalization
- 🌍 **Multi-language Support**
  - 繁體中文 (Traditional Chinese)
  - 简体中文 (Simplified Chinese)
  - English
  - 日本語 (Japanese)
- 🔄 **Auto-detection** - Automatically detects browser language
- 💾 **Saved Preferences** - Remembers your language choice

### Theming
- 🌙 **Dark Mode** (default)
- ☀️ **Light Mode**
- 🔄 **System Preference Detection**
- 💾 **Persistent Settings**

### Progressive Web App
- 📱 **Install to Home Screen** - Works like a native app
- ⚡ **Offline Support** - Service worker caching for offline functionality
- 🔄 **Auto-sync** - Automatic synchronization when back online
- 📦 **Optimized Bundle** - Code splitting for faster loading

## 🛠️ Technology Stack

- **Frontend Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite 5
- **State Management**: Pinia
- **Routing**: Vue Router 4
- **Internationalization**: vue-i18n
- **Database**: Firebase Firestore — named database `poker-tw` (not `(default)`), configured in `firebase.json`
- **Authentication**: Firebase Auth (Email/Password, Anonymous, LINE Login)
- **Backend**: Firebase Cloud Functions v2 (Node.js 22, firebase-admin 12, region `asia-east1`)
- **Task Scheduling**: Google Cloud Tasks (turn timeouts, auto-close, showdown delays)
- **Hand Evaluation**: pokersolver
- **LINE Integration**: LIFF SDK v2
- **Charts**: Chart.js 4
- **Styling**: Tailwind CSS 3
- **Icons**: Font Awesome 6
- **Screen Wake Lock**: nosleep.js
- **Testing**: Vitest + @vue/test-utils

## 📁 Project Structure

```
poker-ledger/
├── src/                    # Vue 3 frontend (views, components, composables, Pinia stores, i18n)
├── functions/src/          # Cloud Functions v2 (handlers, game engines, Cloud Tasks utils)
├── tests/                  # Vitest test suites
├── scripts/                # One-off maintenance/migration scripts
├── docs/                   # Historical implementation notes (snapshots; see TODO.md for current state)
├── public/                 # PWA assets (manifest, service worker, icons)
├── firestore.rules         # Firestore security rules (authoritative)
├── firestore.indexes.json  # Composite index definitions
└── firebase.json           # Hosting / Functions / emulator config
```

## 📦 Installation

### Prerequisites
- Node.js 22 (see `.nvmrc` / `.node-version`; Cloud Functions runtime is `nodejs22`) and npm

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/Jayykk/poker-ledger.git
cd poker-ledger
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Configure Firebase:
- Update `src/firebase-init.js` with your Firebase configuration
- Enable Authentication (Email/Password and Anonymous)
- Enable Firestore Database

4. (Optional) Configure LINE LIFF:
- Create a LINE Login Channel in [LINE Developers Console](https://developers.line.biz/)
- Create a LIFF App (Size: Full) pointing to your app URL
- Copy the LIFF ID into `.env`:
  ```bash
  VITE_LIFF_ID=your-liff-id
  ```
- Copy Channel ID/Secret into `functions/.env`:
  ```bash
  LINE_CHANNEL_ID=your-channel-id
  LINE_CHANNEL_SECRET=your-channel-secret
  ```

5. Run development server:
```bash
npm run dev
```

6. Build for production:
```bash
npm run build
```

7. Preview production build:
```bash
npm run preview
```

## 🚀 Deployment

部署分成兩條線，push 到 `main` 即自動觸發：

| 對象 | Workflow | 目的地 | 認證 |
|------|----------|--------|------|
| 前端 | `.github/workflows/deploy.yml` | GitHub Pages（base `/poker-ledger/`） | GitHub Pages 內建 |
| Cloud Functions | `.github/workflows/firebase-deploy.yml` | Firebase（`asia-east1`） | Service Account 金鑰 |

### 前端（GitHub Pages）

每次 push `main`：跑測試 → `npm run build`（注入 repository variable `VITE_LIFF_ID`）→ 部署到 GitHub Pages。無需手動操作。

### Cloud Functions（Firebase）

push `main` 且變更觸及 `functions/**`、`firestore.rules`、`src/**` 等路徑時觸發：先跑測試 + functions lint，通過後 `firebase deploy --only functions`。

必要的 Repository 設定（Settings → Secrets and variables → Actions）：

- **Secret `FIREBASE_SERVICE_ACCOUNT`**：Service Account 金鑰 JSON 全文（`google-github-actions/auth@v2` 的 `credentials_json`）。
  註：曾嘗試 WIF（Workload Identity Federation），但 `firebase deploy` 不支援 external_account 憑證，故採 SA 金鑰。
- **Secret `POKER_TASKS_SECRET`**（建議設定）：Cloud Tasks HMAC 簽章密鑰，部署時寫入 `functions/.env`；未設定時 task endpoint 會跳過驗證（向後相容，但較不安全）。
- **Variable `VITE_LIFF_ID`**：LIFF App ID，前端建置時注入。

### ⚠️ Firestore Rules / Indexes（CI 不會部署）

CI 只會「測試」rules（emulator），**不會部署**。修改 `firestore.rules` 或 `firestore.indexes.json` 後需手動執行：

```bash
firebase deploy --only firestore:rules,firestore:indexes --project poker-ledger-a0e06
```

部署前建議先比對 production 現行 rules 與 repo 版本的差異，避免互相覆蓋。

### 手動部署

```bash
# Functions
cd functions && npm ci && cd ..
firebase deploy --only functions --project poker-ledger-a0e06

# Rules + Indexes（見上方警告）
firebase deploy --only firestore:rules,firestore:indexes --project poker-ledger-a0e06
```

前端不需手動部署（GitHub Pages 自動化）；`firebase.json` 的 hosting 設定僅供本機 emulator/preview 使用。

## 📱 PWA Installation

1. Visit the app in a supported browser (Chrome, Edge, Safari)
2. Click the install prompt or use the browser menu
3. The app will be added to your home screen
4. Launch like any other app

## 🔒 Firebase Security Rules

The authoritative Firestore security rules live in [`firestore.rules`](firestore.rules). CI runs the emulator rules tests on every PR (`tests/rules/`), but **does not deploy rules** — deploy manually via `firebase deploy --only firestore:rules,firestore:indexes` (see Deployment above). Key principles:

- **Hole cards** (`pokerGames/{gameId}/private/{userId}`) are readable only by the owner and writable only by Cloud Functions
- **Game meta/config** cannot be modified by players (only by Cloud Functions or admins)
- All collections require authentication; deploy rule changes together with `firestore.indexes.json`

## 🧪 Testing

```bash
npm test            # run all unit/integration tests (Vitest)
npm run test:watch
npm run test:rules  # Firestore security-rules tests (needs the Firestore emulator + Java)
```

Suites under `tests/` cover the Cloud Functions game engines (pot calculator, action validator, game state machine, deck, hand evaluator), frontend utilities (formatters, export report, tournament stats), tournament clock math, tournament templates, i18n key completeness across all 4 locales, route/flow integration, and Firestore security rules (`tests/rules/`, run inside the emulator — CI executes these on every PR). Vue components and firebase-bound composables are not yet covered — see TODO.md.

## 📖 User Guide

### Creating a Game
1. Navigate to Lobby
2. Click "Create Game"
3. Enter game name
4. Share the game ID with other players

### Joining a Game
1. Navigate to Lobby
2. Click "Join Game"
3. Enter the game ID
4. Choose an empty seat or create a new one with your buy-in

### During a Game
- Add players manually
- Track buy-ins and rebuys
- Update stack sizes in real-time
- Use the blind timer for structured games
- Chat with other players

### Settlement
1. Click "Settlement" button
2. Set exchange rate (chips to cash)
3. Review all player profits/losses
4. Click "Finish & Save" to record the session

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Vue.js team for the amazing framework
- Firebase for the backend infrastructure
- Chart.js for beautiful charts
- Tailwind CSS for the utility-first CSS framework
- Font Awesome for the icon library

## 📞 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Version**: 10.0.0  
**Last Updated**: July 2026  
**Author**: Jayykk