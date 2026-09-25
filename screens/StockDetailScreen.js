import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions, Image, FlatList, Modal, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { LineChart as SVGLineChart, AreaChart, Grid } from 'react-native-svg-charts';
import * as shape from 'd3-shape';
import { Circle, G, Line as SvgLine, Rect, Text as SvgText, Stop as SvgStop, Defs, LinearGradient } from 'react-native-svg';
import { Animated, Easing, PanResponder } from 'react-native';
import { PinchGestureHandler, PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { translations, getProductName } from '../utils/translations';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

const BOTTOM_NAV_PADDING_ANDROID = 28;
const PRICE_HISTORY_CACHE_PREFIX = 'priceHistory:';

export default function StockDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const { stock: initialStock } = route.params;
  
  // Initialize stock with imageIds from passed product (if available)
  // This ensures images show immediately while fresh data is being fetched
  const [stock, setStock] = React.useState(() => {
    if (!initialStock) return null;
    
    // Extract imageIds from various possible field names
    let imageIds = initialStock.imageIds || initialStock.images || initialStock.image_id || initialStock.imageId || [];
    
    // Ensure it's an array
    if (typeof imageIds === 'string' && imageIds.length > 0) {
      imageIds = [imageIds];
    } else if (!Array.isArray(imageIds)) {
      imageIds = [];
    }
    
    if (__DEV__) {
      console.log('🟢 StockDetailScreen: Initializing with product data', {
        productId: initialStock.id,
        initialImageIds: imageIds,
        imageIdsLength: imageIds.length
      });
    }
    
    return {
      ...initialStock,
      imageIds: imageIds
    };
  });
  
  const [priceHistory, setPriceHistory] = React.useState([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = React.useState(false);
  const [selectedLanguage, setSelectedLanguage] = React.useState('en');
  const [activeTab, setActiveTab] = React.useState('chart'); // 'chart', 'history', 'analytics'
  const [imageModalVisible, setImageModalVisible] = React.useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = React.useState(0);
  const [failedImageIds, setFailedImageIds] = React.useState(new Set()); // Track images that failed to load
  const [isFetchingProduct, setIsFetchingProduct] = React.useState(false);
  
  // Zoom state for image modal
  const baseScale = React.useRef(new Animated.Value(1)).current;
  const pinchScale = React.useRef(new Animated.Value(1)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;
  const lastScale = React.useRef(1);
  const lastTranslate = React.useRef({ x: 0, y: 0 });
  const pinchRef = React.useRef(null);
  const panRef = React.useRef(null);
  
  const t = translations[selectedLanguage] || translations.en;

  // Get actual product images from stock data
  const productImages = React.useMemo(() => {
    if (!stock) {
      if (__DEV__) {
        console.log('🔴 StockDetailScreen: No stock data provided');
      }
      return [];
    }
    
    // Check multiple possible field names for image IDs
    let imageIds = stock.imageIds || stock.images || stock.image_id || stock.imageId || [];
    
    // Handle case where imageIds might be a string (single image)
    if (typeof imageIds === 'string' && imageIds.length > 0) {
      imageIds = [imageIds];
    }
    
    // Ensure imageIds is an array
    if (!Array.isArray(imageIds)) {
      imageIds = [];
    }
    
    // Filter out invalid values
    imageIds = imageIds.filter(id => id !== null && id !== undefined && id !== '');
    
    if (__DEV__) {
      console.log('🟡 StockDetailScreen: Product images check', {
        productId: stock.id,
        productName: stock.name,
        imageIds: imageIds,
        imageIdsLength: imageIds.length,
        stockKeys: Object.keys(stock)
      });
    }
    
    if (imageIds.length === 0) {
      if (__DEV__) {
        console.log('🔴 StockDetailScreen: No imageIds found for product', stock.id);
      }
      return [];
    }
    
    // Fetch images directly from database - no caching
    // Backend expects Long imageId: /products/image/{imageId}
    const images = imageIds
      .filter(imageId => {
        // Validate imageId - must be a valid number (Long) and not a placeholder
        if (imageId === null || imageId === undefined) return false;
        
        // Convert to number for validation
        const numId = typeof imageId === 'number' ? imageId : Number(imageId);
        if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
          if (__DEV__) {
            console.warn('⚠️ StockDetailScreen: Invalid imageId (must be positive integer):', imageId);
          }
          return false;
        }
        
        // Also check for string placeholders
        const idStr = String(imageId).trim();
        if (idStr === '' || idStr === '{id}' || idStr === 'id' || idStr === 'null' || idStr === 'undefined') {
          if (__DEV__) {
            console.warn('⚠️ StockDetailScreen: Invalid imageId placeholder filtered out:', imageId);
          }
          return false;
        }
        
        // Filter out images that failed to load (404 or other errors)
        if (failedImageIds.has(numId)) {
          if (__DEV__) {
            console.log('⚠️ StockDetailScreen: Filtering out failed imageId:', numId);
          }
          return false;
        }
        
        return true;
      })
      .map((imageId, index) => {
        // Convert to number (Long) as backend expects
        const numId = typeof imageId === 'number' ? imageId : Number(imageId);
        // Use number directly in URL (backend will parse as Long)
        const imageUri = `${BACKEND_URL}/products/image/${numId}`;
        if (__DEV__) {
          console.log(`🟢 StockDetailScreen: Creating image URI for product ${stock.id}:`, {
            originalImageId: imageId,
            numericImageId: numId,
            imageUri: imageUri
          });
        }
        return {
          id: numId,
          uri: imageUri,
          index: index
        };
      });
    
    if (__DEV__) {
      console.log('✅ StockDetailScreen: Product images created', images.length, 'images');
    }
    
    return images;
  }, [stock?.imageIds, stock?.id, failedImageIds]);

  // Validate stock data
  if (!stock || !stock.id) {
    console.error('Invalid stock data:', stock);
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>Invalid product data</Text>
        </View>
      </View>
    );
  }

  const productName = getProductName(stock.name, selectedLanguage, t);

  // Get product description for current language
  const getProductDescription = (description, lang) => {
    if (!description) return '';
    if (typeof description === 'string') return description;
    return description[lang] || description.en || description.te || description.hi || '';
  };
  const productDescription = getProductDescription(stock.description, selectedLanguage);

  useFocusEffect(
    React.useCallback(() => {
      const loadLanguage = async () => {
        const lang = await AsyncStorage.getItem('selectedLanguage');
        if (lang) setSelectedLanguage(lang);
      };
      loadLanguage();
    }, [])
  );

  // Reset failed images when product changes
  React.useEffect(() => {
    setFailedImageIds(new Set());
  }, [stock?.id]);

  // Fetch imageIds using the dedicated API endpoint: /products/{productId}/images
  // This runs when the screen loads and when it comes into focus
  const fetchProductImageIds = React.useCallback(async () => {
    if (!stock || !stock.id) {
      if (__DEV__) {
        console.log('⚠️ StockDetailScreen: Cannot fetch imageIds - no stock or stock.id');
      }
      return;
    }
    
    // Always fetch imageIds from the dedicated endpoint to ensure we have the latest data
    if (isFetchingProduct) {
      if (__DEV__) {
        console.log('⚠️ StockDetailScreen: Already fetching imageIds, skipping duplicate request');
      }
      return; // Prevent duplicate fetches
    }
    
    setIsFetchingProduct(true);
    
    try {
      if (__DEV__) {
        console.log('🟡 StockDetailScreen: Fetching imageIds for product', stock.id, 'using /products/{productId}/images');
      }
      
      // Use the dedicated endpoint: GET /products/{productId}/images
      // Returns: List<Long> of imageIds
      const response = await fetch(`${BACKEND_URL}/products/${stock.id}/images`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        cache: 'no-store', // Disable fetch cache
      });
      
      if (response.ok) {
        const imageIds = await response.json();
        
        // Ensure imageIds is always an array
        const validImageIds = Array.isArray(imageIds) ? imageIds : [];
        
        if (__DEV__) {
          console.log('✅ StockDetailScreen: Fetched imageIds from API', {
            productId: stock.id,
            rawResponse: imageIds,
            imageIds: validImageIds,
            imageIdsType: Array.isArray(imageIds) ? 'Array' : typeof imageIds,
            imageIdsLength: validImageIds.length,
            imageIdsContent: JSON.stringify(validImageIds)
          });
        }
        
        // Update stock with fetched imageIds - create new array reference to force update
        setStock(prevStock => {
          // Create a new array reference to ensure React detects the change
          const newImageIds = [...validImageIds];
          
          const newStock = {
            ...prevStock,
            imageIds: newImageIds
          };
          
          if (__DEV__) {
            console.log('🔄 StockDetailScreen: Updating stock with imageIds', {
              prevImageIds: prevStock.imageIds,
              prevImageIdsRef: prevStock.imageIds,
              newImageIds: newImageIds,
              newImageIdsRef: newImageIds,
              areEqual: JSON.stringify(prevStock.imageIds) === JSON.stringify(newImageIds),
              stockId: newStock.id
            });
          }
          
          return newStock;
        });
      } else {
        if (__DEV__) {
          console.error('🔴 StockDetailScreen: Failed to fetch imageIds', response.status);
        }
        // If API fails, set empty array to avoid showing stale images
        setStock(prevStock => ({
          ...prevStock,
          imageIds: []
        }));
      }
    } catch (error) {
      if (__DEV__) {
        console.error('🔴 StockDetailScreen: Error fetching imageIds', error);
      }
      // On error, set empty array
      setStock(prevStock => ({
        ...prevStock,
        imageIds: []
      }));
    } finally {
      setIsFetchingProduct(false);
    }
  }, [stock?.id, isFetchingProduct]);
  
  // Fetch imageIds when component mounts or product ID changes
  React.useEffect(() => {
    fetchProductImageIds();
  }, [stock?.id, fetchProductImageIds]);
  
  // Also fetch when screen comes into focus to ensure fresh data
  useFocusEffect(
    React.useCallback(() => {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        if (stock?.id && !isFetchingProduct) {
          fetchProductImageIds();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }, [stock?.id, fetchProductImageIds, isFetchingProduct])
  );

  // Get local date string YYYY-MM-DD (avoids UTC timezone issues)
  const toLocalDateKey = React.useCallback((date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const parseDateValue = React.useCallback((value) => {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : new Date(value.getTime());
    }

    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      const dt = new Date(ms);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // Interprets 11/03/2026 as 11 Mar 2026 (DD/MM/YYYY). Do this BEFORE `new Date(raw)` so US MM/DD parsing
    // does not push "create date" past real history / March rows from the API.
    const dmY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dmY) {
      const day = parseInt(dmY[1], 10);
      const month = parseInt(dmY[2], 10);
      const year = parseInt(dmY[3], 10);
      const hour = dmY[4] ? parseInt(dmY[4], 10) : 0;
      const minute = dmY[5] ? parseInt(dmY[5], 10) : 0;
      const second = dmY[6] ? parseInt(dmY[6], 10) : 0;
      const dt = new Date(year, month - 1, day, hour, minute, second);
      if (
        !isNaN(dt.getTime()) &&
        dt.getFullYear() === year &&
        dt.getMonth() === month - 1 &&
        dt.getDate() === day
      ) {
        return dt;
      }
    }

    // ISO-8601: some engines (e.g. Hermes) reject fractional seconds past ms — keep 3 decimal places only.
    let isoCandidate = raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
      isoCandidate = raw.replace(/(\.\d{3})\d+(?=[Z+-]|$)/, '$1');
    }
    const direct = new Date(isoCandidate);
    if (!isNaN(direct.getTime())) return direct;

    return null;
  }, []);

  // Helper function to fill missing dates with last known price
  const fillMissingDates = React.useCallback((historyData, daysToFill = 30) => {
    if (!historyData || historyData.length === 0) return [];
    
    const filled = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = toLocalDateKey(today);
    
    // Get the earliest date from history or use daysToFill days ago
    const earliestDate = historyData.length > 0 
      ? new Date(historyData[0].date)
      : new Date(today);
    earliestDate.setDate(earliestDate.getDate() - daysToFill);
    earliestDate.setHours(0, 0, 0, 0);
    
    // Create a map of existing dates for quick lookup
    const dateMap = new Map();
    historyData.forEach(entry => {
      const dateKey = entry.date;
      if (!dateMap.has(dateKey) || new Date(entry.date) > new Date(dateMap.get(dateKey).date)) {
        dateMap.set(dateKey, entry);
      }
    });
    
    // Fill in all dates from earliest to today
    let currentDate = new Date(earliestDate);
    let lastKnownPrice = historyData.length > 0 ? historyData[0].price : (parseFloat(stock.price) || 0);
    let lastKnownEntry = historyData.length > 0 ? historyData[0] : null;
    
    while (currentDate <= today) {
      const dateKey = toLocalDateKey(currentDate);
      
      if (dateMap.has(dateKey)) {
        // Use existing entry
        const entry = dateMap.get(dateKey);
        filled.push({
          ...entry,
          date: dateKey,
          isFilled: false, // Actual price change
        });
        lastKnownPrice = entry.price;
        lastKnownEntry = entry;
      } else {
        // Fill with last known price
        filled.push({
          id: `filled-${dateKey}`,
          price: lastKnownPrice,
          date: dateKey,
          changedAt: lastKnownEntry?.changedAt || currentDate.toISOString(),
          isFilled: true, // Filled date, not actual change
          isCurrentPrice: dateKey === todayKey,
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return filled;
  }, [stock.price, toLocalDateKey]);

  // Function to fetch and format price history (keep every change with full timestamp for History tab)
  const fetchPriceHistory = React.useCallback(async () => {
    setPriceHistoryLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/products/${stock.id}/price-history`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const raw = await response.json();
      const data = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? raw.data ??
            raw.history ??
            raw.items ??
            raw.results ??
            raw.records ??
            raw.priceHistory ??
            raw.content ??
            []
          : [];
      const rows = Array.isArray(data) ? data : [];

      let formatted = rows
        .map(d => {
          const price = parseFloat(d.price) || 0;
          const changedAtStr = d.changedAt || d.changed_at || d.date || d.createdAt || d.created_at || d.timestamp || '';
          let parsedChangedAt = parseDateValue(changedAtStr);
          if (!parsedChangedAt && changedAtStr && typeof changedAtStr === 'string') {
            const head = changedAtStr.split('T')[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
              parsedChangedAt = parseDateValue(`${head}T12:00:00`);
            }
          }
          if (!parsedChangedAt) return null;
          const dateOnly = toLocalDateKey(parsedChangedAt);
          return {
            ...d,
            price,
            date: dateOnly,
            changedAt: parsedChangedAt.toISOString(),
            isFilled: false,
          };
        })
        .filter(Boolean);

      formatted.sort((a, b) => {
        const aMs = parseDateValue(a.changedAt)?.getTime() ?? 0;
        const bMs = parseDateValue(b.changedAt)?.getTime() ?? 0;
        return aMs - bMs;
      });

      if (stock.price != null && stock.price !== '') {
        const currentPrice = parseFloat(stock.price);
        const nowIso = new Date().toISOString();
        const today = toLocalDateKey(new Date());
        const lastEntry = formatted[formatted.length - 1];
        const lastPrice = lastEntry ? parseFloat(lastEntry.price) : null;
        if (lastPrice !== currentPrice || (lastEntry && lastEntry.date !== today)) {
          formatted.push({
            id: `current-${Date.now()}`,
            price: currentPrice,
            date: today,
            changedAt: nowIso,
            isCurrentPrice: true,
            isFilled: false,
          });
          formatted.sort((a, b) => {
            const aMs = parseDateValue(a.changedAt)?.getTime() ?? 0;
            const bMs = parseDateValue(b.changedAt)?.getTime() ?? 0;
            return aMs - bMs;
          });
        }
      }

      setPriceHistory(formatted);
      try {
        await AsyncStorage.setItem(
          `${PRICE_HISTORY_CACHE_PREFIX}${stock.id}`,
          JSON.stringify(formatted)
        );
      } catch {
        // ignore cache write errors
      }
    } catch (error) {
      console.error('Error fetching price history in StockDetail:', error);
      try {
        const cachedJson = await AsyncStorage.getItem(`${PRICE_HISTORY_CACHE_PREFIX}${stock.id}`);
        if (cachedJson) {
          const cached = JSON.parse(cachedJson);
          if (Array.isArray(cached) && cached.length > 0) {
            setPriceHistory(cached);
          } else {
            setPriceHistory([]);
          }
        } else {
          setPriceHistory([]);
        }
      } catch {
        setPriceHistory([]);
      }
    } finally {
      setPriceHistoryLoading(false);
    }
  }, [stock.id, stock.price, toLocalDateKey, parseDateValue]);

  // Fetch price history on mount and when stock changes
  React.useEffect(() => {
    fetchPriceHistory();
  }, [fetchPriceHistory]);

  // Refresh price history when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchPriceHistory();
    }, [fetchPriceHistory])
  );

  // --- Enhanced Interactive Chart State and Logic ---
  const chartHeight = isLandscape ? Math.max(220, Math.floor(windowHeight * 0.52)) : 200;
  const chartWidth = isLandscape ? Math.max(260, windowWidth - 12) : windowWidth - 40;
  const [pointerIndex, setPointerIndex] = React.useState(null);
  const animatedX = React.useRef(new Animated.Value(0)).current;
  const animatedY = React.useRef(new Animated.Value(0)).current;
  const [isTouching, setIsTouching] = React.useState(false);
  const [timeRange, setTimeRange] = React.useState('30'); // Default to 1M (30 days)
  const [chartAnimation] = React.useState(new Animated.Value(0));
  const [gradientAnimation] = React.useState(new Animated.Value(0));

  // Animate chart on mount and time range change (reduced duration for faster rendering)
  React.useEffect(() => {
    // Reset animations
    chartAnimation.setValue(0);
    gradientAnimation.setValue(0);
    
    Animated.parallel([
      Animated.timing(chartAnimation, {
        toValue: 1,
        duration: 600, // Reduced from 1200ms for faster rendering
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(gradientAnimation, {
        toValue: 1,
        duration: 400, // Reduced from 800ms for faster rendering
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      })
    ]).start();
  }, [timeRange, priceHistory.length]); // Also trigger when price history changes

  const days = parseInt(timeRange) || 30;
  const chartCutoff = React.useMemo(() => {
    // Calendar-based ranges:
    // 1D  -> today only
    // 7D  -> today and previous 6 days
    // 30D -> today and previous 29 days, etc.
    const c = new Date();
    c.setHours(0, 0, 0, 0);
    const offset = Math.max(days - 1, 0);
    c.setDate(c.getDate() - offset);
    return c;
  }, [days]);

  // Chart: build a continuous series across the selected date range.
  // - Includes ALL price changes (multiple per day)
  // - Also fills days with no changes using the last known price (so previous-day prices show on the graph)
  const chartHistoryAllChanges = React.useMemo(() => {
    if (!priceHistory.length) return [];

    const sortedAll = [...priceHistory].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

    // Seed price at range start from the last known entry BEFORE cutoff (or first entry within range)
    const cutoffMs = chartCutoff.getTime();
    let seedEntry = null;
    for (let i = sortedAll.length - 1; i >= 0; i--) {
      const t = new Date(sortedAll[i].changedAt).getTime();
      if (!isNaN(t) && t < cutoffMs) {
        seedEntry = sortedAll[i];
        break;
      }
    }

    const inRange = sortedAll.filter(e => new Date(e.changedAt) >= chartCutoff);
    if (!inRange.length && !seedEntry) return [];

    let lastPrice =
      seedEntry?.price ??
      inRange[0]?.price ??
      (stock.price != null && stock.price !== '' ? parseFloat(stock.price) : 0);

    if (lastPrice == null || isNaN(lastPrice)) lastPrice = 0;

    const start = new Date(chartCutoff);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // Group in-range entries by local day key
    const byDay = new Map();
    for (const entry of inRange) {
      const dayKey = entry.date || toLocalDateKey(new Date(entry.changedAt));
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(entry);
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
    }

    const series = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      const dayKey = toLocalDateKey(cursor);

      // Add a point at start of day with last known price (fills missing days)
      series.push({
        id: `range-${dayKey}`,
        price: lastPrice,
        date: dayKey,
        changedAt: new Date(cursor).toISOString(),
        isFilled: true,
      });

      // Add all actual changes for that day
      const changes = byDay.get(dayKey) || [];
      for (const ch of changes) {
        const p = parseFloat(ch.price);
        if (!isNaN(p)) lastPrice = p;
        series.push({ ...ch, isFilled: false });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // Ensure chronological order
    series.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
    return series;
  }, [priceHistory, chartCutoff, stock.price, toLocalDateKey]);

  // Legacy one-per-day filled series (kept for any future use; chart uses chartHistoryAllChanges)
  const filledHistoryForChart = React.useMemo(() => {
    if (!priceHistory.length) return [];
    const byDay = new Map();
    priceHistory.forEach(entry => {
      const key = entry.date;
      const existing = byDay.get(key);
      if (!existing || new Date(entry.changedAt) >= new Date(existing.changedAt)) {
        byDay.set(key, { ...entry });
      }
    });
    const onePerDay = Array.from(byDay.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    return fillMissingDates(onePerDay, 90);
  }, [priceHistory, fillMissingDates]);

  // For Chart tab: all changes in range (not one-per-day)
  const filteredHistory = React.useMemo(() => chartHistoryAllChanges, [chartHistoryAllChanges]);

  // Chart view uses full selected time range (no additional zoom controls).
  const zoomedHistory = React.useMemo(() => filteredHistory, [filteredHistory]);

  // For History tab:
  // - Show FULL history from product creation date (or earliest known entry)
  // - Keep every actual update entry (including multiple changes in the same day)
  // - Add one carry-forward row only for days with no updates
  const historyTableEntries = React.useMemo(() => {
    // Product creation only — do NOT use registrationDate (that is often the user's signup, not product created).
    // API often sends snake_case (created_at); list screen passes product objects through unchanged.
    const productCreatedRaw =
      stock?.createdAt ||
      stock?.created_at ||
      stock?.createdDate ||
      stock?.created_date ||
      stock?.creationDate ||
      stock?.productCreatedAt ||
      stock?.dateCreated ||
      null;

    const sortedAll = priceHistory.length
      ? [...priceHistory].sort((a, b) => {
          const aMs = parseDateValue(a.changedAt)?.getTime() ?? 0;
          const bMs = parseDateValue(b.changedAt)?.getTime() ?? 0;
          return aMs - bMs;
        })
      : [];

    // Earliest timestamp across all rows (not only sortedAll[0]) so range always starts at first real change
    let earliestHistoryMs = null;
    let earliestHistoryRow = null;
    for (const row of sortedAll) {
      const t = parseDateValue(row.changedAt)?.getTime();
      if (t == null || Number.isNaN(t)) continue;
      if (earliestHistoryMs == null || t < earliestHistoryMs) {
        earliestHistoryMs = t;
        earliestHistoryRow = row;
      }
    }
    if (sortedAll.length && (earliestHistoryMs == null || earliestHistoryRow == null)) return [];

    const pcMs = productCreatedRaw ? (parseDateValue(productCreatedRaw)?.getTime() ?? NaN) : NaN;
    const hasValidCreated = !isNaN(pcMs);

    let startMs;
    if (earliestHistoryMs != null && hasValidCreated) {
      startMs = Math.min(earliestHistoryMs, pcMs);
    } else if (earliestHistoryMs != null) {
      startMs = earliestHistoryMs;
    } else if (hasValidCreated) {
      startMs = pcMs;
    } else {
      return [];
    }

    let lastPrice =
      earliestHistoryRow?.price != null
        ? parseFloat(earliestHistoryRow.price)
        : stock.price != null && stock.price !== ''
          ? parseFloat(stock.price)
          : 0;
    if (lastPrice == null || isNaN(lastPrice)) lastPrice = 0;

    const start = new Date(startMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const byDay = new Map();
    for (const entry of sortedAll) {
      const changedDt = parseDateValue(entry.changedAt);
      const dayKey = entry.date || toLocalDateKey(changedDt || new Date());
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(entry);
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => {
        const aMs = parseDateValue(a.changedAt)?.getTime() ?? 0;
        const bMs = parseDateValue(b.changedAt)?.getTime() ?? 0;
        return aMs - bMs;
      });
    }

    const historyRows = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      const dayKey = toLocalDateKey(cursor);
      const changes = byDay.get(dayKey) || [];

      if (changes.length > 0) {
        // Keep every real update for this day
        for (const ch of changes) {
          const p = parseFloat(ch.price);
          if (!isNaN(p)) lastPrice = p;
          historyRows.push({ ...ch, isFilled: false });
        }
      } else {
        // No updates this day: one carry-forward row
        const eod = new Date(cursor);
        eod.setHours(23, 59, 59, 999);
        historyRows.push({
          id: `history-filled-${dayKey}`,
          price: lastPrice,
          date: dayKey,
          changedAt: eod.toISOString(),
          isFilled: true,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // UI shows newest first
    return historyRows.sort((a, b) => {
      const aMs = parseDateValue(a.changedAt)?.getTime() ?? 0;
      const bMs = parseDateValue(b.changedAt)?.getTime() ?? 0;
      return bMs - aMs;
    });
  }, [
    priceHistory,
    stock.price,
    stock?.createdAt,
    stock?.created_at,
    stock?.createdDate,
    stock?.created_date,
    stock?.creationDate,
    stock?.productCreatedAt,
    stock?.dateCreated,
    toLocalDateKey,
    parseDateValue,
  ]);

  // Optimized chart data extraction
  const chartData = React.useMemo(() => {
    return zoomedHistory.map(entry => entry.price);
  }, [zoomedHistory]);

  // Chart color: green if latest price >= previous, red if latest < previous (like MiniChart)
  let trendColor = '#00C853';
  if (chartData.length > 1) {
    trendColor = chartData[chartData.length - 1] < chartData[chartData.length - 2] ? '#FF3B30' : '#00C853';
  }
  const chartColors = isTouching
    ? { line: '#4a90e2', gradient: 'chartGradientInteractive' }
    : { line: trendColor, gradient: trendColor === '#FF3B30' ? 'chartGradientRed' : 'chartGradientMiniMain' };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt, gestureState) => {
      handleTouch(evt.nativeEvent.locationX);
      setIsTouching(true);
    },
    onPanResponderMove: (evt, gestureState) => {
      handleTouch(evt.nativeEvent.locationX);
      setIsTouching(true);
    },
    onPanResponderRelease: () => {
      setPointerIndex(null);
      setIsTouching(false);
    },
    onPanResponderTerminate: () => {
      setPointerIndex(null);
      setIsTouching(false);
    },
  });

  const handleTouch = (x) => {
    if (!chartData.length) return;
    const step = chartWidth / (chartData.length - 1);
    let idx = Math.round(x / step);
    idx = Math.max(0, Math.min(chartData.length - 1, idx));
    setPointerIndex(idx);

    Animated.parallel([
      Animated.timing(animatedX, {
        toValue: idx,
        duration: 200,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(animatedY, {
        toValue: chartData[idx],
        duration: 200,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      })
    ]).start();
  };

  const AnimatedLine = Animated.createAnimatedComponent(SvgLine);
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);
  const AnimatedText = Animated.createAnimatedComponent(SvgText);

  const PointerDecorator = ({ x, y, data }) => {
    if (pointerIndex === null || !data.length) return null;

    const pointerX = animatedX.interpolate({
      inputRange: [0, data.length - 1],
      outputRange: [x(0), x(data.length - 1)],
      extrapolate: 'clamp',
    });

    const minY = Math.min(...data);
    const maxY = Math.max(...data);
    const pointerY = animatedY.interpolate({
      inputRange: [minY, maxY],
      outputRange: [y(minY), y(maxY)],
      extrapolate: 'clamp',
    });

    // Enhanced tooltip with better positioning
    const price = data[pointerIndex];
    const priceString = `₹${price?.toFixed(2)}`;
    const dateString = zoomedHistory[pointerIndex]?.date
      ? formatDateShort(zoomedHistory[pointerIndex].date)
      : '';

    const priceBoxWidth = 80;
    const priceBoxHeight = 40;
    const priceBoxRadius = 12;
    const priceBoxOffsetX = 16;
    const priceBoxOffsetY = -priceBoxHeight / 2;

    let tooltipX = pointerX.__getValue() + priceBoxOffsetX;
    if (tooltipX + priceBoxWidth > chartWidth) tooltipX = chartWidth - priceBoxWidth - 8;
    if (tooltipX < 0) tooltipX = 8;

    let tooltipY = pointerY.__getValue() + priceBoxOffsetY;
    if (tooltipY < 0) tooltipY = 8;
    if (tooltipY + priceBoxHeight > chartHeight) tooltipY = chartHeight - priceBoxHeight - 8;

    return (
      <G>
        {/* Animated vertical line */}
        <AnimatedLine
          x1={pointerX}
          x2={pointerX}
          y1={0}
          y2={chartHeight}
          stroke={chartColors.line}
          strokeWidth={1.5}
          strokeDasharray="4,4"
          opacity={0.6}
        />

        {/* Outer glow circle */}
        <AnimatedCircle
          cx={pointerX}
          cy={pointerY}
          r={18}
          fill={chartColors.line}
          opacity={0.15}
        />

        {/* Middle circle */}
        <AnimatedCircle
          cx={pointerX}
          cy={pointerY}
          r={10}
          fill={chartColors.line}
          opacity={0.3}
        />

        {/* Inner circle with white border */}
        <AnimatedCircle
          cx={pointerX}
          cy={pointerY}
          r={6}
          fill={chartColors.line}
          stroke="#fff"
          strokeWidth={2}
        />

        {/* Enhanced tooltip with shadow effect */}
        <Rect
          x={tooltipX - 1}
          y={tooltipY - 1}
          rx={priceBoxRadius}
          ry={priceBoxRadius}
          width={priceBoxWidth + 2}
          height={priceBoxHeight + 2}
          fill="#000"
          opacity={0.3}
        />

        <Rect
          x={tooltipX}
          y={tooltipY}
          rx={priceBoxRadius}
          ry={priceBoxRadius}
          width={priceBoxWidth}
          height={priceBoxHeight}
          fill={chartColors.line}
          opacity={0.95}
          stroke="#fff"
          strokeWidth={0.5}
        />

        {/* Tooltip Price */}
        <SvgText
          x={tooltipX + priceBoxWidth / 2}
          y={tooltipY + 18}
          fontSize="16"
          fill="#fff"
          fontWeight="bold"
          alignmentBaseline="middle"
          textAnchor="middle"
        >
          {priceString}
        </SvgText>

        {/* Tooltip Date */}
        <SvgText
          x={tooltipX + priceBoxWidth / 2}
          y={tooltipY + 32}
          fontSize="12"
          fill="#e8f5e8"
          fontWeight="500"
          alignmentBaseline="middle"
          textAnchor="middle"
        >
          {dateString}
        </SvgText>
      </G>
    );
  };

  const ChartGradient = () => (
    <G>
      <Defs>
        {/* Mini/Main green gradient */}
        <LinearGradient id="chartGradientMiniMain" x1="0" y1="0" x2="0" y2="1">
          <SvgStop offset="0%" stopColor="#00C853" stopOpacity={0.4} />
          <SvgStop offset="50%" stopColor="#00C853" stopOpacity={0.15} />
          <SvgStop offset="100%" stopColor="#111" stopOpacity={0.02} />
        </LinearGradient>
        {/* Red downtrend gradient */}
        <LinearGradient id="chartGradientRed" x1="0" y1="0" x2="0" y2="1">
          <SvgStop offset="0%" stopColor="#FF3B30" stopOpacity={0.4} />
          <SvgStop offset="50%" stopColor="#FF3B30" stopOpacity={0.15} />
          <SvgStop offset="100%" stopColor="#111" stopOpacity={0.02} />
        </LinearGradient>
        {/* Interactive blue gradient */}
        <LinearGradient id="chartGradientInteractive" x1="0" y1="0" x2="0" y2="1">
          <SvgStop offset="0%" stopColor="#4a90e2" stopOpacity={0.5} />
          <SvgStop offset="50%" stopColor="#4a90e2" stopOpacity={0.2} />
          <SvgStop offset="100%" stopColor="#111" stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
    </G>
  );

  function formatDateShort(dateString) {
    if (!dateString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateString).trim())) {
      const [y, m, d0] = String(dateString).trim().split('-').map(Number);
      const d = new Date(y, m - 1, d0);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    }
    const d = new Date(dateString);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }

  function formatDateFull(dateString) {
    if (!dateString) return '';
    // Calendar dates YYYY-MM-DD — parse as local midnight so History dates match the column, not UTC shift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateString).trim())) {
      const [y, m, d0] = String(dateString).trim().split('-').map(Number);
      const d = new Date(y, m - 1, d0);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const d = new Date(dateString);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const openImageModal = (index) => {
    setSelectedImageIndex(index);
    setImageModalVisible(true);
    // Reset zoom and pan when opening
    baseScale.setValue(1);
    pinchScale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    translateX.setOffset(0);
    translateY.setOffset(0);
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    // Reset zoom and pan when closing
    Animated.parallel([
      Animated.spring(baseScale, { toValue: 1, useNativeDriver: false }),
      Animated.spring(pinchScale, { toValue: 1, useNativeDriver: false }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: false }),
    ]).start(() => {
      baseScale.setValue(1);
      pinchScale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
      translateX.setOffset(0);
      translateY.setOffset(0);
    });
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
  };

  // Pinch gesture handler for zoom
  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: false }
  );

  const onPinchHandlerStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      
      // Constrain scale between 1 and 4
      if (lastScale.current < 1) {
        lastScale.current = 1;
      } else if (lastScale.current > 4) {
        lastScale.current = 4;
      }
      
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  // Pan gesture handler for dragging when zoomed
  const onPanGestureEvent = Animated.event(
    [
      {
        nativeEvent: {
          translationX: translateX,
          translationY: translateY,
        },
      },
    ],
    { useNativeDriver: false }
  );

  const onPanHandlerStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastTranslate.current = {
        x: lastTranslate.current.x + event.nativeEvent.translationX,
        y: lastTranslate.current.y + event.nativeEvent.translationY,
      };
      
      translateX.setOffset(lastTranslate.current.x);
      translateY.setOffset(lastTranslate.current.y);
      translateX.setValue(0);
      translateY.setValue(0);
      
      // Constrain pan to image bounds
      const currentScale = lastScale.current * (pinchScale._value || 1);
      const maxTranslate = (screenWidth * (currentScale - 1)) / 2;
      const constrainedX = Math.max(-maxTranslate, Math.min(maxTranslate, lastTranslate.current.x));
      const constrainedY = Math.max(-maxTranslate, Math.min(maxTranslate, lastTranslate.current.y));
      
      if (constrainedX !== lastTranslate.current.x || constrainedY !== lastTranslate.current.y) {
        lastTranslate.current = { x: constrainedX, y: constrainedY };
        Animated.parallel([
          Animated.spring(translateX, { 
            toValue: 0,
            useNativeDriver: false,
          }),
          Animated.spring(translateY, { 
            toValue: 0,
            useNativeDriver: false,
          }),
        ]).start(() => {
          translateX.setOffset(constrainedX);
          translateY.setOffset(constrainedY);
          translateX.setValue(0);
          translateY.setValue(0);
        });
      }
    }
  };

  const renderProductImage = ({ item, index }) => {
    const handleImageError = (error) => {
      if (__DEV__) {
        console.error('🔴 StockDetailScreen: Image failed to load:', item.uri, error);
      }
      // Mark this image as failed so it won't be displayed
      setFailedImageIds(prev => new Set([...prev, item.id]));
    };

    return (
      <TouchableOpacity 
        style={styles.imageTile}
        onPress={() => openImageModal(index)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.productImage}
          resizeMode="cover"
          onError={handleImageError}
          key={`image-${item.id}-${stock.id}`} // Force re-render when product changes
        />
      </TouchableOpacity>
    );
  };

    return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.text === '#fff' ? "light" : "dark"} />
      <ScrollView 
        contentContainerStyle={[
          styles.detailScroll,
          {
            backgroundColor: colors.surface,
            paddingBottom: bottomPadding + 24,
            paddingHorizontal: isLandscape ? 6 : 16,
            paddingTop: isLandscape ? 16 : 40,
          },
        ]}
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        <View style={styles.detailHeaderRow}>
          <View>
            <Text style={[styles.detailSymbol, { color: colors.text }]}>{productName}</Text>
            {productDescription ? (
              <Text style={[styles.detailCompany, { color: colors.textSecondary }]}>
                {productDescription}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Product Images Gallery - fetched from /products/{productId}/images */}
        {productImages.length > 0 && (
          <View style={styles.imageGalleryContainer}>
            <Text style={[styles.galleryTitle, { color: colors.text }]}>{productName} Images</Text>
            <FlatList
              data={productImages}
              renderItem={({ item, index }) => renderProductImage({ item, index })}
              keyExtractor={(item) => `image-${item.id}-${stock.id}`}
              extraData={productImages.length}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imageGallery}
              snapToInterval={110}
              decelerationRate="fast"
              bounces={false}
              ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
            />
          </View>
        )}

        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'chart' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('chart')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons 
              name="chart-line" 
              size={20} 
              color={activeTab === 'chart' ? '#fff' : colors.textSecondary} 
            />
            <Text style={[styles.tabText, { color: activeTab === 'chart' ? '#fff' : colors.textSecondary }]}>Chart</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'history' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons 
              name="clock-outline" 
              size={20} 
              color={activeTab === 'history' ? '#fff' : colors.textSecondary} 
            />
            <Text style={[styles.tabText, { color: activeTab === 'history' ? '#fff' : colors.textSecondary }]}>History</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'analytics' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('analytics')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons 
              name="chart-bar" 
              size={20} 
              color={activeTab === 'analytics' ? '#fff' : colors.textSecondary} 
            />
            <Text style={[styles.tabText, { color: activeTab === 'analytics' ? '#fff' : colors.textSecondary }]}>Analytics</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'chart' && (
          <>
            <View style={styles.detailPriceRow}>
              <Text style={[styles.detailPrice, { color: colors.text }]}>
                {stock.price !== null && stock.price !== undefined 
                  ? `₹${parseFloat(stock.price).toFixed(2)}` 
                  : 'N/A'}
              </Text>
              {stock.change !== undefined && (
                <Text style={[styles.detailChange, { color: stock.change > 0 ? colors.success : colors.error }]}> {stock.change > 0 ? `+${stock.change}` : stock.change} </Text>
              )}
            </View>
            <View style={styles.detailTabsRow}>
              {['1D', '1W', '1M', '6M', '1Y', '2Y'].map((tab) => {
                const getDaysFromTab = (tab) => {
                  switch (tab) {
                    case '1D': return 1;
                    case '1W': return 7;
                    case '1M': return 30;
                    case '6M': return 180;
                    case '1Y': return 365;
                    case '2Y': return 730;
                    default: return 30;
                  }
                };
                const days = getDaysFromTab(tab);
                const isSelected = timeRange === days.toString();

                return (
                  <TouchableOpacity
                    key={tab}
                    style={{
                      backgroundColor: isSelected ? chartColors.line : colors.card,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      marginHorizontal: 2,
                      shadowColor: isSelected ? chartColors.line : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isSelected ? 0.3 : 0,
                      shadowRadius: 4,
                      elevation: isSelected ? 4 : 0,
                    }}
                    onPress={() => setTimeRange(days.toString())}
                  >
                    <Text style={{
                      color: colors.text,
                      fontWeight: 'bold',
                      fontSize: 15,
                    }}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Chart Tab Content */}
        {activeTab === 'chart' && (
          <>
            {priceHistoryLoading ? (
              <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: chartHeight }}>
                <MaterialCommunityIcons name="chart-line" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}>
                  Loading price history...
                </Text>
              </View>
            ) : chartData.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: chartHeight }}>
                <MaterialCommunityIcons name="chart-line" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}>
                  No price history available yet
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                  Price data will appear here once the product price is updated
                </Text>
              </View>
            ) : chartData.length === 1 ? (
              <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: chartHeight }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
                    ₹{chartData[0].toFixed(2)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    Initial Price
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {zoomedHistory[0]?.date ? formatDateShort(zoomedHistory[0].date) : 'Today'}
                  </Text>
                </View>
              </View>
            ) : (
              /* Enhanced Interactive Chart */
              <Animated.View
                {...panResponder.panHandlers}
                style={{
                  width: chartWidth,
                  height: chartHeight,
                  alignSelf: 'center',
                  opacity: chartAnimation,
                  transform: [{
                    scale: chartAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    })
                  }]
                }}
              >
                <SVGLineChart
                  style={{ height: chartHeight, width: chartWidth, position: 'absolute' }}
                  data={chartData}
                  svg={{
                    stroke: chartColors.line,
                    strokeWidth: 3,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round'
                  }}
                  contentInset={{ top: 20, bottom: 20 }}
                  curve={shape.curveMonotoneX}
                >
                  <ChartGradient />
                  {/* Dashed line at the bottom of the graph */}
                  <SvgLine
                    x1={0}
                    x2={chartWidth}
                    y1={chartHeight - 1}
                    y2={chartHeight - 1}
                    stroke={chartColors.line}
                    strokeWidth={2}
                    strokeDasharray="6,4"
                  />
                  <Grid svg={{ stroke: '#333', strokeOpacity: 0.3 }} />
                  <PointerDecorator data={chartData} />
                </SVGLineChart>

                <AreaChart
                  style={{ height: chartHeight, width: chartWidth }}
                  data={chartData}
                  svg={{ fill: `url(#${chartColors.gradient})` }}
                  contentInset={{ top: 20, bottom: 20 }}
                  curve={shape.curveMonotoneX}
                >
                  <ChartGradient />
              </AreaChart>
            </Animated.View>
            )}

            {/* Enhanced X-Axis Labels */}
            {chartData.length > 1 && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
                width: chartWidth,
                alignSelf: 'center',
                paddingHorizontal: 10
              }}>
                <Text style={{ color: '#888', fontSize: 12, fontWeight: '500' }}>
                  {formatDateShort(chartCutoff)}
                </Text>
                <Text style={{ color: '#888', fontSize: 12, fontWeight: '500' }}>
                  {formatDateShort(zoomedHistory[zoomedHistory.length - 1]?.date || new Date())}
                </Text>
              </View>
            )}
          </>
        )}

                {/* History Tab Content */}
        {activeTab === 'history' && (
          <View style={[styles.historyContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Price History</Text>
            
            {priceHistoryLoading ? (
              <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="clock-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16, textAlign: 'center' }}>
                  Loading price history...
                </Text>
              </View>
            ) : historyTableEntries.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="clock-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16, textAlign: 'center' }}>
                  No price history available
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12, textAlign: 'center' }}>
                  Price history will appear here once the product price is updated
                </Text>
              </View>
            ) : (
              <>
                {/* Header Row */}
                <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.headerText, { color: colors.textSecondary }]}>Date</Text>
                  <Text style={[styles.headerText, { color: colors.textSecondary }]}>Price</Text>
                  <Text style={[styles.headerText, { color: colors.textSecondary }]}>Change</Text>
                </View>
                
                <View style={styles.historyList}>
                  {historyTableEntries.map((entry, index) => {
                    // Previous entry = next in list (we're newest-first, so previous chronologically is index+1)
                    const prevEntry = historyTableEntries[index + 1] || null;
                    const currentPrice = parseFloat(entry.price) || 0;
                    const previousPrice = prevEntry ? (parseFloat(prevEntry.price) || 0) : 0;
                    const change = prevEntry ? currentPrice - previousPrice : 0;
                    const isIncrease = change > 0;
                    return (
                      <View key={entry.id || `history-${index}-${entry.changedAt}`} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.historyDate, { color: colors.textSecondary }]} numberOfLines={1}>
                          {formatDateFull(entry.date)}
                        </Text>
                        <Text style={[styles.historyPrice, { color: colors.text }]}>₹{Number(entry.price).toFixed(2)}</Text>
                        {change !== 0 ? (
                          <View style={styles.historyChangeContainer}>
                            <Text style={[
                              styles.historyChangeText,
                              { color: isIncrease ? colors.success : colors.error }
                            ]}>
                              {isIncrease ? '+' : ''}₹{Math.abs(change).toFixed(2)}
                            </Text>
                            <MaterialCommunityIcons
                              name={isIncrease ? 'trending-up' : 'trending-down'}
                              size={16}
                              color={isIncrease ? colors.success : colors.error}
                              style={styles.changeIcon}
                            />
                          </View>
                        ) : (
                          <View style={styles.historyChangeContainer}>
                            <Text style={[styles.historyChangeText, { color: colors.textSecondary }]}>—</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* Analytics Tab Content */}
        {activeTab === 'analytics' && (
          <View style={[styles.analyticsContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.analyticsTitle, { color: colors.text }]}>Analytics</Text>
            <View style={styles.analyticsGrid}>
              <View style={[styles.analyticsCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>Highest Price</Text>
                <Text style={[styles.analyticsValue, { color: colors.text }]}>₹{Math.max(...chartData).toFixed(0)}</Text>
              </View>
              <View style={[styles.analyticsCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>Lowest Price</Text>
                <Text style={[styles.analyticsValue, { color: colors.text }]}>₹{Math.min(...chartData).toFixed(0)}</Text>
              </View>
              <View style={[styles.analyticsCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>Average Price</Text>
                <Text style={[styles.analyticsValue, { color: colors.text }]}>₹{(chartData.reduce((a, b) => a + b, 0) / chartData.length).toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}


      </ScrollView>

      {/* Image Zoom Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={[styles.modalContainer, { backgroundColor: 'rgba(0, 0, 0, 0.95)' }]}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={closeImageModal}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Image Counter */}
          {productImages.length > 1 && (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>
                {selectedImageIndex + 1} / {productImages.length}
              </Text>
            </View>
          )}

          {/* Zoomable Image */}
          <GestureHandlerRootView style={styles.zoomableImageContainer}>
            <PinchGestureHandler
              ref={pinchRef}
              onGestureEvent={onPinchGestureEvent}
              onHandlerStateChange={onPinchHandlerStateChange}
              simultaneousHandlers={panRef}
            >
              <PanGestureHandler
                ref={panRef}
                onGestureEvent={onPanGestureEvent}
                onHandlerStateChange={onPanHandlerStateChange}
                simultaneousHandlers={pinchRef}
                minPointers={1}
                maxPointers={1}
                avgTouches
              >
                <Animated.View style={styles.zoomableImageContainer}>
                  <Animated.Image
                    source={{ uri: productImages[selectedImageIndex]?.uri }}
                    style={[
                      styles.zoomableImage,
                      {
                        transform: [
                          { scale: Animated.multiply(baseScale, pinchScale) },
                          { translateX: translateX },
                          { translateY: translateY },
                        ],
                      },
                    ]}
                    resizeMode="contain"
                    onError={(error) => {
                      if (__DEV__) {
                        console.error('🔴 StockDetailScreen: Modal image failed to load:', productImages[selectedImageIndex]?.uri, error);
                      }
                      const failedId = productImages[selectedImageIndex]?.id;
                      if (failedId) {
                        setFailedImageIds(prev => new Set([...prev, failedId]));
                      }
                    }}
                    key={`modal-image-${productImages[selectedImageIndex]?.id}-${stock.id}`}
                  />
                </Animated.View>
              </PanGestureHandler>
            </PinchGestureHandler>
          </GestureHandlerRootView>

          {/* Navigation Buttons */}
          {productImages.length > 1 && (
            <>
              {selectedImageIndex > 0 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.prevButton]}
                  onPress={() => {
                    const newIndex = selectedImageIndex - 1;
                    setSelectedImageIndex(newIndex);
                    // Reset zoom when changing image
                    baseScale.setValue(1);
                    pinchScale.setValue(1);
                    translateX.setValue(0);
                    translateY.setValue(0);
                    translateX.setOffset(0);
                    translateY.setOffset(0);
                    lastScale.current = 1;
                    lastTranslate.current = { x: 0, y: 0 };
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="chevron-left" size={32} color="#fff" />
                </TouchableOpacity>
              )}
              {selectedImageIndex < productImages.length - 1 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.nextButton]}
                  onPress={() => {
                    const newIndex = selectedImageIndex + 1;
                    setSelectedImageIndex(newIndex);
                    // Reset zoom when changing image
                    baseScale.setValue(1);
                    pinchScale.setValue(1);
                    translateX.setValue(0);
                    translateY.setValue(0);
                    translateX.setOffset(0);
                    translateY.setOffset(0);
                    lastScale.current = 1;
                    lastTranslate.current = { x: 0, y: 0 };
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="chevron-right" size={32} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Zoom Instructions */}
          <View style={styles.zoomHint}>
            <MaterialCommunityIcons name="gesture-pinch" size={20} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.zoomHintText}>Pinch to zoom, drag to pan</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  detailScroll: {
    padding: 16,
    paddingTop: 40,
    minHeight: '100%',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: -8,
  },
  detailSymbol: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  detailCompany: {
    fontSize: 16,
    marginTop: 2,
    marginBottom: 4,
  },

  detailPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    marginRight: 8,
  },
  detailChange: {
    fontWeight: 'bold',
    fontSize: 18,
    marginRight: 8,
  },
  detailTabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 15,
    paddingHorizontal: 4,
  },
  footer: {
    padding: 18,
    alignItems: 'flex-start',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: 8,
  },
  footerTitle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  footerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  imageGalleryContainer: {
    marginTop: 15,
    marginBottom: 15,
  },
  galleryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  imageGallery: {
    paddingHorizontal: 4,
  },
  imageTile: {
    width: 100,
    height: 100,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
  imageCounter: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  zoomableImageContainer: {
    width: screenWidth,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomableImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
    maxWidth: screenWidth,
    maxHeight: screenHeight,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    padding: 12,
    zIndex: 10,
  },
  prevButton: {
    left: 20,
  },
  nextButton: {
    right: 20,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 8,
  },
  zoomHintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    marginVertical: 15,
    padding: 4,
    marginHorizontal: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  activeTabButton: {
    backgroundColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  historyContainer: {
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  historyList: {
    paddingBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  historyDate: {
    fontSize: 14,
    flex: 1,
    textAlign: 'center',
  },
  historyPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  historyChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  historyChangeText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 4,
  },
  changeIcon: {
    marginLeft: 2,
  },
  analyticsContainer: {
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  analyticsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  analyticsCard: {
    width: '48%',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  analyticsLabel: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
}); 