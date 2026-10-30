# Poker Sync Pro

撲克牌局記帳同步工具：現金桌／限時賽記帳、錦標賽（含 KO / PKO / 神秘賞金）、活動報名與代墊分帳、戰績排行與稱號系統，並整合 LINE LIFF。PWA，主要在手機與 LINE 內使用。

- 前端：<https://jayykk.github.io/poker-ledger/>（GitHub Pages）
- 後端：Firebase（Firestore 具名資料庫 `poker-tw`、Cloud Functions `asia-east1`）

---

## ✨ 功能

### 記帳房（現金桌／限時賽）
- 建房、連結入座、座位抽籤（一房一桌，1–9 號位 + 荷官）
- 買入／加買／退帳，交易紀錄可撤銷（用戶端 transaction + `rev` 版本號防覆寫）
- 以買入金額決定匯率，結算支援進位規則；結算由 Cloud Function `settleCashGame` 寫入
- 手牌紀錄（三步驟、帳必平衡）、結束後 7 天內可補記手牌
- 📷 **AI 牌面辨識**：拍整桌照片，Gemini 讀出牌面並分組，3–5 張一列預設為公共牌（見[設定](#-ai-牌面辨識設定)）
- 文字報表（含最少轉帳路徑）、CSV 匯出

### 🏆 錦標賽
- 開桌設定（`tableTemplates`）＝賽制 + 模組；盲注結構庫
- Re-entry、淘汰（可撤銷）、獎池與錢圈
- 賞金模組：**KO → PKO → 神秘賞金**（信封編輯、手機抽獎、時鐘 TV 舞台開獎）
- 協議結算（Deal）：ICM（Malmuth-Harville）／Chip Chop／自訂
- 錦標賽時鐘：主持／TV 兩種畫面（記分板、牌桌風）、自動升盲、休息、音效（可蓋過背景音樂、相容 iOS / LINE WebView）、螢幕常亮
- 荷官時鐘 `/dealer-clock/:id`：匿名登入、以連結分享

### 🗓️ 活動（Sessions）
- 一場活動含多個時段（現金／錦標賽／自訂），各自報名名單與人數上限
- 報名變動自動產生名單 Flex 卡分享到 LINE 群組（`liff.sendMessages`，免費）
- 啟用時段時自動建立對應牌桌、結束後自動推進下一時段
- 代墊分帳：`sessions/{id}/expenses`，收據拍照由 Gemini 讀金額
- 活動總結卡（總和／牌局／代墊，列出所有人）、歷史活動頁

### 📊 戰績與排行
- 個人戰績：損益走勢、勝率、期間篩選、賞金戰績卡、每日報表
- 排行榜（`leaderboardStats`，週／月／季／年／總，Asia/Taipei 切界）：賽制篩選、冠亞軍、Hunter／歐皇、「只看牌友」（牌友圈由同桌紀錄推算）

### 🎖️ 稱號
- 稱號家族各 10 階、神話稀有度、需主動開啟
- 頭像框、房內即時稱號、手牌事件稱號（四條、同花順…）、復仇者
- 本月王座（需至少 3 位牌友）

### 📱 LINE
- LIFF 登入；主畫面 App 的 LINE 登入交接（`lineLoginHandoffs`，PKCE + 一次性授權碼）
- 依執行環境分享：LINE 內用 Flex 卡、外部用系統分享
- `?__path=` 深層連結，LINE 卡片兩次載入內進房
- ❌ 不做 LINE Bot／付費推播（Messaging API push）

### 🃏 線上德撲（實驗性）
- Cloud Functions 發牌與狀態機、Cloud Tasks 處理逾時／攤牌／下一手、15 分鐘閒置清掃
- 底牌存放於 `pokerGames/{id}/private/{uid}`

### 平台
- PWA：Service Worker 快取、有新版時提示更新
- 四語系：繁中、簡中、English、日本語；深色／淺色主題
- 錯誤自動回報：未捕捉錯誤由 `reportClientError` 開到私有 repo 的 GitHub issue
- 管理員（`admins/{uid}`）：牌桌管理、現金桌／錦標賽編輯（含版本紀錄）

---

## 🛠️ 技術棧

| 層 | 技術 |
|---|---|
| 前端 | Vue 3.5（Composition API）、Vue Router 4（hash history）、Pinia 2、vue-i18n 9、Tailwind CSS 3、Chart.js 4、Font Awesome 6 |
| 建置／測試 | Vite 5、Vitest 4（jsdom）、@firebase/rules-unit-testing |
| Firebase（前端） | Firebase JS SDK 12：Auth（Email／匿名／LINE custom token）、Firestore（persistent cache）、AI Logic（Gemini）、App Check（reCAPTCHA Enterprise） |
| 後端 | Cloud Functions v2（Node.js 22、firebase-functions 7、firebase-admin 12）、Cloud Tasks、pokersolver |
| LINE | LIFF SDK v2 |
| CI/CD | GitHub Actions → GitHub Pages（前端）、Firebase（Functions + rules/indexes） |

## 🏗️ 架構

```
瀏覽器 / LINE LIFF (Vue PWA, GitHub Pages)
   │  直接讀寫 Firestore（受 firestore.rules 限制）
   │  呼叫 onCall Cloud Functions（結算、德撲、LINE 登入…）
   │  直接呼叫 Gemini（Firebase AI Logic + App Check）
   ▼
Firestore `poker-tw` ──trigger──▶ Cloud Functions (asia-east1)
                                   ├─ 結算後投影：history_sub → leaderboardStats → 稱號 / 本月王座
                                   ├─ 手牌事件、公開個人資料同步
                                   └─ Cloud Tasks / 排程：德撲逾時、房間自動關閉
```

**寫入分工**

- **用戶端直接寫**：記帳房名單（`games`，transaction + `rev`）、`transactions`、活動報名與代墊、錦標賽時鐘狀態、手牌、開桌設定與盲注結構。非主辦者只能動名單相關欄位（rules 把關）。
- **只有 Cloud Functions 寫**：結算結果（`settlementSnapshot`、`status: completed`）、`users/{uid}/history_sub`、`leaderboardStats`、`userTitles`、德撲牌局狀態與底牌、`clientErrors`、`lineLoginHandoffs`。
- **共用計算**：`src/utils/` 的賞金／稱號／結算數學直接 re-export `functions/src/utils`，前後端同一份；`@engine` alias 指向德撲引擎。

### 主要 Firestore 集合

| 集合 | 用途 |
|---|---|
| `users/{uid}` | 個人資料；子集合 `history_sub`（逐場戰績投影）、`tableTemplates`、`blindStructures` |
| `games/{id}` | 記帳房（現金／限時賽／錦標賽）；子集合 `hands`、`chat`、`configVersions` |
| `sessions/{id}` | 活動；子集合 `expenses`（代墊） |
| `tournamentSessions/{id}` | 錦標賽時鐘狀態 |
| `transactions` | 買入稽核紀錄 |
| `leaderboardStats/{uid}_{period}` | 排行榜彙總（CF 寫） |
| `userTitles/{uid}` | 稱號與王座（CF 寫） |
| `pokerGames/{id}` | 線上德撲房；`private/{uid}` 底牌 |
| `admins`、`clientErrors`、`lineLoginHandoffs`、`taskFailures` | 後端／管理用 |

### 目錄

```
poker-ledger/
├── src/
│   ├── main.js            # 路由定義（全部在這裡）與 app 啟動
│   ├── views/             # 頁面（admin/ 為管理頁）
│   ├── components/        # game / tournament / session / social / common …
│   ├── composables/       # useSessions、useTournamentClock、useLiff …
│   ├── store/modules/     # Pinia：auth、game、user、hand、poker …
│   ├── utils/             # 純函式（多數有單元測試）
│   └── i18n/locales/      # zh-TW、zh-CN、en、ja
├── functions/src/
│   ├── index.js           # 所有 Cloud Functions 匯出點
│   ├── handlers/          # 結算、投影、稱號、LINE、德撲流程…
│   ├── engines/           # 德撲狀態機、底池、動作驗證
│   └── utils/             # 前後端共用數學、Cloud Tasks、驗簽
├── functions/scripts/     # 回填／遷移腳本（需 production 憑證，手動執行）
├── scripts/               # 其他維運腳本
├── tests/                 # Vitest（tests/functions 為 CF 單元測試、tests/rules 為 rules 測試）
├── public/                # manifest、sw.js、圖示
├── firestore.rules        # 安全規則（唯一來源）
├── firestore.indexes.json
└── firebase.json          # Functions / Firestore / emulator 設定
```

---

## 📦 本機開發

需求：**Node.js 22**（`.nvmrc` / `.node-version`；Functions runtime `nodejs22`）與 npm。

```bash
npm install
cd functions && npm install && cd ..   # 測試會 import functions/src，需要它的 node_modules
npm run dev
```

環境變數（`.env.local`，範本見 `.env.example`）：

| 變數 | 用途 |
|---|---|
| `VITE_LIFF_ID` | LIFF App ID（LINE 登入／分享） |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | App Check（AI 辨識需要） |
| `VITE_APPCHECK_DEBUG_TOKEN` | 本機 App Check debug token |
| `VITE_GEMINI_MODEL` | 選填，覆寫 Gemini 模型 |

Functions 環境變數（`functions/.env`，範本見 `functions/.env.example`）：`LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`POKER_TASKS_SECRET`、`ERRORS_GITHUB_TOKEN`、`ERRORS_GITHUB_REPO`。

Firebase web config 預設寫在 `src/firebase-init.js`（公開資訊），可用 `VITE_FIREBASE_*` 覆寫成其他專案。Functions 另有逾時／冷啟動等選填參數，見 `functions/.env.example`。

## 🧪 測試

```bash
npm test            # Vitest：前端工具函式 + Cloud Functions 引擎/handler
npm run test:watch
npm run test:rules  # Firestore rules 測試（需 firebase-tools + Java 21，CI 會跑）
cd functions && npm run lint
```

`.claude/`（本機 agent worktree）已排除在測試收集之外。Vue 元件與依賴 Firebase 的 composable 尚未有測試，見 `TODO.md`。

---

## 🚀 部署

push 到 `main` 自動觸發：

| 對象 | Workflow | 目的地 |
|---|---|---|
| 前端 | `deploy.yml` | 測試 → build → **先部署 Firestore rules** → GitHub Pages（base `/poker-ledger/`） |
| 後端 | `firebase-deploy.yml`（變更觸及 `functions/**`、`firestore.rules`、`src/**` 等） | 測試 + lint + rules 測試 → `firebase deploy --only functions,firestore` |
| PR / 非 main | `ci.yml` | 測試、build、functions lint、rules 測試 |

前端一定比 rules 晚上線（`deploy.yml` 先發 rules），避免新版前端寫入被舊 rules 擋下。Firebase Hosting 未使用，`firebase.json` 的 hosting 設定僅供本機 preview。

### GitHub 設定（Settings → Secrets and variables → Actions）

| 名稱 | 類型 | 用途 |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | SA 金鑰 JSON（`google-github-actions/auth` 的 `credentials_json`）。WIF 不支援 `firebase deploy`，故用金鑰 |
| `POKER_TASKS_SECRET` | Secret | Cloud Tasks HMAC 簽章；未設定時 task endpoint 不驗證 |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | Secret | LINE 登入驗證 channel、登入交接換 token |
| `ERRORS_GITHUB_TOKEN` | Secret | 錯誤回報開 issue 用 |
| `VITE_LIFF_ID` | Variable | 前端 build 注入 |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Variable | App Check |
| `VITE_GEMINI_MODEL`、`ERRORS_GITHUB_REPO` | Variable | 選填 |

> 不要設定 `FIREBASE_TOKEN` 為 SA JSON——它會覆蓋 `credentials_json` 導致認證失敗。

### 手動部署

```bash
cd functions && npm ci && cd ..
firebase deploy --only functions,firestore --project poker-ledger-a0e06
```

注意資料在 **`poker-tw`** 資料庫，Firebase Console 預設開的是空的 `(default)`。

### 🤖 AI 牌面辨識設定

拍照辨識在前端直接透過 Firebase AI Logic 呼叫 Gemini，不經 Cloud Functions。AI Logic **強制 App Check**（未設定會 403 `PERMISSION_DENIED`），需一次性設定：

1. Firebase Console → AI Logic → Get started → **Gemini Developer API**。瀏覽器 API key 若有 API 限制，需放行 *Firebase AI Logic API*。
2. Google Cloud Console → reCAPTCHA Enterprise → 建立 **Website** key，網域加入 `jayykk.github.io` 與 `localhost`。
3. Firebase Console → App Check → 對 web app 註冊 reCAPTCHA Enterprise site key；APIs → Firebase AI Logic → **Enforce**。
4. 本機 `.env.local` 設 `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` 與 `VITE_APPCHECK_DEBUG_TOKEN=true`，首次辨識時 console 印出的 debug token 加到 App Check → Manage debug tokens。
5. 預設模型 `gemini-3.7-flash`，不可用時以 `VITE_GEMINI_MODEL` 覆寫。

未設 site key 時 App Check 不初始化，只有拍照辨識會失敗。圖片先在瀏覽器縮到最長邊 1280px JPEG 再送出；免費層有每分鐘／每日上限。

---

## 🔒 安全模型

- `firestore.rules` 是唯一權威來源，CI 以 emulator 測試（`tests/rules/`）後自動部署。
- 已開啟匿名登入（荷官時鐘用），所以 rules 裡的 `isAuthenticated()` 等於「任何訪客」——新規則請以「主辦者／參與者／admin」判斷，不要只靠登入。
- 結算、戰績投影、排行榜、稱號只由 Cloud Functions 寫入。
- 德撲底牌只有本人可讀、只有 Cloud Functions 可寫。
- 已知待修項目列於 `TODO.md` 的 P0。

---

**版本**：10.0.0　**最後更新**：2026-10　**作者**：Jayykk
