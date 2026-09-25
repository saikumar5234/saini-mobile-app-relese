import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { Entypo, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

export default function Header({ 
  selectedLanguage, 
  onLanguageChange, 
  onMenuPress, 
  onLogout,
  onProfilePress,
  onSearchPress,
  searchVisible,
  t 
}) {
  const { colors, isDarkMode, toggleTheme } = useTheme();

  const languages = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  ];

  const handleLanguageSelect = (languageCode) => {
    onLanguageChange(languageCode);
  };

  return (
    <>
      <View style={[styles.headerRow, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.appTitle, { color: colors.text }]}>Saini Dry Fruits</Text>
        </View>
        <View style={styles.headerRight}>
          {onSearchPress && (
            <TouchableOpacity 
              onPress={onSearchPress} 
              style={[styles.themeButton, searchVisible && styles.searchButtonActive]}
            >
              <MaterialCommunityIcons 
                name="magnify" 
                size={24} 
                color={searchVisible ? colors.primary : colors.text} 
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
            <MaterialCommunityIcons 
              name={isDarkMode ? "weather-sunny" : "weather-night"} 
              size={24} 
              color={colors.text} 
            />
          </TouchableOpacity>
          {onProfilePress && (
            <TouchableOpacity onPress={onProfilePress} style={styles.profileButton}>
              <MaterialCommunityIcons 
                name="account-circle" 
                size={24} 
                color={colors.text} 
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Language Chips */}
      <View style={styles.languageChipsContainer}>
        <View style={styles.languageChipsRow}>
          {languages.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageChip,
                { 
                  backgroundColor: selectedLanguage === lang.code ? colors.primary : colors.card,
                  borderColor: colors.border
                }
              ]}
              onPress={() => handleLanguageSelect(lang.code)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.chipText,
                { 
                  color: selectedLanguage === lang.code ? colors.white : colors.text,
                  fontWeight: selectedLanguage === lang.code ? '600' : '500'
                }
              ]}>
                {lang.nativeName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  themeButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  searchButtonActive: {
    opacity: 1,
  },
  profileButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 8,
  },
  languageChipsContainer: {
    paddingHorizontal: 20,
    marginBottom: 5,
    marginTop: 10,
  },
  languageChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  languageChip: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 12,
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
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
}); 