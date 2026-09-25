import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  Easing, 
  Platform, 
  TouchableOpacity, 
  TouchableNativeFeedback, 
  Dimensions,
  Modal,
  ScrollView,
  StatusBar
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// NativeTouchable wrapper for ripple/opacity feedback
function NativeTouchable({ children, style, ...props }) {
  if (Platform.OS === 'android') {
    return (
      <TouchableNativeFeedback
        {...props}
        background={TouchableNativeFeedback.Ripple('#FFD700', false)}
      >
        <View style={style}>{children}</View>
      </TouchableNativeFeedback>
    );
  }
  return (
    <TouchableOpacity {...props} style={style} activeOpacity={0.8}>
      {children}</TouchableOpacity>
  );
}

const translations = {
  en: {
    selectLanguage: 'Choose Your Language',
    selectLanguageSubtitle: 'Select your preferred language to continue',
    continue: 'Continue',
    appName: 'Mobile Dry Fruits',
    select: 'Select Language',
  },
  te: {
    selectLanguage: 'మీ భాషను ఎంచుకోండి',
    selectLanguageSubtitle: 'కొనసాగించడానికి మీ ఇష్టమైన భాషను ఎంచుకోండి',
    continue: 'కొనసాగించండి',
    appName: 'మొబైల్ డ్రై ఫ్రూట్స్',
    select: 'భాషను ఎంచుకోండి',
  },
  hi: {
    selectLanguage: 'अपनी भाषा चुनें',
    selectLanguageSubtitle: 'जारी रखने के लिए अपनी पसंदीदा भाषा चुनें',
    continue: 'जारी रखें',
    appName: 'मोबाइल ड्राई फ्रूट्स',
    select: 'भाषा चुनें',
  }
};

const languages = [
  { code: 'en', name: 'English', nativeName: 'English', icon: 'alphabet-latin' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', icon: 'alpha-t-box' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', icon: 'alpha-h-box' },
];

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function LanguageSelectionScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [successAnim] = useState(new Animated.Value(0));
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  const handleLanguageSelect = (language) => {
    setSelectedLanguage(language);
    setShowDropdown(false);
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const handleContinue = async () => {
    if (!selectedLanguage) return;
    setIsSuccess(true);
    Animated.timing(successAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    try {
      await AsyncStorage.setItem('selectedLanguage', selectedLanguage);
      setTimeout(() => {
        navigation.replace('StockList');
      }, 1200);
    } catch (error) {
      setIsSuccess(false);
    }
  };

  // Use English for the UI of this screen
  const t = translations['en'];

  const selectedLang = languages.find(lang => lang.code === selectedLanguage);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {/* Soft gradient background */}
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <SvgLinearGradient id="langGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#232526" stopOpacity="1" />
            <Stop offset="100%" stopColor="#191919" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#langGradient)" />
      </Svg>
      
      <Animated.View style={[
        styles.container, 
        { 
          opacity: fadeAnim, 
          transform: [
            { translateY: slideAnim }
          ],
          paddingBottom: bottomPadding + 24
        }
      ]}>  
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons 
            name="fruit-cherries" 
            size={60} 
            color="#FFD700" 
            style={{ 
              marginBottom: 8, 
              shadowColor: '#FFD700', 
              shadowOpacity: 0.3, 
              shadowRadius: 8 
            }} 
          />
          <Text style={styles.appName}>{t.appName}</Text>
        </View>
        
        <Text style={styles.title}>{t.selectLanguage}</Text>
        <Text style={styles.subtitle}>{t.selectLanguageSubtitle}</Text>
        
        {/* Language Dropdown */}
        <View style={styles.dropdownContainer}>
          <NativeTouchable
            style={styles.dropdownButton}
            onPress={toggleDropdown}
          >
            <View style={styles.dropdownContent}>
              {selectedLang ? (
                <>
                  <MaterialCommunityIcons 
                    name={selectedLang.icon} 
                    size={24} 
                    color="#FFD700" 
                  />
                  <View style={styles.selectedLanguageText}>
                    <Text style={styles.selectedLanguageNative}>
                      {selectedLang.nativeName}
                    </Text>
                    <Text style={styles.selectedLanguageName}>
                      {selectedLang.name}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons 
                    name="translate" 
                    size={24} 
                    color="#aaa" 
                  />
                  <Text style={styles.placeholderText}>{t.select}</Text>
                </>
              )}
            </View>
            <MaterialCommunityIcons 
              name={showDropdown ? "chevron-up" : "chevron-down"} 
              size={24} 
              color="#FFD700" 
            />
          </NativeTouchable>
          
          {/* Dropdown Options */}
          {showDropdown && (
            <View style={styles.dropdownOptions}>
              <ScrollView 
                style={styles.dropdownScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {languages.map((lang) => (
                  <NativeTouchable
                    key={lang.code}
                    style={[
                      styles.dropdownOption,
                      selectedLanguage === lang.code && styles.dropdownOptionSelected
                    ]}
                    onPress={() => handleLanguageSelect(lang.code)}
                  >
                    <MaterialCommunityIcons 
                      name={lang.icon} 
                      size={20} 
                      color={selectedLanguage === lang.code ? '#4CAF50' : '#FFD700'} 
                    />
                    <View style={styles.optionTextContainer}>
                      <Text style={[
                        styles.optionNativeText,
                        selectedLanguage === lang.code && styles.optionNativeTextSelected
                      ]}>
                        {lang.nativeName}
                      </Text>
                      <Text style={styles.optionNameText}>
                        {lang.name}
                      </Text>
                    </View>
                    {selectedLanguage === lang.code && (
                      <MaterialCommunityIcons 
                        name="check" 
                        size={20} 
                        color="#4CAF50" 
                      />
                    )}
                  </NativeTouchable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {selectedLanguage && !isSuccess && (
          <TouchableOpacity 
            style={styles.continueButton} 
            onPress={handleContinue} 
            activeOpacity={0.88}
          >
            <Text style={styles.continueText}>{t.continue}</Text>
            <MaterialCommunityIcons name="arrow-right" size={22} color="#000" />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Success Overlay */}
      {isSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successAnim }]}> 
          <MaterialCommunityIcons 
            name="check-circle" 
            size={80} 
            color="#4CAF50" 
            style={{ marginBottom: 18 }} 
          />
          <Text style={styles.successText}>Language Set!</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: 18,
    padding: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 18,
  },
  appName: {
    color: '#FFD700',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 32,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  dropdownContainer: {
    width: screenWidth * 0.85,
    position: 'relative',
    zIndex: 1000,
  },
  dropdownButton: {
    backgroundColor: '#232526',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,215,0,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 60,
  },
  dropdownContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedLanguageText: {
    marginLeft: 16,
    flex: 1,
  },
  selectedLanguageNative: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  selectedLanguageName: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  placeholderText: {
    color: '#aaa',
    fontSize: 16,
    marginLeft: 16,
    fontStyle: 'italic',
  },
  dropdownOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#232526',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 200,
    zIndex: 1001,
  },
  dropdownScroll: {
    borderRadius: 12,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  optionTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  optionNativeText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  optionNativeTextSelected: {
    color: '#4CAF50',
  },
  optionNameText: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 2,
  },
  continueButton: {
    backgroundColor: '#FFD700',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    marginTop: 32,
  },
  continueText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 12,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
}); 