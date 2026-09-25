import { StatusBar } from 'expo-status-bar';
import * as ScreenCapture from 'expo-screen-capture';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, Text, View, AppState, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { setBadgeCount, updateBadgeCount } from './utils/notificationService';
import { BACKEND_URL } from './config';
import StockListScreen from './screens/StockListScreen';
import StockDetailScreen from './screens/StockDetailScreen';
import LanguageSelectionScreen from './screens/LanguageSelectionScreen';
import AuthScreen from './screens/AuthScreen';
import OTPVerificationScreen from './screens/OTPVerificationScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import ContactDetailsScreen from './screens/ContactDetailsScreen';
// Greeting is handled by StockListScreen to include image URL
import { useSessionTracker } from './hooks/useSessionTracker';
import { ThemeProvider, useTheme } from './utils/ThemeContext';
// import { BACKEND_URL } from './config';

const Stack = createNativeStackNavigator();

// Navigation reference for handling notification taps
const navigationRef = React.createRef();

// Set a custom dark theme for NavigationContainer
const MyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000',
    card: '#000',
    primary: '#000',
    border: '#000',
  },
};

function AppContent() {
  const { colors, isDarkMode, setForceLightMode } = useTheme();
  const [sessionInfo, setSessionInfo] = React.useState({
    lastSessionDuration: null,
    todayTimeSpent: 0,
    totalTimeSpent: 0
  });
  const [isLanguageSelected, setIsLanguageSelected] = React.useState(false);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userId, setUserId] = React.useState('anonymous');
  const [shouldShowContactDetails, setShouldShowContactDetails] = React.useState(false);
  // Greeting is now handled by StockListScreen to include image URL
  
  useSessionTracker(userId, setSessionInfo);

  // Block screenshots (Android)
  React.useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
  }, []);

  // Configure and handle notifications
  React.useEffect(() => {
    // Import and configure notification handler
    const { configureNotificationHandler, registerForPushNotificationsAsync } = require('./utils/notificationService');
    configureNotificationHandler();

    // Listen for notifications when app is in foreground
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received in foreground:', notification);
    });

    // Listen for notification responses (when user taps notification)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      console.log('Notification response:', response);
      const data = response.notification.request.content.data;
      
      // Handle navigation based on notification type
      if (data?.type === 'new_product' || data?.type === 'price_change') {
        const productId = data?.productId;
        
        if (productId && navigationRef.current) {
          try {
            // Fetch product details from backend
            const authToken = await AsyncStorage.getItem('authToken');
            const response = await fetch(`${BACKEND_URL}/products/${productId}`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (response.ok) {
              const product = await response.json();
              
              // Wait a bit to ensure navigation is ready
              setTimeout(() => {
                if (navigationRef.current) {
                  // Navigate to StockList first (if not already there), then to StockDetail
                  navigationRef.current.navigate('StockList');
                  setTimeout(() => {
                    if (navigationRef.current) {
                      navigationRef.current.navigate('StockDetail', { stock: product });
                    }
                  }, 100);
                }
              }, 500);
            } else {
              console.error('Failed to fetch product details:', response.status);
              // Fallback: just navigate to StockList
              if (navigationRef.current) {
                navigationRef.current.navigate('StockList');
              }
            }
          } catch (error) {
            console.error('Error fetching product for notification:', error);
            // Fallback: navigate to StockList
            if (navigationRef.current) {
              navigationRef.current.navigate('StockList');
            }
          }
        } else if (navigationRef.current) {
          // No product ID, just navigate to StockList
          navigationRef.current.navigate('StockList');
        }
      }
    });

    // Register for push notifications (this enables notifications when app is closed)
    const registerPushToken = async () => {
      try {
        await registerForPushNotificationsAsync(BACKEND_URL);
      } catch (error) {
        console.error('Error registering for push notifications:', error);
      }
    };
    
    // Register push token after a short delay to ensure app is ready
    const timeoutId = setTimeout(registerPushToken, 1000);

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
      clearTimeout(timeoutId);
    };
  }, []);

  // Initialize badge count on app start and when app comes to foreground
  React.useEffect(() => {
    const initializeBadge = async () => {
      try {
        // Update badge count when app starts
        await updateBadgeCount();
      } catch (error) {
        console.error('Error initializing badge:', error);
      }
    };
    initializeBadge();

    // Update badge when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App has come to the foreground, update badge count
        updateBadgeCount().catch(err => {
          console.error('Error updating badge on app state change:', err);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Check authentication, language selection, and approval status
  React.useEffect(() => {
    const checkAuthAndLanguage = async () => {
      try {
        // Check if user is authenticated
        const authToken = await AsyncStorage.getItem('authToken');
        const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
        const userDataStr = await AsyncStorage.getItem('userData');
        
        setIsAuthenticated(!!authToken);
        // Set default language if not selected (no initial language selection screen)
        if (!savedLanguage) {
          // Default to English if no language is selected
          await AsyncStorage.setItem('selectedLanguage', 'en');
        }
        setIsLanguageSelected(true); // Always consider language as selected (defaults to 'en')
        
        // Check approval status and trial period
        if (authToken && userDataStr) {
          try {
            const userData = JSON.parse(userDataStr);
            const userIdentifier = userData.gstNumber || userData.mobile || 'authenticated_user';
            setUserId(userIdentifier);
            
            // Check if user is approved
            const isApproved = userData.isApproved || false;
            const registrationDate = userData.registrationDate ? new Date(userData.registrationDate) : null;
            
            if (!isApproved && registrationDate) {
              // Check if trial period (7 days) has expired
              const now = new Date();
              const daysSinceRegistration = Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24));
              const trialPeriodDays = 7;
              
              if (daysSinceRegistration >= trialPeriodDays) {
                // Trial expired and not approved, show contact details
                setShouldShowContactDetails(true);
              }
            }
          } catch (parseError) {
            console.error('Error parsing user data:', parseError);
          }
        }
        
        // Load existing time tracking data
        const todayKey = new Date().toISOString().split('T')[0];
        const todayTimeSpent = await AsyncStorage.getItem(`todayTimeSpent_${todayKey}`) || '0';
        const totalTimeSpent = await AsyncStorage.getItem('totalTimeSpent') || '0';
        
        setSessionInfo(prev => ({
          ...prev,
          todayTimeSpent: parseInt(todayTimeSpent),
          totalTimeSpent: parseInt(totalTimeSpent)
        }));

        // Register push token when user is authenticated
        // Register push token when user is authenticated
        // Note: Greeting is handled by StockListScreen to include image URL
        if (authToken) {
          try {
            const { reRegisterPushToken } = require('./utils/notificationService');
            await reRegisterPushToken(BACKEND_URL);
          } catch (error) {
            console.error('Error re-registering push token after auth:', error);
          }
        }
      } catch (error) {
        console.error('Error checking authentication and language:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuthAndLanguage();
  }, []);

  // Force light mode on all screens before login
  React.useEffect(() => {
    if (setForceLightMode) setForceLightMode(!isAuthenticated);
  }, [isAuthenticated, setForceLightMode]);

  // Don't show custom loading screen - let Expo's native splash screen handle it
  // The native splash screen from app.json will stay visible until the app is ready
  // Return null during loading to keep native splash visible (optimized - no extra renders)
  if (isLoading) {
    return null;
  }

  // Create dynamic theme for navigation
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: colors.background,
      card: colors.background,
      primary: colors.background,
      border: colors.background,
      text: colors.text,
    },
  };

  return (
    <>
      {/* Greeting is handled by StockListScreen to include image URL */}
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName={
          !isAuthenticated ? "Auth" : 
          shouldShowContactDetails ? "ContactDetails" : "StockList"
        }
        screenOptions={{ 
          headerShown: false, 
          contentStyle: { backgroundColor: colors.background },
          cardStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="ContactDetails" component={ContactDetailsScreen} />
        <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
        <Stack.Screen name="StockList">
          {props => <StockListScreen {...props} sessionInfo={sessionInfo} />}
        </Stack.Screen>
        <Stack.Screen
          name="StockDetail"
          component={StockDetailScreen}
          options={({ route }) => {
            // Use getProductName to ensure the title is always a string
            const stock = route.params?.stock;
            let title = '';
            if (stock) {
              if (typeof stock.name === 'string') {
                title = stock.name;
              } else if (typeof stock.name === 'object') {
                title = stock.name.en || Object.values(stock.name)[0] || '';
              }
            }
            return {
              headerShown: true,
              title,
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text, fontWeight: 'bold', fontSize: 20 },
              animation: 'slide_from_right',
              cardStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            };
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  languageSafeArea: {
    flex: 1,
  },
  languageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingLogo: {
    width: 280,
    height: 280,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
