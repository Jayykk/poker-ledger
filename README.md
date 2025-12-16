# Poker Sync Pro

A modern, progressive web application for tracking and synchronizing poker game sessions with real-time collaboration features.

## ✨ Features

### Core Functionality
- 🎮 **Real-time Game Management** - Create and join poker games with live synchronization
- 💰 **Buy-in & Stack Tracking** - Track player buy-ins, rebuys, and current stacks
- 📊 **Settlement System** - Automatic profit/loss calculation with customizable exchange rates
- 👥 **Multi-player Support** - Support up to 10 players per game
- 🔗 **Invite System** - Share game links to invite players to specific seats

### Analytics & Reports
- 📈 **Profit Trend Charts** - Visualize your poker performance over time
- 🎯 **Win Rate Analysis** - Track wins, losses, and win rate percentages
- 📅 **Time Period Filters** - Analyze by week, month, year, or all-time
- 💾 **CSV Export** - Export game history for external analysis
- 📋 **Game Reports** - Copy formatted reports to share with friends

### Social Features
- 👫 **Friend System** - Add friends and track their performance
- 🏆 **Leaderboards** - Compete with friends on monthly/quarterly rankings
- 💬 **Game Chat** - Real-time chat during games with emoji support
- 🎯 **Friend Invitations** - Directly invite friends to your games

### Advanced Game Features
- ⏱️ **Blind Timer** - Customizable blind level timer with break periods
- 🔊 **Sound Notifications** - Audio alerts for blind level changes
- 📝 **Game Notes** - Add notes to memorable hands or sessions
- 💱 **Multi-currency Support** - Track in TWD, USD, CNY, or JPY
- 📜 **Rebuy History** - Complete tracking of all rebuys during a session

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
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Charts**: Chart.js 4
- **Styling**: Tailwind CSS 3
- **Icons**: Font Awesome 6

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm/yarn/pnpm

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

4. Run development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

6. Preview production build:
```bash
npm run preview
```

## 🚀 Deployment

### 自動部署設定

本專案使用 GitHub Actions 自動部署到 Firebase。

#### 首次設定步驟

1. **取得 Firebase Token**
   ```bash
   firebase login:ci
   ```
   這會給你一個 token

2. **設定 GitHub Secret**
   - 前往 Repository → Settings → Secrets and variables → Actions
   - 點擊 "New repository secret"
   - Name: `FIREBASE_TOKEN`
   - Value: 貼上剛才取得的 token

3. **完成！**
   之後每次 push 到 main 分支，就會自動部署

#### 手動部署

如果需要手動部署：
```bash
# 部署 Functions
cd functions && npm install
firebase deploy --only functions

# 部署 Hosting
npm run build
firebase deploy --only hosting

# 部署全部
firebase deploy
```

### GitHub Pages Deployment

The app is also configured for deployment to GitHub Pages at `/poker-ledger/`.

1. Build the project:
```bash
npm run build
```

2. Deploy to GitHub Pages:
```bash
# The built files in dist/ folder should be deployed to gh-pages branch
```

## 📱 PWA Installation

1. Visit the app in a supported browser (Chrome, Edge, Safari)
2. Click the install prompt or use the browser menu
3. The app will be added to your home screen
4. Launch like any other app

## 🔒 Firebase Security Rules

Recommended Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User documents
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
      
      match /friends/{friendId} {
        allow read: if request.auth.uid == userId;
        allow write: if request.auth.uid == userId;
      }
    }
    
    // Game documents
    match /games/{gameId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        (request.auth.uid == resource.data.hostUid || 
         request.auth.uid in resource.data.players[].uid);
      allow delete: if request.auth.uid == resource.data.hostUid;
      
      match /chat/{messageId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null;
      }
    }
  }
}
```

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

## 🎰 線上德州撲克 (Live Texas Hold'em)

**新功能**: 與朋友即時對戰的線上德州撲克遊戲！

### 功能特色
- 🃏 **公平發牌** - 伺服器端處理，確保遊戲公平性
- 👥 **多人對戰** - 最多 6 人同桌競技
- 💰 **整合記帳** - 與現有記帳系統完美整合
- 📱 **手機友好** - 觸控優化的操作介面
- ⚡ **即時同步** - Firestore 即時更新遊戲狀態
- 🎯 **智慧下注** - 滑桿 + 快捷按鈕的下注控制

### 遊戲規則
- **德州撲克** (Texas Hold'em) - 最受歡迎的撲克變體
- **盲注結構** - 可自訂大小盲注
- **買入範圍** - 設定最小/最大買入籌碼
- **完整回合** - Preflop → Flop → Turn → River → Showdown

### 技術架構
- **前端**: Vue 3 + Pinia + Composition API
- **後端**: Firebase Cloud Functions (Node.js)
- **即時同步**: Firestore Real-time Listeners
- **認證**: Firebase Authentication
- **遊戲引擎**: 伺服器端德州撲克引擎

### Cloud Functions 設定

初次部署需要設定 Firebase Functions：

```bash
# 安裝 Firebase CLI
npm install -g firebase-tools

# 登入 Firebase
firebase login

# 初始化 Functions（若尚未初始化）
firebase init functions

# 部署 Cloud Functions
cd functions
npm install
firebase deploy --only functions

# 部署 Firestore 安全規則
firebase deploy --only firestore:rules
```

### 遊戲數據結構

詳細的 Firestore 數據結構請參考 [TODO.md](./TODO.md)

主要集合：
- `/pokerGames/{gameId}` - 遊戲房間資訊
- `/pokerGames/{gameId}/hands/{handId}` - 每手牌記錄
- `/pokerGames/{gameId}/private/{userId}` - 玩家私密手牌
- `/pokerGames/{gameId}/events/{eventId}` - 遊戲事件記錄 (actions, shownCards, spectators)

### 數據遷移 (Data Migration)

**Important**: If you have existing game data with actions, shownCards, or spectators stored in array fields, you need to run a migration to move them to the new events subcollection structure.

**Why migrate?** Firestore does not allow `FieldValue.serverTimestamp()` inside array elements, which caused runtime errors in the previous implementation. The new structure stores each event as a separate document in a subcollection, enabling proper timestamp handling and better queryability.

**Migration steps**:

1. Install Firebase Admin SDK dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Set up Firebase credentials (choose one):
   - Place service account JSON in project root as `serviceAccountKey.json`
   - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - Use default application credentials

3. Run migration (dry run first to preview):
   ```bash
   # Preview what will be migrated
   node scripts/migrate_entries_to_events.js --dry-run
   
   # Run actual migration (keeps original arrays)
   node scripts/migrate_entries_to_events.js
   
   # Run migration and delete old arrays
   node scripts/migrate_entries_to_events.js --delete-old
   ```

For more details, see [scripts/README.md](./scripts/README.md).

### 開發路線圖

完整的功能開發計畫請查看 [TODO.md](./TODO.md)

**Phase 1**: 基礎架構 (Foundation) 🚧  
**Phase 2**: 核心遊戲功能 (Core Game) 📝  
**Phase 3**: UI/UX 優化 (User Experience) 📝  
**Phase 4**: 社交功能 (Social Features) 📝  
**Phase 5**: 進階功能 (Advanced) 📝

---

## 📞 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Version**: 10.0.0  
**Last Updated**: December 2024  
**Author**: Jayykk