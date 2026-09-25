# Mobile Dry Fruits App

A React Native/Expo application for tracking dry fruits prices with multi-language support.

## Project Structure

```
├── App.js                          # Main app entry point
├── components/                     # Reusable UI components
│   ├── Header.js                   # App header with language selector
│   ├── SearchBar.js                # Search functionality
│   ├── ProductItem.js              # Individual product row
│   ├── MiniChart.js                # Small price charts
│   ├── MenuModal.js                # Dropdown menu
│   └── GreetingCard.js             # Bottom sheet greeting
├── screens/                        # Screen components
│   ├── StockListScreen.js          # Main product listing screen
│   ├── StockDetailScreen.js        # Product detail with charts
│   ├── LanguageSelectionScreen.js  # Language selection
│   └── AuthScreen.js               # Authentication screen
├── utils/                          # Utility functions and config
│   ├── translations.js             # Multi-language translations
│   └── config.js                   # App configuration
└── hooks/                          # Custom React hooks
    └── useSessionTracker.js        # Session tracking hook
```

## Components Overview

### Core Components
- **Header**: Contains title, date, language indicator, and menu button
- **SearchBar**: Filters products by name or symbol
- **ProductItem**: Displays individual product with price and mini chart
- **MiniChart**: Small animated price charts for each product
- **MenuModal**: Dropdown menu for logout and other actions
- **GreetingCard**: Draggable bottom sheet with greeting messages

### Screens
- **StockListScreen**: Main screen with product list and search
- **StockDetailScreen**: Detailed view with interactive charts
- **LanguageSelectionScreen**: Language selection interface
- **AuthScreen**: Authentication screen

### Utilities
- **translations.js**: Multi-language support (English, Telugu, Hindi)
- **config.js**: Backend URL and other configuration
- **useSessionTracker.js**: Custom hook for tracking app sessions

## Features

- ✅ Multi-language support (EN, TE, HI)
- ✅ Real-time price tracking
- ✅ Interactive charts with touch functionality
- ✅ Search and filter products
- ✅ Draggable greeting cards
- ✅ Session tracking
- ✅ Responsive design
- ✅ Dark theme

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Update the backend URL in `utils/config.js`

3. **Important**: This app uses `expo-notifications` which requires a development build (not Expo Go) for Android push notifications in SDK 53+.

### Option A: Using Development Build (Recommended)

1. Build a development build:
   ```bash
   # For Android
   eas build --profile development --platform android
   
   # For iOS
   eas build --profile development --platform ios
   ```

2. Install the development build on your device/emulator

3. Start the development server:
   ```bash
   npm run start:dev
   # or
   npm run android:dev  # for Android
   npm run ios:dev      # for iOS
   ```

### Option B: Using Expo Go (Limited - Notifications won't work on Android)

If you just want to test without notifications:
```bash
npx expo start
```

**Note**: Android push notifications will not work in Expo Go. Use a development build for full functionality.

## Dependencies

- React Native
- Expo
- React Navigation
- React Native SVG
- React Native SVG Charts
- D3 Shape
- AsyncStorage
- React Native Picker

## Architecture Benefits

- **Modular**: Each component has a single responsibility
- **Reusable**: Components can be easily reused across screens
- **Maintainable**: Code is organized and easy to understand
- **Scalable**: Easy to add new features and components
- **Testable**: Components are isolated and easier to test 