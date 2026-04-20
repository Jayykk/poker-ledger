# Poker Sync Pro

A modern, progressive web application for tracking and synchronizing poker game sessions with real-time collaboration features.

## ✨ Features

### Core Functionality
- 🎮 **Real-time Game Management** - Create and join poker games with live synchronization
- 💰 **Buy-in & Stack Tracking** - Track player buy-ins, rebuys, and current stacks
- 📊 **Settlement System** - Automatic profit/loss calculation with customizable exchange rates
- 👥 **Multi-player Support** - Support up to 10 players per game
- 🔗 **Invite System** - Share game links to invite players to specific seats

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
- 👥 **Multiplayer** - Up to 6 players per table
- 💰 **Integrated Ledger** - Seamless integration with the existing buy-in tracking system
- 📱 **Mobile Optimized** - Touch-optimized betting controls with slider and quick buttons
- ⚡ **Real-time Sync** - Firestore real-time listeners for instant game state updates
- 🎬 **Animations** - Card reveal and showdown animations

### Advanced Game Features
- ⏱️ **Blind Timer** - Customizable blind level timer with break periods
- 🔊 **Sound Notifications** - Audio alerts for blind level changes and timer warnings
- 💱 **Multi-currency Support** - Track in TWD, USD, CNY, or JPY
- 📜 **Rebuy History** - Complete tracking of all rebuys during a session
- 📝 **Hand Records** - View, create, and manage individual hand histories

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
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Email/Password, Anonymous, LINE Login)
- **Backend**: Firebase Cloud Functions (Node.js)
- **LINE Integration**: LIFF SDK v2
- **Charts**: Chart.js 4
- **Styling**: Tailwind CSS 3
- **Icons**: Font Awesome 6
- **Screen Wake Lock**: nosleep.js
- **Testing**: Vitest + @vue/test-utils

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

## 📞 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Version**: 10.0.0  
**Last Updated**: April 2026  
**Author**: Jayykk