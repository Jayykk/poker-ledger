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

### GitHub Pages Deployment

The app is configured for deployment to GitHub Pages at `/poker-ledger/`.

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
**Last Updated**: December 2024  
**Author**: Jayykk