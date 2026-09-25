import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, StatusBar, TouchableOpacity, Modal, Image, ScrollView, TextInput, Alert, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { translations } from '../utils/translations';
import { useTheme } from '../utils/ThemeContext';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import ProductItem from '../components/ProductItem';
import MenuModal from '../components/MenuModal';
import SplashGreeting from '../components/SplashGreeting';
import { Ionicons } from '@expo/vector-icons';
import { checkProductChanges, requestNotificationPermissions, getActiveNewProducts, updateBadgeCount, setBadgeCount } from '../utils/notificationService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { validateGST, formatGST } from '../utils/gstValidation';

// Same logic as StockDetailScreen: format history, fill missing dates, change = today - yesterday
const toLocalDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Compare current price vs price history: change = currentPrice - previousPrice
// Positive => current higher (green, +). Negative => current lower (red, -).
const computeChangeFromPriceHistory = (priceHistory, currentPrice) => {
  let data = priceHistory;
  if (!data) return 0;
  if (!Array.isArray(data)) {
    data = data.content || data.data || data.results || [];
  }
  if (!Array.isArray(data) || data.length === 0) return 0;

  const getPrice = (e) => {
    const v = e?.price ?? e?.priceAmount ?? e?.value;
    if (v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  const getDate = (e) => {
    const v = e?.changedAt ?? e?.date ?? e?.createdAt ?? e?.timestamp ?? e?.effectiveDate ?? 0;
    return v ? new Date(v).getTime() : 0;
  };

  const currentVal = currentPrice != null && currentPrice !== '' ? parseFloat(currentPrice) : null;
  if (currentVal == null || isNaN(currentVal)) return 0;

  // Sort by date ascending (oldest first)
  const sorted = [...data]
    .map(d => ({ ...d, price: getPrice(d), date: getDate(d) }))
    .filter(d => d.price != null)
    .sort((a, b) => a.date - b.date);

  if (sorted.length === 0) return 0;

  // Previous price = last price in history (before we consider current)
  const lastHistoryPrice = sorted[sorted.length - 1].price;
  // If backend already has current price as last entry, use second-to-last as previous
  const previousPrice = (sorted.length >= 2 && lastHistoryPrice === currentVal)
    ? sorted[sorted.length - 2].price
    : lastHistoryPrice;

  const change = parseFloat((currentVal - previousPrice).toFixed(2));
  return change;
};

// Auto-scrolling text banner component with horizontal scroll
const AutoScrollTextBanner = ({ text, colors }) => {
  const scrollX = useRef(new Animated.Value(0));
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  // Only display text from backend - no default fallback
  const displayText = text && text.trim().length > 0 ? text.trim() : null;
  
  // Debug logging
  if (__DEV__) {
    console.log('🟡 AutoScrollTextBanner received text:', text);
    console.log('🟡 AutoScrollTextBanner displayText:', displayText);
  }

  useEffect(() => {
    if (containerWidth > 0 && textWidth > containerWidth && displayText) {
      // Only animate if text is longer than container
      // Calculate scroll distance: scroll through one instance (half of duplicated text)
      // Since text is "{displayText} • {displayText}", scroll through first instance + separator
      const scrollDistance = textWidth / 2; // Half width for seamless loop with duplicated text
      
      // Reset scroll position to start
      scrollX.current.setValue(0);
      
      // Create continuous seamless scroll loop
      const scrollAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scrollX.current, {
            toValue: -scrollDistance,
            duration: 15000, // Scroll speed (adjust duration for faster/slower)
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          // Instant reset to create seamless loop (duplicated text is already in position)
          Animated.timing(scrollX.current, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      scrollAnimation.start();
      return () => scrollAnimation.stop();
    }
  }, [containerWidth, textWidth, displayText]);

  // Don't render if no text from backend
  if (!displayText || displayText.trim().length === 0) {
    return null;
  }

  return (
    <View 
      style={[styles.scrollableBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }}
    >
      <View style={styles.scrollableTextContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollableTextScrollContent}
          style={styles.scrollableTextScrollView}
          bounces={false}
        >
          <Animated.View
            style={[
              styles.scrollableTextWrapper,
              {
                transform: [{ translateX: scrollX.current }],
              },
            ]}
          >
            <Text 
              style={[styles.scrollableText, { color: colors.text }]}
              numberOfLines={1}
              onLayout={(e) => {
                const width = e.nativeEvent.layout.width;
                if (width > 0) {
                  setTextWidth(width);
                }
              }}
            >
              {displayText} • {displayText} {/* Duplicate for seamless loop */}
            </Text>
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
};

const BOTTOM_NAV_PADDING_ANDROID = 28;
const PRODUCTS_CACHE_KEY = 'cachedProducts';
const PRODUCT_EXTRAS_CACHE_KEY = 'cachedProductExtras'; // change + mini-chart series per product id
const CATEGORIES_CACHE_KEY = 'cachedCategories';
const BANNER_CACHE_PREFIX = 'cachedBanner:';

export default function StockListScreen({ navigation, sessionInfo }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [products, setProducts] = useState([]);
  const [productChanges, setProductChanges] = useState(() => new Map());
  const [productChartData, setProductChartData] = useState(() => new Map()); // Preloaded chart prices - no duplicate fetch
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [greeting, setGreeting] = useState(null);
  const [splashVisible, setSplashVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedCategory, setSelectedCategory] = useState(null); // null means "All"
  const [categories, setCategories] = useState([]); // Categories from API
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [activeNewProducts, setActiveNewProducts] = useState([]);
  const [userData, setUserData] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editGstNumber, setEditGstNumber] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successAnim] = useState(new Animated.Value(0));
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const GST_EXAMPLE = 'Example: 22ABCDE0000A1Z5';
  // Banner text state - only populated from backend, no default text
  const [scrollableText, setScrollableText] = useState(''); // Start with empty - only show backend data
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event?.endCoordinates?.height || 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);
  
  // Fetch banner text from backend with language support - gets most recent banner from DB
  // Only shows banner if backend returns data - no default text fallback
  const fetchBannerText = React.useCallback(async () => {
    const currentLang = selectedLanguage || 'en';
    const bannerCacheKey = `${BANNER_CACHE_PREFIX}${currentLang}`;
    
    try {
      // Fetch banners from /api/banner-text endpoint
      // Note: BACKEND_URL already includes /api, so we just append /banner-text
      const bannerUrl = `${BACKEND_URL}/banner-text`;
      if (__DEV__) { console.log('Fetching banner:', bannerUrl); }
      
      const response = await fetch(bannerUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      
      if (response.ok) {
        let responseData = await response.json();
        
        // Handle different response formats
        let bannerText = null;
        let bannersArray = [];
        
        // Check if response has a 'text' field with language keys (your API format)
        if (responseData && typeof responseData === 'object' && responseData.text) {
          console.log('🔵 Response has "text" field with language keys');
          const textObj = responseData.text;
          
          // Extract text for current language
          if (textObj && typeof textObj === 'object') {
            if (textObj[currentLang]) {
              bannerText = textObj[currentLang];
              console.log('✅ Found text for language', currentLang, ':', bannerText);
            } else if (textObj.en) {
              bannerText = textObj.en;
              console.log('✅ Using English fallback:', bannerText);
            } else if (textObj.te) {
              bannerText = textObj.te;
              console.log('✅ Using Telugu fallback:', bannerText);
            } else if (textObj.hi) {
              bannerText = textObj.hi;
              console.log('✅ Using Hindi fallback:', bannerText);
            }
          }
        }
        
        // Handle wrapped responses (common in REST APIs) - only if text wasn't found above
        if (!bannerText) {
          let data = responseData;
          if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
            // Check if response is wrapped in 'data' or 'result' field
            if (responseData.data) {
              console.log('🔵 Response wrapped in "data" field');
              data = responseData.data;
            } else if (responseData.result) {
              console.log('🔵 Response wrapped in "result" field');
              data = responseData.result;
            } else if (responseData.banners) {
              console.log('🔵 Response wrapped in "banners" field');
              data = responseData.banners;
            } else if (responseData.banner) {
              console.log('🔵 Response wrapped in "banner" field');
              data = responseData.banner;
            }
          }
          
          // Handle both array and single object responses
          if (Array.isArray(data)) {
            console.log('🔵 Banner response is an array with', data.length, 'items');
            if (data.length === 0) {
              console.log('⚠️ Banner array is empty - no banners in database');
              try {
                const cachedBanner = await AsyncStorage.getItem(bannerCacheKey);
                setScrollableText(cachedBanner || '');
              } catch {
                setScrollableText('');
              }
              return; // Exit early if no banners
            }
            bannersArray = data;
          } else if (data && typeof data === 'object') {
            console.log('🔵 Banner response is an object, keys:', Object.keys(data));
            // Check if it's a single banner object or has language keys
            if (data.en || data.te || data.hi || data.text) {
              // It's a single banner with language keys or text field
              bannersArray = [data];
            } else if (data.createdAt || data.created_at || data.id) {
              // It's a single banner object
              bannersArray = [data];
            } else {
              // Might be an object with language keys directly
              bannersArray = [data];
            }
          } else if (typeof data === 'string') {
            // Handle case where backend returns string directly
            console.log('🔵 Banner response is a string');
            bannerText = data;
          }
          
          // If we have an array of banners, sort and get the most recent one
          if (bannersArray.length > 0) {
            console.log('Processing', bannersArray.length, 'banners');
            const sortedBanners = sortBannersByMostRecent(bannersArray);
            const mostRecentBanner = sortedBanners[0]; // Get the most recent (first after sorting)
            console.log('Selected most recent banner:', JSON.stringify(mostRecentBanner, null, 2));
            
            // Extract text for current language from the most recent banner
            if (mostRecentBanner && typeof mostRecentBanner === 'object') {
              console.log('Looking for text in banner, current language:', currentLang);
              // Try to get text for current language
              if (mostRecentBanner[currentLang]) {
                bannerText = mostRecentBanner[currentLang];
                console.log('Found text for language', currentLang, ':', bannerText);
              } else if (mostRecentBanner.en) {
                // Fallback to English
                bannerText = mostRecentBanner.en;
                console.log('Using English fallback:', bannerText);
              } else if (mostRecentBanner.te) {
                // Fallback to Telugu
                bannerText = mostRecentBanner.te;
                console.log('Using Telugu fallback:', bannerText);
              } else if (mostRecentBanner.hi) {
                // Fallback to Hindi
                bannerText = mostRecentBanner.hi;
                console.log('Using Hindi fallback:', bannerText);
              } else if (mostRecentBanner.text) {
                // Handle case where banner has a text field (could be object with language keys)
                if (typeof mostRecentBanner.text === 'object' && mostRecentBanner.text[currentLang]) {
                  bannerText = mostRecentBanner.text[currentLang];
                  console.log('Using text object with language key:', bannerText);
                } else if (typeof mostRecentBanner.text === 'string') {
                  bannerText = mostRecentBanner.text;
                  console.log('Using text field (string):', bannerText);
                }
              } else if (mostRecentBanner.bannerText) {
                // Handle case where banner has a bannerText field
                bannerText = mostRecentBanner.bannerText;
                console.log('Using bannerText field:', bannerText);
              } else if (mostRecentBanner.message) {
                // Handle case where banner has a message field
                bannerText = mostRecentBanner.message;
                console.log('Using message field:', bannerText);
              } else {
                console.log('No text found in banner object. Available keys:', Object.keys(mostRecentBanner));
              }
            }
          }
        }
        
        // Only use backend text if it's not empty/null/undefined
        // Trim whitespace to check if it's actually empty
        if (bannerText && typeof bannerText === 'string' && bannerText.trim().length > 0) {
          const trimmedText = bannerText.trim();
          setScrollableText(trimmedText);
          try {
            await AsyncStorage.setItem(bannerCacheKey, trimmedText);
          } catch {
            // ignore banner cache write errors
          }
          console.log('✅ Banner text updated from backend (most recent):', trimmedText);
          console.log('✅ Banner text length:', trimmedText.length);
        } else {
          // Backend text is empty or not available - use cached banner if available
          console.log('⚠️ Banner text from backend is empty or not found');
          console.log('⚠️ Available banner data:', JSON.stringify(bannersArray.length > 0 ? bannersArray[0] : 'No banners', null, 2));
          try {
            const cachedBanner = await AsyncStorage.getItem(bannerCacheKey);
            setScrollableText(cachedBanner || '');
          } catch {
            setScrollableText('');
          }
        }
      } else {
        // API call failed - use cached banner if available
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = 'Unable to read error response';
        }
        console.log('❌ Banner API call failed. Status:', response.status);
        console.log('❌ Error response:', errorText);
        try {
          const cachedBanner = await AsyncStorage.getItem(bannerCacheKey);
          setScrollableText(cachedBanner || '');
        } catch {
          setScrollableText('');
        }
      }
    } catch (error) {
      // Network error or other exception - use cached banner if available
      console.error('❌ Error fetching banner:', error);
      console.error('❌ Error details:', error.message);
      try {
        const cachedBanner = await AsyncStorage.getItem(bannerCacheKey);
        setScrollableText(cachedBanner || '');
      } catch {
        setScrollableText('');
      }
    }
  }, [selectedLanguage]);
  const lastShownGreetingIdRef = useRef(null); // Track the last greeting ID that was shown
  const hasCheckedGreetingRef = useRef(false); // Track if we've already checked for greeting on mount
  const sidebarAnim = useRef(new Animated.Value(0)).current; // Animation for sidebar (0 = closed, 1 = open)

  // Helper function to sort banners by most recent (newest first)
  const sortBannersByMostRecent = (banners) => {
    return [...banners].sort((a, b) => {
      // Priority 1: Sort by createdAt (most recent first)
      if (a.createdAt && b.createdAt) {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
        }
      }
      // Priority 2: Sort by created_at (snake_case variant)
      if (a.created_at && b.created_at) {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 3: Sort by updatedAt
      if (a.updatedAt && b.updatedAt) {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 4: Sort by updated_at (snake_case variant)
      if (a.updated_at && b.updated_at) {
        const dateA = new Date(a.updated_at);
        const dateB = new Date(b.updated_at);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 5: Sort by id (assuming higher id = newer/more recently inserted)
      if (a.id != null && b.id != null) {
        // Handle both numeric and string IDs
        const idA = typeof a.id === 'number' ? a.id : parseInt(a.id, 10);
        const idB = typeof b.id === 'number' ? b.id : parseInt(b.id, 10);
        if (!isNaN(idA) && !isNaN(idB)) {
          return idB - idA; // Descending order (higher ID = newer)
        }
      }
      return 0;
    });
  };

  // Helper function to sort greetings by most recent (newest first)
  const sortGreetingsByMostRecent = (greetings) => {
    return [...greetings].sort((a, b) => {
      // Priority 1: Sort by createdAt (most recent first)
      if (a.createdAt && b.createdAt) {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
        }
      }
      // Priority 2: Sort by created_at (snake_case variant)
      if (a.created_at && b.created_at) {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 3: Sort by updatedAt
      if (a.updatedAt && b.updatedAt) {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 4: Sort by updated_at (snake_case variant)
      if (a.updated_at && b.updated_at) {
        const dateA = new Date(a.updated_at);
        const dateB = new Date(b.updated_at);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return dateB.getTime() - dateA.getTime();
        }
      }
      // Priority 5: Sort by id (assuming higher id = newer/more recently inserted)
      if (a.id != null && b.id != null) {
        // Handle both numeric and string IDs
        const idA = typeof a.id === 'number' ? a.id : parseInt(a.id, 10);
        const idB = typeof b.id === 'number' ? b.id : parseInt(b.id, 10);
        if (!isNaN(idA) && !isNaN(idB)) {
          return idB - idA; // Descending order (higher ID = newer)
        }
      }
      return 0;
    });
  };

  useFocusEffect(
    React.useCallback(() => {
      // Update badge count when screen comes into focus
      const updateBadgeOnFocus = async () => {
        await updateBadgeCount();
      };
      updateBadgeOnFocus();
      
      const loadLanguage = async () => {
        const lang = await AsyncStorage.getItem('selectedLanguage');
        if (lang) {
          setSelectedLanguage(lang);
          // Don't set default text - only fetch from backend
        }
      };
      const loadUserData = async () => {
        try {
          const authToken = await AsyncStorage.getItem('authToken');
          const storedUserDataStr = await AsyncStorage.getItem('userData');
          const storedUserData = storedUserDataStr ? JSON.parse(storedUserDataStr) : null;
          
          if (authToken && storedUserData) {
            // Fetch user details from backend API using mobile or GST
            try {
              const identifier = storedUserData.mobile || storedUserData.gstNumber;
              if (identifier) {
                // Build query parameters
                const queryParams = new URLSearchParams();
                if (storedUserData.mobile) {
                  queryParams.append('mobile', storedUserData.mobile);
                }
                if (storedUserData.gstNumber) {
                  queryParams.append('gstNumber', storedUserData.gstNumber);
                }
                
                const url = `${BACKEND_URL}/users${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
                console.log('Fetching user data from:', url);
                
                const response = await fetch(url, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                  },
                });
                
                if (response.ok) {
                  const userDataFromApi = await response.json();
                  console.log('User API response:', JSON.stringify(userDataFromApi, null, 2));
                  
                  // Handle both single user object and array response
                  let user = null;
                  if (Array.isArray(userDataFromApi)) {
                    // Find user by mobile or GST
                    user = userDataFromApi.find(u => 
                      (u.mobile && u.mobile === storedUserData.mobile) || 
                      (u.gstNumber && u.gstNumber === storedUserData.gstNumber)
                    ) || userDataFromApi[0];
                  } else {
                    user = userDataFromApi;
                  }
                  
                  if (user) {
                    console.log('Found user:', JSON.stringify(user, null, 2));
                    console.log('User approval status fields:', {
                      isApproved: user.isApproved,
                      approved: user.approved,
                      status: user.status,
                      userStatus: user.userStatus,
                      approvalStatus: user.approvalStatus
                    });
                    
                    const fullName = user.firstName && user.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user.name || user.firstName || user.lastName || null;
                    
                    // Handle different approval status formats
                    let isApproved = false;
                    if (user.isApproved !== undefined) {
                      isApproved = user.isApproved === true || user.isApproved === 'true' || user.isApproved === 'approved';
                    } else if (user.approved !== undefined) {
                      isApproved = user.approved === true || user.approved === 'true' || user.approved === 'approved';
                    } else if (user.status !== undefined) {
                      isApproved = user.status === 'approved' || user.status === 'APPROVED' || user.status === true;
                    } else if (user.userStatus !== undefined) {
                      isApproved = user.userStatus === 'approved' || user.userStatus === 'APPROVED' || user.userStatus === true;
                    } else if (user.approvalStatus !== undefined) {
                      isApproved = user.approvalStatus === 'approved' || user.approvalStatus === 'APPROVED' || user.approvalStatus === true;
                    }
                    
                    console.log('Final isApproved value:', isApproved);
                    
                    const updatedUserData = {
                      firstName: user.firstName,
                      lastName: user.lastName,
                      name: fullName,
                      mobile: user.mobile,
                      gstNumber: user.gstNumber,
                      registrationDate: user.registrationDate || user.createdAt || user.created_at,
                      isApproved: isApproved,
                    };
                    
                    console.log('Updated user data to store:', JSON.stringify(updatedUserData, null, 2));
                    
                    setUserData(updatedUserData);
                    // Update AsyncStorage with fresh data
                    await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
                  } else {
                    console.log('User not found in API response');
                    // User not found in API, use stored data
                    setUserData(storedUserData);
                  }
                } else {
                  const errorText = await response.text();
                  console.error('API failed. Status:', response.status, 'Response:', errorText);
                  // API failed, use stored data
                  setUserData(storedUserData);
                }
              } else {
                // No identifier, use stored data
                setUserData(storedUserData);
              }
            } catch (apiError) {
              console.error('Error fetching user from API:', apiError);
              // Fallback to stored data
              setUserData(storedUserData);
            }
          } else if (storedUserData) {
            // No auth token but have stored data
            setUserData(storedUserData);
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          // Fallback to AsyncStorage on error
          try {
            const userDataStr = await AsyncStorage.getItem('userData');
            if (userDataStr) {
              setUserData(JSON.parse(userDataStr));
            }
          } catch (e) {
            console.error('Error loading from AsyncStorage:', e);
          }
        }
      };
      loadLanguage();
      loadUserData();
      fetchBannerText(); // Fetch banner text from backend
      fetchProducts(true); // Refresh products when screen comes into focus (background refresh)
    }, [])
  );

  const handleLanguageChange = async (lang) => {
    setSelectedLanguage(lang);
    await AsyncStorage.setItem('selectedLanguage', lang);
    // Refresh banner text when language changes
    fetchBannerText();
  };

  const handleSaveProfile = async () => {
    // Validate inputs
    if (!editFirstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }

    if (!editLastName.trim()) {
      Alert.alert('Error', 'Last name is required');
      return;
    }

    // Validate GST if provided
    if (editGstNumber && editGstNumber.trim().length > 0) {
      const gstValidation = validateGST(editGstNumber);
      if (!gstValidation.isValid) {
        Alert.alert('Invalid GST Number', `Please enter a valid GSTIN.\n${GST_EXAMPLE}`);
        return;
      }
    }

    setIsSavingProfile(true);

    try {
      // Get current user data to identify the user
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) {
        Alert.alert('Error', 'User data not found. Please login again.');
        setIsSavingProfile(false);
        return;
      }

      const currentUserData = JSON.parse(userDataStr);
      const identifier = currentUserData.mobile || currentUserData.gstNumber;

      if (!identifier) {
        Alert.alert('Error', 'Unable to identify user. Please login again.');
        setIsSavingProfile(false);
        return;
      }

      // Prepare update request
      const updateData = {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      };

      // Add mobile OR GST for identification (prefer mobile if available)
      // Backend expects one identifier, not both
      if (currentUserData.mobile) {
        updateData.mobile = currentUserData.mobile;
      } else if (currentUserData.gstNumber) {
        updateData.gstNumber = currentUserData.gstNumber;
      }

      // Add GST number if provided
      if (editGstNumber && editGstNumber.trim().length > 0) {
        updateData.newGstNumber = editGstNumber.trim().toUpperCase();
      }

      // Get auth token if available
      const authToken = await AsyncStorage.getItem('authToken');
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
      };
      
      // Add authorization header if token exists
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      // Call backend API to update profile
      const updateUrl = `${BACKEND_URL}/update-profile`;
      console.log('Updating profile at:', updateUrl);
      console.log('Request data:', updateData);
      console.log('Headers:', headers);
      
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(updateData),
      });

      // Check HTTP status code
      if (!response.ok) {
        if (response.status === 404) {
          console.error('❌ Endpoint not found:', updateUrl);
          console.error('Response status:', response.status, response.statusText);
          Alert.alert(
            'Endpoint Not Found (404)',
            `The update profile endpoint is not available on the production server.\n\n` +
            `URL: ${updateUrl}\n\n` +
            `This endpoint works in local but needs to be deployed to production.\n\n` +
            `Please ensure the backend code with /update-profile endpoint is deployed to:\n` +
            `https://api.sainidryfruits.com`
          );
          setIsSavingProfile(false);
          return;
        }
        // Try to parse error response
        let errorMessage = `Server error (${response.status})`;
        let errorDetails = '';
        try {
          const errorData = await response.json();
          console.error('❌ Backend error response:', errorData);
          
          // Handle different error response formats
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (Array.isArray(errorData.errors)) {
            // Handle validation errors array
            errorMessage = errorData.errors.map(e => e.message || e.defaultMessage || e).join('\n');
          } else if (errorData.validationErrors) {
            // Handle validation errors object
            errorMessage = Object.values(errorData.validationErrors).join('\n');
          }
          
          // Add details if available
          if (errorData.details) {
            errorDetails = `\n\nDetails: ${errorData.details}`;
          }
          
          // Log full error for debugging
          console.error('Full error data:', JSON.stringify(errorData, null, 2));
          console.error('Request that failed:', JSON.stringify(updateData, null, 2));
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        
        Alert.alert(
          'Update Failed',
          `${errorMessage}${errorDetails}\n\n` +
          `Status: ${response.status}\n` +
          `Please check the console for more details.`
        );
        setIsSavingProfile(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Update local storage
        const updatedUserData = {
          ...currentUserData,
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          name: `${editFirstName.trim()} ${editLastName.trim()}`,
          gstNumber: editGstNumber && editGstNumber.trim().length > 0 ? editGstNumber.trim().toUpperCase() : (data.user?.gstNumber || currentUserData.gstNumber || null),
        };

        await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
        setUserData(updatedUserData);
        setIsEditingProfile(false);
        
        // Show animated success message
        setShowSuccessMessage(true);
        Animated.sequence([
          Animated.timing(successAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.back(1.2)),
            useNativeDriver: true,
          }),
          Animated.delay(2500),
          Animated.timing(successAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowSuccessMessage(false);
          // Close sidebar after showing success message
          closeSidebar();
        });
      } else {
        Alert.alert('Error', data.error || 'Failed to update profile. Please try again.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Network error. Please check your connection and try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchProducts = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
      setIsOffline(false);
    }
    try {
      // Fetch products directly from database - no caching
      const productsUrl = `${BACKEND_URL}/products`;
      
      const res = await fetch(productsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        cache: 'no-store', // Disable fetch cache
      });
      if (!res.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await res.json();
      
      // Debug: Log first product to see structure (only in development)
      if (__DEV__ && data && data.length > 0) {
        console.log('Sample product structure:', JSON.stringify(data[0], null, 2));
      }
      
      // First, set products immediately with backend change field (if available) for instant display
      const productsWithBackendChange = data.map(product => ({
        ...product,
        change: product.change !== undefined && product.change !== null 
          ? parseFloat(product.change) || 0 
          : 0,
        // Initialize imageIds as empty array - will be fetched separately
        imageIds: product.imageIds || []
      }));
      
      setProducts(productsWithBackendChange);
      await AsyncStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(productsWithBackendChange));
      if (!isBackgroundRefresh) setLoading(false); // Show products immediately - don't wait for change/charts

      const productsNeedingHistory = data;

      // Prioritize price history (1 bulk call) - charts show first. Defer imageIds to avoid connection contention.
      if (productsWithBackendChange.length > 0) {
        const getChartPrices = (ph) => {
          let d = ph;
          if (!d || !Array.isArray(d)) d = d?.content || d?.data || d?.results || [];
          if (!Array.isArray(d) || d.length < 2) return null;
          const getP = (e) => parseFloat(e?.price ?? e?.priceAmount ?? e?.value ?? 0) || 0;
          const sorted = [...d].sort((a, b) => new Date(a?.changedAt || a?.date || 0) - new Date(b?.changedAt || b?.date || 0));
          const prices = sorted.slice(-10).map(getP).filter(p => !isNaN(p));
          return prices.length >= 2 ? prices : null;
        };

        const ids = productsNeedingHistory.map(p => p.id).filter(Boolean);
        const productMap = new Map(productsNeedingHistory.map(p => [p.id, p]));

        const fetchBulkPriceHistory = async () => {
          if (ids.length === 0) return [];
          try {
            const url = `${BACKEND_URL}/products/price-history?ids=${ids.join(',')}`;
            const r = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
              cache: 'no-store',
            });
            if (!r.ok) return [];
            const bulk = await r.json();
            const results = [];
            for (const id of ids) {
              const ph = bulk[id] ?? bulk[String(id)];
              const p = productMap.get(id);
              const change = p ? computeChangeFromPriceHistory(Array.isArray(ph) ? ph : [], p.price) : 0;
              results.push({ id, change, chartPrices: getChartPrices(Array.isArray(ph) ? ph : []) });
            }
            return results;
          } catch (e) {
            if (__DEV__) console.error('StockListScreen bulk price-history error:', e);
            return [];
          }
        };

        const applyHistoryResults = (historyResults) => {
          if (!historyResults?.length) return;
          setProductChanges(prev => {
            const next = new Map(prev);
            historyResults.forEach(r => { if (r && r.id != null) next.set(String(r.id), r.change); });
            return next;
          });
          setProductChartData(prev => {
            const next = new Map(prev);
            historyResults.forEach(r => { if (r && r.id != null && r.chartPrices) next.set(String(r.id), r.chartPrices); });
            return next;
          });
        };

        // 1. Fetch price history first (1 call) - charts + change appear fast
        fetchBulkPriceHistory().then(firstResults => {
          applyHistoryResults(firstResults);
          try {
            const changes = {};
            const charts = {};
            (firstResults || []).forEach(r => {
              if (r && r.id != null) {
                changes[String(r.id)] = r.change;
                if (r.chartPrices) charts[String(r.id)] = r.chartPrices;
              }
            });
            AsyncStorage.setItem(
              PRODUCT_EXTRAS_CACHE_KEY,
              JSON.stringify({ changes, charts })
            );
          } catch {
            // ignore persist errors
          }
          // 2. Defer imageIds - fetch after charts, in batches to avoid connection saturation
          const BATCH = 10;
          const fetchImageIdsBatch = (offset) => {
            const batch = productsWithBackendChange.slice(offset, offset + BATCH);
            if (batch.length === 0) return;
            Promise.all(batch.map(async (p) => {
              try {
                const r = await fetch(`${BACKEND_URL}/products/${p.id}/images`, { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
                const data = r.ok ? await r.json() : [];
                return { productId: p.id, imageIds: Array.isArray(data) ? data : [] };
              } catch { return { productId: p.id, imageIds: [] }; }
            })).then(results => {
              setProducts(prev => {
                const imgMap = new Map(results.map(r => [r.productId, r.imageIds]));
                return prev.map(prod => ({ ...prod, imageIds: imgMap.get(prod.id) ?? prod.imageIds ?? [] }));
              });
              if (offset + BATCH < productsWithBackendChange.length) fetchImageIdsBatch(offset + BATCH);
            }).catch(() => {});
          };
          fetchImageIdsBatch(0);
        }).catch(() => {});
      }
      
      const productsWithChange = productsWithBackendChange;
      
      // Non-blocking: check product changes and badge (AsyncStorage, low priority)
      if (productsWithChange.length > 0) {
        checkProductChanges(productsWithChange).then(() =>
          getActiveNewProducts().then(activeNew => {
            const backendProductIds = new Set(productsWithChange.map(p => p.id));
            const validActiveNew = activeNew.filter(p => backendProductIds.has(p.id));
            const backendNewProducts = productsWithChange.filter(p => p.isNew === true || p.isNewProduct === true);
            const finalNewProducts = backendNewProducts.length > 0 ? backendNewProducts : validActiveNew;
            const enrichedActiveNew = finalNewProducts.map(newProduct => {
              const fullProduct = productsWithChange.find(p => p.id === newProduct.id);
              return fullProduct ? { ...fullProduct, ...newProduct, imageIds: fullProduct.imageIds || newProduct.imageIds || [] } : newProduct;
            });
            const uniqueActiveNew = enrichedActiveNew.filter((p, i, self) => self.findIndex(x => x.id === p.id) === i);
            setActiveNewProducts(uniqueActiveNew);
            updateBadgeCount();
          })
        );
      }
      
      // Successfully fetched products, clear offline state
      setIsOffline(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      
      // Check if it's a network error (offline)
      const isNetworkError = error.message.includes('Network request failed') || 
                             error.message.includes('Failed to fetch') ||
                             error.message.includes('NetworkError') ||
                             error.name === 'TypeError' ||
                             (error.message && error.message.toLowerCase().includes('network'));
      
      if (isNetworkError) {
        setIsOffline(true);
        try {
          const cachedProductsJson = await AsyncStorage.getItem(PRODUCTS_CACHE_KEY);
          const extrasJson = await AsyncStorage.getItem(PRODUCT_EXTRAS_CACHE_KEY);
          if (cachedProductsJson) {
            const cachedProducts = JSON.parse(cachedProductsJson);
            if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
              setProducts(prev => (prev.length > 0 ? prev : cachedProducts));
            }
          }
          if (extrasJson) {
            const ex = JSON.parse(extrasJson);
            if (ex.changes && typeof ex.changes === 'object') {
              setProductChanges(
                new Map(Object.entries(ex.changes).map(([k, v]) => [String(k), v]))
              );
            }
            if (ex.charts && typeof ex.charts === 'object') {
              setProductChartData(
                new Map(Object.entries(ex.charts).map(([k, v]) => [String(k), v]))
              );
            }
          }
        } catch {
          // Ignore cache errors
        }
      }
      
      if (!isBackgroundRefresh) {
        // Don't show alert for background refreshes
        if (isNetworkError) {
          // Offline - don't show alert, we'll show UI message instead
        } else {
          Alert.alert('Error', 'Failed to load products. Please try again.');
        }
      }
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  // One-time hydrate: last products, list chart data, and categories (offline / fast first paint).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [productsJson, extrasJson, categoriesJson] = await Promise.all([
          AsyncStorage.getItem(PRODUCTS_CACHE_KEY),
          AsyncStorage.getItem(PRODUCT_EXTRAS_CACHE_KEY),
          AsyncStorage.getItem(CATEGORIES_CACHE_KEY),
        ]);
        if (cancelled) return;
        if (productsJson) {
          const arr = JSON.parse(productsJson);
          if (Array.isArray(arr) && arr.length > 0) setProducts(arr);
        }
        if (extrasJson) {
          const ex = JSON.parse(extrasJson);
          if (ex.changes && typeof ex.changes === 'object') {
            setProductChanges(
              new Map(Object.entries(ex.changes).map(([k, v]) => [String(k), v]))
            );
          }
          if (ex.charts && typeof ex.charts === 'object') {
            setProductChartData(
              new Map(Object.entries(ex.charts).map(([k, v]) => [String(k), v]))
            );
          }
        }
        if (categoriesJson) {
          const cats = JSON.parse(categoriesJson);
          if (Array.isArray(cats) && cats.length > 0) setCategories(cats);
        }
      } catch (e) {
        if (__DEV__) console.warn('Offline cache hydrate failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Request notification permissions on mount
    requestNotificationPermissions();
    fetchProducts();
    
    // Fetch banner text on initial load
    fetchBannerText();
    
    // Fetch categories from API
    fetchCategories();
    
    // Load active new products
    const loadActiveNewProducts = async () => {
      try {
        const activeNew = await getActiveNewProducts();
        // Filter out deleted products (not present in latest backend products)
        const backendIds = new Set(products.map(p => p.id));
        const validActiveNew = activeNew.filter(p => backendIds.has(p.id));
        setActiveNewProducts(validActiveNew);

        // Prune deleted products from local storage to prevent them reappearing later
        if (backendIds.size > 0) {
          const storedJson = await AsyncStorage.getItem('newProductsWithTimestamps');
          if (storedJson) {
            const stored = JSON.parse(storedJson);
            const pruned = Array.isArray(stored)
              ? stored.filter(x => backendIds.has(x?.id))
              : stored;
            await AsyncStorage.setItem('newProductsWithTimestamps', JSON.stringify(pruned));
          }
        }
      } catch {
        // keep silent; fetchProducts will populate the correct list
      }
    };
    loadActiveNewProducts();
    
    // Set up automatic polling every 10 seconds for optimized updates
    // Reduced from 3 seconds to improve performance and reduce server load
    pollingIntervalRef.current = setInterval(() => {
      fetchProducts(true); // Background refresh - updates UI immediately
      fetchBannerText(); // Also refresh banner text with current language
      fetchCategories(); // Also refresh categories
    }, 10000); // 10 seconds for optimized real-time updates
    
    // Cleanup interval on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [selectedLanguage]); // Re-run when language changes

  // Update active new products periodically to remove expired ones
  useEffect(() => {
    const updateActiveNewProducts = async () => {
      try {
        const activeNew = await getActiveNewProducts();
        const backendIds = new Set(products.map(p => p.id));
        const validActiveNew = activeNew.filter(p => backendIds.has(p.id));
        setActiveNewProducts(validActiveNew);

        if (backendIds.size > 0) {
          const storedJson = await AsyncStorage.getItem('newProductsWithTimestamps');
          if (storedJson) {
            const stored = JSON.parse(storedJson);
            const pruned = Array.isArray(stored)
              ? stored.filter(x => backendIds.has(x?.id))
              : stored;
            await AsyncStorage.setItem('newProductsWithTimestamps', JSON.stringify(pruned));
          }
        }
      } catch {
        // ignore
      }
    };
    
    const interval = setInterval(updateActiveNewProducts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [products]);

  // Get translation for current language
  const t = translations[selectedLanguage] || translations.en;
  const gstValidation = validateGST(editGstNumber || '');
  const showGstError = isEditingProfile && editGstNumber.trim().length > 0 && !gstValidation.isValid;

  const handleLogout = async () => {
    setMenuVisible(false);
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try {
      // Clear authentication token and user data
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      
      // Clear time tracking data for this user
      const todayKey = new Date().toISOString().split('T')[0];
      await AsyncStorage.removeItem(`todayTimeSpent_${todayKey}`);
      await AsyncStorage.removeItem('totalTimeSpent');
      
      navigation.replace('Auth');
    } catch (error) {
      console.error('Error during logout:', error);
      navigation.replace('Auth');
    }
  };

  const cancelLogout = () => {
    setLogoutModalVisible(false);
  };

  // Sidebar animation handlers - optimized for smooth transitions
  useEffect(() => {
    if (profileModalVisible) {
      // Reset to 0 to ensure smooth slide-in from closed state
      sidebarAnim.setValue(0);
      // Smooth slide-in animation with optimized easing curve
      Animated.timing(sidebarAnim, {
        toValue: 1,
        duration: 300, // Optimal duration for smooth feel
        useNativeDriver: true,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Smooth ease-out bezier curve
      }).start();
    } else {
      // Smooth slide-out animation
      Animated.timing(sidebarAnim, {
        toValue: 0,
        duration: 250, // Slightly faster close for better UX
        useNativeDriver: true,
        easing: Easing.bezier(0.55, 0.055, 0.675, 0.19), // Smooth ease-in bezier curve
      }).start();
    }
  }, [profileModalVisible]);

  const closeSidebar = () => {
    setProfileModalVisible(false);
    setIsEditingProfile(false);
    setEditFirstName('');
    setEditLastName('');
    setEditGstNumber('');
  };

  useEffect(() => {
    // Fetch the latest greeting only once on app open
    const fetchGreeting = async () => {
      // Prevent multiple calls
      if (hasCheckedGreetingRef.current) {
        return;
      }
      hasCheckedGreetingRef.current = true;
      
      try {
        // Get the last shown greeting ID from storage
        const lastShownGreetingId = await AsyncStorage.getItem('lastShownGreetingId');
        console.log('Last shown greeting ID from storage:', lastShownGreetingId);
        
        // Store in ref for quick access
        if (lastShownGreetingId) {
          lastShownGreetingIdRef.current = lastShownGreetingId;
        }
        
        const response = await fetch(`${BACKEND_URL}/greetings`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Raw greeting API response:', data);
        
        // Sort greetings to get the most recent one
        let greetingData = null;
        
        // Handle both array and single object responses
        let greetingsArray = [];
        if (Array.isArray(data)) {
          greetingsArray = data;
        } else if (data && typeof data === 'object') {
          greetingsArray = [data];
        }
        
        if (greetingsArray.length > 0) {
          const sortedGreetings = sortGreetingsByMostRecent(greetingsArray);
          greetingData = sortedGreetings[0]; // Get the most recent (first after sorting)
          console.log('Selected most recent greeting:', greetingData);
        }
        
        if (greetingData) {
          const greetingId = String(greetingData.id);
          
          // Add the image URL to the greeting data
          const greetingWithImage = {
            ...greetingData,
            imageUrl: `${BACKEND_URL}/greetings/image/${greetingData.id}`
          };
          
          // Only set greeting if it's a new one (different ID) or if no greeting was shown before
          if (!lastShownGreetingId || lastShownGreetingId !== greetingId) {
            console.log('New greeting detected, will show splash');
            setGreeting(greetingWithImage);
          } else {
            console.log('Greeting already shown, skipping splash');
            setGreeting(null);
          }
        } else {
          console.log('No greeting data available');
          setGreeting(null);
        }
      } catch (error) {
        console.error('Error fetching greeting:', error);
        setGreeting(null);
        hasCheckedGreetingRef.current = false; // Reset on error so it can retry
      }
    };

    fetchGreeting();
  }, []);

  // Show splash greeting when greeting data becomes available (only for new greetings)
  useEffect(() => {
    if (greeting && !splashVisible && greeting.id) {
      const greetingId = String(greeting.id);
      
      // Double check: Don't show if this greeting was already shown
      if (lastShownGreetingIdRef.current === greetingId) {
        console.log('Greeting already shown (ref check), skipping splash');
        setGreeting(null);
        return;
      }
      
      // Small delay to ensure component is fully rendered
      const timer = setTimeout(() => {
        console.log('Showing splash for new greeting:', greeting.id);
        lastShownGreetingIdRef.current = greetingId; // Mark as shown in ref
        setSplashVisible(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [greeting, splashVisible]);

  // Fetch categories from API
  const fetchCategories = React.useCallback(async () => {
    try {
      const categoriesUrl = `${BACKEND_URL}/categories`;
      console.log('Fetching categories from:', categoriesUrl);
      
      const response = await fetch(categoriesUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Categories API response:', data);
        
        // Handle different response formats
        let categoriesList = [];
        
        if (Array.isArray(data)) {
          // If response is an array of category objects
          categoriesList = data.map(cat => {
            // Handle different category object structures
            let categoryValue = '';
            if (typeof cat === 'string') {
              categoryValue = cat;
            } else if (cat && typeof cat === 'object') {
              // Try different possible field names
              categoryValue = cat.name || cat.categoryName || cat.category || cat.id || String(cat);
            } else {
              categoryValue = String(cat);
            }
            // Normalize: trim whitespace
            return categoryValue.trim();
          }).filter(cat => cat && cat.length > 0);
        } else if (data && typeof data === 'object') {
          // If response is wrapped in an object
          if (data.categories && Array.isArray(data.categories)) {
            categoriesList = data.categories.map(cat => {
              const categoryValue = typeof cat === 'string' ? cat : (cat.name || cat.categoryName || cat.category || cat.id || String(cat));
              return categoryValue.trim();
            }).filter(cat => cat && cat.length > 0);
          } else if (data.data && Array.isArray(data.data)) {
            categoriesList = data.data.map(cat => {
              const categoryValue = typeof cat === 'string' ? cat : (cat.name || cat.categoryName || cat.category || cat.id || String(cat));
              return categoryValue.trim();
            }).filter(cat => cat && cat.length > 0);
          }
        }
        
        // Sort categories alphabetically
        categoriesList.sort();
        setCategories(categoriesList);
        try {
          await AsyncStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(categoriesList));
        } catch {
          // ignore
        }
        console.log('Categories fetched and set:', categoriesList);
      } else {
        console.error('Failed to fetch categories. Status:', response.status);
        try {
          const cachedCatJson = await AsyncStorage.getItem(CATEGORIES_CACHE_KEY);
          if (cachedCatJson) {
            const cachedCats = JSON.parse(cachedCatJson);
            if (Array.isArray(cachedCats) && cachedCats.length > 0) {
              setCategories(cachedCats);
              return;
            }
          }
        } catch {
          // continue to product fallback
        }
        // Fallback: extract categories from products if API fails
        const categorySet = new Set();
        products.forEach(product => {
          if (product.category) {
            const normalizedCategory = String(product.category).trim();
            if (normalizedCategory.length > 0) {
              categorySet.add(normalizedCategory);
            }
          }
        });
        const fallbackCategories = Array.from(categorySet).sort();
        setCategories(fallbackCategories);
        console.log('Categories fallback (from products):', fallbackCategories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      try {
        const cachedCatJson = await AsyncStorage.getItem(CATEGORIES_CACHE_KEY);
        if (cachedCatJson) {
          const cachedCats = JSON.parse(cachedCatJson);
          if (Array.isArray(cachedCats) && cachedCats.length > 0) {
            setCategories(cachedCats);
            return;
          }
        }
      } catch {
        // continue to product fallback
      }
      // Fallback: extract categories from products on error
      const categorySet = new Set();
      products.forEach(product => {
        if (product.category) {
          const normalizedCategory = String(product.category).trim();
          if (normalizedCategory.length > 0) {
            categorySet.add(normalizedCategory);
          }
        }
      });
      const fallbackCategories = Array.from(categorySet).sort();
      setCategories(fallbackCategories);
      console.log('Categories fallback (from products, error):', fallbackCategories);
    }
  }, [products]);

  // Helper function to check if product is disabled/out of stock
  const isProductDisabled = React.useCallback((item) => {
    // Primary check: backend uses "disabled" field as boolean (true = disabled)
    if (item.disabled === true) return true;
    
    // Check other possible field names for compatibility
    const checkField = (value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'boolean') return value === false;
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return lower === 'disabled' || lower === 'false' || lower === 'inactive' || lower === 'unavailable';
      }
      return false;
    };
    
    return checkField(item.state) ||
           checkField(item.status) ||
           checkField(item.enabled) ||
           checkField(item.isEnabled) ||
           checkField(item.active) ||
           checkField(item.isActive) ||
           checkField(item.available) ||
           checkField(item.inStock) ||
           checkField(item.productState) ||
           checkField(item.productStatus);
  }, []);

  // Filter and sort products - out of stock items at the end
  const filteredProducts = React.useMemo(() => {
    // First filter by search query and category
    const filtered = products.filter(item => {
      // Search only in product name (all languages) - not description or other fields
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        
        const nameEn = (item.name?.en || '').toLowerCase();
        const nameTe = (item.name?.te || '').toLowerCase();
        const nameHi = (item.name?.hi || '').toLowerCase();
        const nameString = (typeof item.name === 'string' ? item.name : '').toLowerCase();
        
        const matchesSearch = 
          nameEn.includes(query) ||
          nameTe.includes(query) ||
          nameHi.includes(query) ||
          nameString.includes(query);
        
        if (!matchesSearch) {
          return false;
        }
      }
      
      // Filter by category - normalize for comparison (trim and case-insensitive)
      let matchesCategory = true;
      if (selectedCategory) {
        const productCategory = item.category ? String(item.category).trim().toLowerCase() : '';
        const selectedCat = String(selectedCategory).trim().toLowerCase();
        matchesCategory = productCategory === selectedCat;
      }
      
      return matchesCategory;
    });
    
    // Sort: in-stock products first, out of stock products last
    return filtered.sort((a, b) => {
      const aDisabled = isProductDisabled(a);
      const bDisabled = isProductDisabled(b);
      
      // If both are disabled or both are enabled, maintain original order
      if (aDisabled === bDisabled) {
        return 0;
      }
      
      // Disabled items go to the end (return 1 means a comes after b)
      return aDisabled ? 1 : -1;
    });
  }, [products, searchQuery, selectedCategory, isProductDisabled]);
  
  // Debug: Log filtered results when category changes
  React.useEffect(() => {
    if (__DEV__ && selectedCategory) {
      console.log(`Category filter active: "${selectedCategory}", showing ${filteredProducts.length} products`);
      // Log sample product categories for debugging
      if (products.length > 0) {
        const sampleCategories = [...new Set(products.slice(0, 5).map(p => p.category).filter(Boolean))];
        console.log('Sample product categories:', sampleCategories);
      }
    }
  }, [selectedCategory, filteredProducts.length, products]);

  const handleProductPress = (item) => {
    // Validate item before navigation
    if (!item || !item.id) {
      console.error('Invalid item for navigation:', item);
      return;
    }
    
    try {
      navigation.navigate('StockDetail', { stock: item });
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const renderProductItem = React.useCallback(({ item }) => (
    <ProductItem
      item={{ ...item, change: productChanges.get(String(item.id)) ?? productChanges.get(item.id) ?? item.change ?? 0 }}
      chartPrices={productChartData.get(String(item.id)) ?? productChartData.get(item.id)}
      selectedLanguage={selectedLanguage}
      t={t}
      onProductPress={handleProductPress}
    />
  ), [selectedLanguage, t, productChanges, productChartData]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.text === '#fff' ? "light" : "dark"} />
      
      <Header
        selectedLanguage={selectedLanguage}
        onLanguageChange={handleLanguageChange}
        onMenuPress={() => setMenuVisible(true)}
        onLogout={handleLogout}
        onProfilePress={() => setProfileModalVisible(true)}
        onSearchPress={() => setSearchVisible((v) => !v)}
        searchVisible={searchVisible}
        t={t}
      />

      {/* Search Bar - only shown when search icon tapped */}
      {searchVisible && (
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          t={t}
          autoFocus
        />
      )}

      {/* Auto-Scrollable Text Banner */}
      <AutoScrollTextBanner text={scrollableText} colors={colors} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled
        style={{ flex: 1 }}
      >
      {isOffline && filteredProducts.length === 0 ? (
        <View style={styles.offlineContainer}>
          <MaterialCommunityIcons name="wifi-off" size={64} color={colors.textSecondary} />
          <Text style={[styles.offlineTitle, { color: colors.text }]}>No Internet Connection</Text>
          <Text style={[styles.offlineMessage, { color: colors.textSecondary }]}>
            Open the app once while online to save products locally. Then you can browse them offline.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchProducts()}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          extraData={`${productChanges.size}-${productChartData.size}`}
          keyExtractor={(item) => item.id ? item.id.toString() : `product-${item.name || 'unknown'}`}
          contentContainerStyle={[
            styles.listContent,
            {
              flexGrow: 1,
              paddingBottom: bottomPadding + (keyboardHeight > 0 ? keyboardHeight + 16 : 2),
            },
          ]}
          renderItem={renderProductItem}
          style={{ backgroundColor: colors.background }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={10}
          ListHeaderComponent={
            <>
              {isOffline && filteredProducts.length > 0 && (
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginBottom: 10,
                    backgroundColor: colors.surface,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13 }}>
                    Offline — showing saved products and charts from your last online session.
                  </Text>
                </View>
              )}
              {/* New Product Launch Banner */}
              {activeNewProducts.length > 0 && (
                <View style={[styles.newProductContainer, { backgroundColor: colors.card || '#1a1a1a' }]}>
                  <View style={styles.newProductHeader}>
                    <View style={styles.newProductTitleRow}>
                      <MaterialCommunityIcons name="star-circle" size={24} color={colors.primary || '#007AFF'} />
                      <Text style={[styles.newProductTitle, { color: colors.text }]}>{t.newProductLaunch}</Text>
                    </View>
                  </View>
                  <FlatList
                    data={activeNewProducts}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item, index) => item.id ? `new-product-${item.id}-${index}` : `new-product-${index}`}
                    renderItem={({ item }) => {
                      const productName = typeof item.name === 'string' 
                        ? item.name 
                        : item.name?.[selectedLanguage] || item.name?.en || (item.name && typeof item.name === 'object' ? item.name[Object.keys(item.name)[0]] : null) || 'New Product';
                      
                      // Get first image if available - check multiple possible field names and structures
                      let imageIds = item.imageIds || item.images || item.image_id || [];
                      // Handle case where imageIds might be in fullProduct
                      if (!imageIds || (Array.isArray(imageIds) && imageIds.length === 0)) {
                        imageIds = item.fullProduct?.imageIds || [];
                      }
                      
                      let firstImageId = Array.isArray(imageIds) && imageIds.length > 0 
                        ? imageIds[0] 
                        : (typeof imageIds === 'string' && imageIds.length > 0 ? imageIds : null);
                      
                      // Validate and convert imageId to number (Long) as backend expects
                      let validImageId = null;
                      if (firstImageId !== null && firstImageId !== undefined) {
                        // Convert to number for validation
                        const numId = typeof firstImageId === 'number' ? firstImageId : Number(firstImageId);
                        
                        // Validate it's a positive integer (Long)
                        if (!isNaN(numId) && numId > 0 && Number.isInteger(numId)) {
                          // Also check for string placeholders
                          const idStr = String(firstImageId).trim();
                          if (idStr !== '' && idStr !== '{id}' && idStr !== 'id' && idStr !== 'null' && idStr !== 'undefined') {
                            validImageId = numId;
                          }
                        }
                      }
                      
                      // Fetch image directly from database - no caching
                      // Backend expects Long: /products/image/{imageId}
                      const imageUri = validImageId ? `${BACKEND_URL}/products/image/${validImageId}` : null;
                      
                      return (
                        <TouchableOpacity
                          style={[styles.newProductCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}
                          onPress={() => handleProductPress(item)}
                          activeOpacity={0.7}
                        >
                          {/* Product Image */}
                          {imageUri ? (
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.newProductImage}
                              resizeMode="cover"
                              onError={(error) => {
                                if (__DEV__) {
                                  console.error('🔴 StockListScreen: New product image failed to load:', imageUri, error);
                                }
                                // Image will not display if it fails to load
                              }}
                              key={`new-product-image-${item.id}-${validImageId}`}
                            />
                          ) : (
                            <View style={[styles.newProductImagePlaceholder, { backgroundColor: colors.card }]}>
                              <MaterialCommunityIcons name="image-off" size={24} color={colors.textSecondary} />
                            </View>
                          )}
                          
                          {/* Product Info */}
                          <View style={styles.newProductInfo}>
                            <Text style={[styles.newProductName, { color: colors.text }]} numberOfLines={2}>
                              {productName}
                            </Text>
                            {(item.price != null && item.price !== '') && (
                              <Text style={[styles.newProductPrice, { color: colors.primary || '#007AFF' }]}>
                                ₹{parseFloat(item.price).toFixed(2)}
                              </Text>
                            )}
                          </View>
                          
                          {/* New Badge */}
                          <View style={[styles.newBadge, { backgroundColor: colors.primary || '#007AFF' }]}>
                            <MaterialCommunityIcons name="star" size={8} color="#fff" />
                            <Text style={styles.newBadgeText}>NEW</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    contentContainerStyle={styles.newProductList}
                  />
                </View>
              )}

              {/* Category Filter Chips */}
              {categories.length > 0 && (
                <View style={[styles.categoryChipsContainer, { backgroundColor: colors.background }]}>
                  <FlatList
                    data={[{ id: 'all', name: 'All', key: 'all' }, ...categories.map((cat, index) => ({ id: cat, name: cat, key: `cat-${index}-${cat}` }))]}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item, index) => item.key || `category-${index}`}
                    contentContainerStyle={styles.categoryChipsRow}
                    renderItem={({ item }) => {
                      const isSelected = item.id === 'all' ? !selectedCategory : selectedCategory === item.id;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.categoryChip,
                            { 
                              backgroundColor: isSelected ? colors.primary : colors.card,
                              borderColor: colors.border
                            }
                          ]}
                          onPress={() => setSelectedCategory(item.id === 'all' ? null : item.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={[
                            styles.categoryChipText,
                            { 
                              color: isSelected ? colors.white : colors.text,
                              fontWeight: isSelected ? '600' : '500'
                            }
                          ]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              )}
            </>
          }
        />
      )}
      </KeyboardAvoidingView>

      <MenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onLogout={handleLogout}
        t={t}
      />

      <SplashGreeting
        greeting={greeting}
        visible={splashVisible}
        onClose={async () => {
          // Save the greeting ID to AsyncStorage so it won't show again
          if (greeting && greeting.id) {
            const greetingId = String(greeting.id);
            await AsyncStorage.setItem('lastShownGreetingId', greetingId);
            lastShownGreetingIdRef.current = greetingId; // Update ref
            console.log('Saved greeting ID to storage:', greeting.id);
          }
          setSplashVisible(false);
          // Clear greeting state to prevent re-showing
          setGreeting(null);
        }}
      />

      {/* User Profile Sidebar */}
      {profileModalVisible && (
        <>
          {/* Overlay - blocks background interactions, only cross mark closes sidebar */}
          <Animated.View
            style={[
              styles.sidebarOverlay,
              styles.sidebarOverlayAnimated,
              {
                opacity: sidebarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.6], // Slightly darker for better visibility
                }),
              },
            ]}
            pointerEvents="auto"
          />

          {/* Sidebar with smooth slide animation */}
          <Animated.View
            style={[
              styles.sidebarContainer,
              {
                backgroundColor: colors.card,
                transform: [
                  {
                    translateX: sidebarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-300, 0],
                    }),
                  },
                ],
                opacity: sidebarAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.8, 1], // Fade in as it slides for smoother transition
                }),
              },
            ]}
          >
            <View style={styles.sidebarHeader}>
              <Text style={[styles.sidebarTitle, { color: colors.text }]}>User Profile</Text>
              <TouchableOpacity
                onPress={closeSidebar}
                style={styles.sidebarCloseButton}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.sidebarContentWrapper}>
              <ScrollView
                showsVerticalScrollIndicator={true}
                contentContainerStyle={[styles.sidebarScrollContent, { paddingBottom: bottomPadding + 16 }]}
                style={styles.sidebarScrollView}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {userData && (
                  <View style={styles.profileContent}>
                    <View style={styles.profileDetails}>
                      {/* Name - Editable */}
                      <View style={[styles.profileDetailRow, { borderBottomColor: colors.border }]}>
                        <MaterialCommunityIcons name="account-outline" size={20} color={colors.textSecondary} />
                        <View style={[styles.profileDetailInfo, { flex: 1 }]}>
                          <View style={styles.profileDetailHeader}>
                            <Text style={[styles.profileDetailLabel, { color: colors.textSecondary }]}>Name</Text>
                            {!isEditingProfile && (
                              <TouchableOpacity
                                onPress={() => {
                                  setEditFirstName(userData.firstName || '');
                                  setEditLastName(userData.lastName || '');
                                  setEditGstNumber(userData.gstNumber || '');
                                  setIsEditingProfile(true);
                                }}
                                style={styles.editIconButton}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
                              </TouchableOpacity>
                            )}
                          </View>
                          {isEditingProfile ? (
                            <View style={styles.editFieldsContainer}>
                              <TextInput
                                style={[styles.profileEditInput, { color: colors.text, borderColor: colors.border }]}
                                placeholder="First Name"
                                placeholderTextColor={colors.textSecondary}
                                value={editFirstName}
                                onChangeText={setEditFirstName}
                                autoCapitalize="words"
                              />
                              <TextInput
                                style={[styles.profileEditInput, { color: colors.text, borderColor: colors.border }]}
                                placeholder="Last Name"
                                placeholderTextColor={colors.textSecondary}
                                value={editLastName}
                                onChangeText={setEditLastName}
                                autoCapitalize="words"
                              />
                            </View>
                          ) : (
                            <Text style={[styles.profileDetailValue, { color: colors.text }]}>
                              {userData.firstName && userData.lastName 
                                ? `${userData.firstName} ${userData.lastName}` 
                                : userData.name || userData.firstName || userData.lastName || 'N/A'}
                            </Text>
                          )}
                        </View>
                      </View>
                      
                      {userData.mobile && (
                        <View style={[styles.profileDetailRow, { borderBottomColor: colors.border }]}>
                          <MaterialCommunityIcons name="cellphone" size={20} color={colors.textSecondary} />
                          <View style={styles.profileDetailInfo}>
                            <Text style={[styles.profileDetailLabel, { color: colors.textSecondary }]}>Mobile Number</Text>
                            <Text style={[styles.profileDetailValue, { color: colors.text }]}>{userData.mobile}</Text>
                          </View>
                        </View>
                      )}
                      
                      {/* GST Number - Always show, even if empty - Editable */}
                      <View style={[styles.profileDetailRow, { borderBottomColor: colors.border }]}>
                        <MaterialCommunityIcons name="card-account-details" size={20} color={colors.textSecondary} />
                        <View style={[styles.profileDetailInfo, { flex: 1 }]}>
                          <Text style={[styles.profileDetailLabel, { color: colors.textSecondary }]}>GST Number</Text>
                          {isEditingProfile ? (
                            <>
                              <TextInput
                                style={[styles.profileEditInput, { color: colors.text, borderColor: colors.border }]}
                                placeholder="Enter GST (optional)"
                                placeholderTextColor={colors.textSecondary}
                                value={editGstNumber}
                                onChangeText={(text) => setEditGstNumber(formatGST(text))}
                                keyboardType="default"
                                autoCapitalize="characters"
                                maxLength={15}
                              />
                              <Text style={[styles.gstHelperText, { color: showGstError ? colors.error : colors.textSecondary }]}>
                                {showGstError ? `Invalid GST. ${GST_EXAMPLE}` : GST_EXAMPLE}
                              </Text>
                            </>
                          ) : (
                            <Text style={[styles.profileDetailValue, { color: colors.text }]}>
                              {userData.gstNumber || 'Not added'}
                            </Text>
                          )}
                        </View>
                      </View>
                      
                      {userData.registrationDate && (
                        <View style={[styles.profileDetailRow, { borderBottomColor: colors.border }]}>
                          <MaterialCommunityIcons name="calendar" size={20} color={colors.textSecondary} />
                          <View style={styles.profileDetailInfo}>
                            <Text style={[styles.profileDetailLabel, { color: colors.textSecondary }]}>Member Since</Text>
                            <Text style={[styles.profileDetailValue, { color: colors.text }]}>
                              {new Date(userData.registrationDate).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      <View style={[styles.profileDetailRow]}>
                        <MaterialCommunityIcons 
                          name={userData.isApproved ? "check-circle" : "clock-outline"} 
                          size={20} 
                          color={userData.isApproved ? colors.primary : colors.textSecondary} 
                        />
                        <View style={styles.profileDetailInfo}>
                          <Text style={[styles.profileDetailLabel, { color: colors.textSecondary }]}>Account Status</Text>
                          <Text style={[styles.profileDetailValue, { color: userData.isApproved ? colors.primary : colors.textSecondary }]}>
                            {userData.isApproved ? 'Approved' : 'Pending Approval'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Save/Cancel Buttons when editing */}
              {isEditingProfile && userData && (
                <View style={[styles.editProfileContainer, { borderTopColor: colors.border }]}>
                  <View style={styles.editButtonsRow}>
                    <TouchableOpacity
                      style={[styles.cancelButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => {
                        setIsEditingProfile(false);
                        setEditFirstName('');
                        setEditLastName('');
                        setEditGstNumber('');
                      }}
                      activeOpacity={0.8}
                      disabled={isSavingProfile}
                    >
                      <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.primary }]}
                      onPress={handleSaveProfile}
                      activeOpacity={0.8}
                      disabled={isSavingProfile}
                    >
                      <Text style={styles.saveButtonText}>
                        {isSavingProfile ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Version Information at Bottom */}
              <View
                style={[
                  styles.sidebarFooter,
                  { borderTopColor: colors.border, paddingBottom: bottomPadding + 20 },
                ]}
              >
                <Text style={[styles.companyText, { color: colors.textSecondary }]}>
                  Saini Group
                </Text>
                <Text style={[styles.versionText, { color: colors.textSecondary }]}>
                  Version 1.0.0
                </Text>
              </View>
            </View>
          </Animated.View>
        </>
      )}

      {/* Success Message Overlay */}
      {showSuccessMessage && (
        <Animated.View
          style={[
            styles.successOverlay,
            {
              opacity: successAnim,
              transform: [
                {
                  scale: successAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
                {
                  translateY: successAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.successContainer, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={[styles.successIconContainer, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="check-circle" size={48} color="#fff" />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Profile Updated!</Text>
            <Text style={[styles.successMessage, { color: colors.textSecondary }]}>
              Your profile has been updated successfully
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Custom Logout Confirmation Modal */}
      <Modal
        visible={logoutModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card || '#1a1a1a' }]}>
            <View style={styles.modalHeader}>
              <Ionicons 
                name="log-out-outline" 
                size={32} 
                color={colors.primary || '#007AFF'} 
              />
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Confirm Logout
              </Text>
            </View>
            
            <Text style={[styles.modalMessage, { color: colors.text }]}>
              Are you sure you want to logout from your account?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={cancelLogout}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.logoutButton, { backgroundColor: colors.primary || '#007AFF' }]}
                onPress={confirmLogout}
                activeOpacity={0.8}
              >
                <Text style={[styles.logoutButtonText, { color: colors.white }]}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 0,
  },
  categoryChipsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  categoryChipsRow: {
    paddingRight: 20,
    gap: 8,
  },
  categoryChip: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  newProductContainer: {
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  newProductHeader: {
    marginBottom: 12,
  },
  newProductTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newProductTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  newProductList: {
    paddingVertical: 4,
  },
  newProductCard: {
    width: 100,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  newProductImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#f0f0f0',
  },
  newProductImagePlaceholder: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProductInfo: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProductName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
    minHeight: 28,
  },
  newProductPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  newBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  scrollableBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
    height: 40,
    justifyContent: 'center',
  },
  scrollableTextContainer: {
    height: 20,
    overflow: 'hidden',
  },
  scrollableTextScrollView: {
    flex: 1,
  },
  scrollableTextScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollableTextWrapper: {
    flexDirection: 'row',
  },
  scrollableText: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    paddingRight: 50,
    flexShrink: 0,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.9,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  logoutButton: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  sidebarOverlayAnimated: {
    flex: 1,
    backgroundColor: '#000',
  },
  sidebarContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  sidebarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  sidebarCloseButton: {
    padding: 4,
  },
  sidebarContentWrapper: {
    flex: 1,
    flexDirection: 'column',
  },
  sidebarScrollView: {
    flex: 1,
  },
  sidebarScrollContent: {
    padding: 20,
    paddingBottom: 10,
  },
  editProfileContainer: {
    padding: 20,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  },
  editButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  editIconButton: {
    padding: 4,
  },
  editFieldsContainer: {
    gap: 8,
  },
  profileEditInput: {
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  gstHelperText: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  offlineMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  successContainer: {
    width: '85%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  sidebarFooter: {
    padding: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  companyText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  profileContent: {
    alignItems: 'center',
  },
  profileAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileDetails: {
    width: '100%',
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  profileDetailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  profileDetailLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  profileDetailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
}); 