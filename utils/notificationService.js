/**
 * Notification Service
 * 
 * IMPORTANT: Android push notifications require a development build (not Expo Go)
 * in Expo SDK 53+. To use notifications:
 * 1. Build a development build: eas build --profile development --platform android
 * 2. Install it on your device
 * 3. Run: npm run start:dev (or expo start --dev-client)
 * 
 * See: https://docs.expo.dev/develop/development-builds/introduction/
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Flag to track if notifications are available
let notificationsAvailable = true;

// Configure notification handler for both foreground and background
// This ensures notifications show even when app is in background or closed
let notificationHandlerConfigured = false;

export function configureNotificationHandler() {
  if (notificationHandlerConfigured) {
    return;
  }
  
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Always show notification, even in background or when app is closed
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.MAX, // Use MAX for important notifications
        };
      },
    });
    notificationHandlerConfigured = true;
    
    // Set up background notification handler (when app is closed)
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      }).catch(err => {
        if (__DEV__) {
          console.log('Channel setup failed:', err);
        }
      });
    }
  } catch (error) {
    // Silently handle if notifications are not available (e.g., in Expo Go)
    notificationsAvailable = false;
    if (__DEV__) {
      console.log('Notifications not available (development build required):', error);
    }
  }
}

// Initialize notification handler
configureNotificationHandler();

// Request notification permissions
export async function requestNotificationPermissions() {
  if (!notificationsAvailable) {
    return false;
  }
  
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      if (__DEV__) {
        console.log('Notification permissions not granted');
      }
      return false;
    }
    
    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (channelError) {
        // Silently fail if channel setup fails (e.g., in Expo Go)
        if (__DEV__) {
          console.log('Notification channel setup failed');
        }
      }
    }
    
    return true;
  } catch (error) {
    // Silently handle errors (don't show on screen)
    notificationsAvailable = false;
    if (__DEV__) {
      console.log('Notifications not available');
    }
    return false;
  }
}

// Send a notification
export async function sendNotification(title, body, data = {}) {
  if (!notificationsAvailable) {
    return;
  }
  
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('Notification permission not granted');
      return;
    }
    
    // Ensure notification handler is configured
    configureNotificationHandler();
    
    const notificationContent = {
      title,
      body,
      data,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    };

    // For Android, explicitly set channelId
    if (Platform.OS === 'android') {
      notificationContent.channelId = 'default';
    }

    // Use scheduleNotificationAsync with null trigger for immediate notification
    // This works in both foreground and background
    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: null, // Show immediately
    });
    
    if (__DEV__) {
      console.log('Notification sent successfully:', { title, body });
    }
  } catch (error) {
    // Log error for debugging
    console.error('Notification send failed:', error);
    notificationsAvailable = false;
    if (__DEV__) {
      console.log('Notification send failed:', error);
    }
  }
}

// Check for new products and price changes
export async function checkProductChanges(newProducts) {
  try {
    // Get previously stored products
    const storedProductsJson = await AsyncStorage.getItem('lastKnownProducts');
    const lastKnownProducts = storedProductsJson ? JSON.parse(storedProductsJson) : [];
    
    // Get new products with timestamps
    const newProductsWithTimestampsJson = await AsyncStorage.getItem('newProductsWithTimestamps');
    let newProductsWithTimestamps = newProductsWithTimestampsJson ? JSON.parse(newProductsWithTimestampsJson) : [];
    
    // Check if this is the first load (no stored products)
    const isFirstLoad = lastKnownProducts.length === 0;
    
    if (isFirstLoad) {
      // First time loading, just store the products (normalize for storage)
      const productsToStore = newProducts.map(p => ({
        id: p.id,
        name: p.name,
        price: parseFloat(p.price) || 0,
      }));
      await AsyncStorage.setItem('lastKnownProducts', JSON.stringify(productsToStore));
      return { newProducts: [], priceChanges: [] };
    }
    
    // Create maps for easier lookup
    const lastProductsMap = new Map(lastKnownProducts.map(p => [p.id, p]));
    
    // Check for new products
    const newProductsList = newProducts.filter(p => !lastProductsMap.has(p.id));
    const detectedNewProducts = [];
    
    if (newProductsList.length > 0) {
      const currentTime = Date.now();
      for (const product of newProductsList) {
        const productName = typeof product.name === 'string' 
          ? product.name 
          : product.name?.en || (product.name && typeof product.name === 'object' ? product.name[Object.keys(product.name)[0]] : null) || 'New Product';
        
        // Store new product with timestamp - store full product data for navigation
        const productToStore = {
          id: product.id,
          name: product.name,
          price: parseFloat(product.price) || 0,
          launchedAt: currentTime,
          fullProduct: {
            ...product,
            // Ensure all necessary fields are included
            id: product.id,
            name: product.name,
            price: product.price,
            change: product.change || 0,
            imageIds: product.imageIds || [],
            symbol: product.symbol || ''
          }
        };
        newProductsWithTimestamps.push(productToStore);
        
        detectedNewProducts.push(product);
        
        // LOCAL NOTIFICATIONS DISABLED - Backend sends push notifications
        // Local notifications only work when app is running
        // Backend push notifications work even when app is closed
        // Uncomment below only if you want duplicate notifications (not recommended)
        // await sendNotification(
        //   'New Product Launched! 🎉',
        //   `${productName} is now available`,
        //   { type: 'new_product', productId: product.id }
        // );
      }
      // Save updated new products with timestamps
      await AsyncStorage.setItem('newProductsWithTimestamps', JSON.stringify(newProductsWithTimestamps));
    }
    
    // Check for price changes
    const priceChanges = [];
    for (const newProduct of newProducts) {
      const oldProduct = lastProductsMap.get(newProduct.id);
      if (oldProduct) {
        const oldPrice = parseFloat(oldProduct.price) || 0;
        const newPrice = parseFloat(newProduct.price) || 0;
        
        // Only notify if price actually changed and both prices are valid
        if (oldPrice !== newPrice && oldPrice > 0 && newPrice > 0) {
          const productName = typeof newProduct.name === 'string' 
            ? newProduct.name 
            : newProduct.name?.en || (newProduct.name && typeof newProduct.name === 'object' ? newProduct.name[Object.keys(newProduct.name)[0]] : null) || 'Product';
          
          const priceChange = newPrice - oldPrice;
          const changePercent = ((priceChange / oldPrice) * 100).toFixed(2);
          const changeDirection = priceChange > 0 ? 'increased' : 'decreased';
          const emoji = priceChange > 0 ? '📈' : '📉';
          
          priceChanges.push(newProduct);
          
          // LOCAL NOTIFICATIONS DISABLED - Backend sends push notifications
          // Local notifications only work when app is running
          // Backend push notifications work even when app is closed
          // Uncomment below only if you want duplicate notifications (not recommended)
          // await sendNotification(
          //   `Price ${changeDirection} ${emoji}`,
          //   `${productName}: ₹${oldPrice.toFixed(2)} → ₹${newPrice.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent}%)`,
          //   { 
          //     type: 'price_change', 
          //     productId: newProduct.id,
          //     oldPrice,
          //     newPrice,
          //     change: priceChange
          //   }
          // );
        }
      }
    }
    
    // Update stored products (normalize for storage)
    const productsToStore = newProducts.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price) || 0,
    }));
    await AsyncStorage.setItem('lastKnownProducts', JSON.stringify(productsToStore));
    
    return { newProducts: detectedNewProducts, priceChanges };
  } catch (error) {
    console.error('Error checking product changes:', error);
    return { newProducts: [], priceChanges: [] };
  }
}

// Get active new products (within 24 hours)
export async function getActiveNewProducts() {
  try {
    const newProductsWithTimestampsJson = await AsyncStorage.getItem('newProductsWithTimestamps');
    if (!newProductsWithTimestampsJson) return [];
    
    const newProductsWithTimestamps = JSON.parse(newProductsWithTimestampsJson);
    const currentTime = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // Filter products launched within last 24 hours
    const activeNewProducts = newProductsWithTimestamps
      .filter(p => (currentTime - p.launchedAt) < twentyFourHours)
      .map(p => {
        // Use fullProduct if available, otherwise reconstruct from stored data
        if (p.fullProduct) {
          return p.fullProduct;
        }
        return {
          id: p.id,
          name: p.name,
          price: p.price,
          change: 0,
          imageIds: [],
          symbol: ''
        };
      });
    
    // Clean up expired products
    const activeProductsWithTimestamps = newProductsWithTimestamps.filter(
      p => (currentTime - p.launchedAt) < twentyFourHours
    );
    await AsyncStorage.setItem('newProductsWithTimestamps', JSON.stringify(activeProductsWithTimestamps));
    
    return activeNewProducts;
  } catch (error) {
    console.error('Error getting active new products:', error);
    return [];
  }
}

// Clear all stored new products (useful for debugging or resetting)
export async function clearStoredNewProducts() {
  try {
    await AsyncStorage.removeItem('newProductsWithTimestamps');
    await AsyncStorage.removeItem('lastKnownProducts');
    console.log('Cleared stored new products');
    return true;
  } catch (error) {
    console.error('Error clearing stored new products:', error);
    return false;
  }
}

// Set badge count on app icon
export async function setBadgeCount(count) {
  if (!notificationsAvailable) {
    return;
  }
  
  try {
    // Ensure we have permission first
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      if (__DEV__) {
        console.log('Cannot set badge: notification permission not granted');
      }
      return;
    }
    
    // Set badge count (0 to clear badge)
    await Notifications.setBadgeCountAsync(count);
    
    if (__DEV__) {
      console.log(`Badge count set to: ${count}`);
    }
  } catch (error) {
    // Silently handle errors (e.g., in Expo Go or if feature not supported)
    if (__DEV__) {
      console.log('Failed to set badge count:', error);
    }
  }
}

// Get current badge count
export async function getBadgeCount() {
  if (!notificationsAvailable) {
    return 0;
  }
  
  try {
    const count = await Notifications.getBadgeCountAsync();
    return count || 0;
  } catch (error) {
    if (__DEV__) {
      console.log('Failed to get badge count:', error);
    }
    return 0;
  }
}

// Update badge count based on active new products
export async function updateBadgeCount() {
  try {
    const activeNewProducts = await getActiveNewProducts();
    const badgeCount = activeNewProducts.length;
    await setBadgeCount(badgeCount);
    return badgeCount;
  } catch (error) {
    console.error('Error updating badge count:', error);
    return 0;
  }
}

// Register for push notifications and get Expo Push Token
export async function registerForPushNotificationsAsync(backendUrl) {
  if (!notificationsAvailable) {
    return null;
  }

  try {
    // Check if device is physical (push notifications work on physical devices)
    if (!Device.isDevice) {
      if (__DEV__) {
        console.log('Push notifications work only on physical devices');
      }
      return null;
    }

    // Request permissions
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      if (__DEV__) {
        console.log('Notification permissions not granted for push notifications');
      }
      return null;
    }

    // Get the Expo Push Token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      if (__DEV__) {
        console.log('Project ID not found in app.json');
      }
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    
    const pushToken = tokenData.data;
    
    if (__DEV__) {
      console.log('📱 Expo Push Token obtained:', pushToken);
    }

    // Store token locally
    await AsyncStorage.setItem('expoPushToken', pushToken);

    // Send token to backend if backendUrl is provided
    if (backendUrl) {
      await sendPushTokenToBackend(pushToken, backendUrl);
    }

    return pushToken;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

// Send push token to backend
async function sendPushTokenToBackend(pushToken, backendUrl) {
  try {
    // Get user authentication token
    const authToken = await AsyncStorage.getItem('authToken');
    const userDataStr = await AsyncStorage.getItem('userData');
    
    if (!authToken) {
      if (__DEV__) {
        console.log('User not authenticated, skipping push token registration');
      }
      return;
    }

    let userId = null;
    if (userDataStr) {
      try {
        const userData = JSON.parse(userDataStr);
        userId = userData.id || userData.gstNumber || userData.mobile;
      } catch (parseError) {
        console.error('Error parsing user data:', parseError);
      }
    }

    const response = await fetch(`${backendUrl}/register-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        pushToken: pushToken,
        platform: Platform.OS,
        userId: userId,
      }),
    });

    if (response.ok) {
      if (__DEV__) {
        console.log('✅ Push token registered with backend successfully');
      }
    } else {
      if (__DEV__) {
        console.log('⚠️ Failed to register push token with backend:', response.status);
      }
    }
  } catch (error) {
    console.error('Error sending push token to backend:', error);
  }
}

// Re-register push token (call this after user logs in)
export async function reRegisterPushToken(backendUrl) {
  return await registerForPushNotificationsAsync(backendUrl);
}
