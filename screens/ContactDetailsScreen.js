import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../utils/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function ContactDetailsScreen({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);

  // Saini Mewa Stores contact details
  const STORE_EMAIL = 'sainimewastore@gmail.com';
  const STORE_PHONE = '+919000022066';

  const handleEmailPress = () => {
    Linking.openURL(`mailto:${STORE_EMAIL}`);
  };

  const handlePhonePress = () => {
    Linking.openURL(`tel:${STORE_PHONE}`);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Soft background gradient */}
      {isDarkMode ? (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="contactGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#contactGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="contactGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#contactGradient)" />
        </Svg>
      )}

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 40 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {/* Logo/Header */}
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={[styles.storeName, { color: colors.text }]}>Saini Dry Fruits</Text>
            </View>

            {/* Card */}
            <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
              <View style={styles.messageContainer}>
                <MaterialCommunityIcons 
                  name="clock-alert-outline" 
                  size={48} 
                  color={colors.primary} 
                  style={{ marginBottom: 16 }} 
                />
                <Text style={[styles.messageTitle, { color: colors.text }]}>
                  Account Pending Approval
                </Text>
                <Text style={[styles.messageText, { color: colors.textSecondary }]}>
                  Your account is pending admin approval. Your trial period has ended. Please contact us for account activation.
                </Text>
              </View>

              {/* Contact Information */}
              <View style={styles.contactContainer}>
                <Text style={[styles.contactTitle, { color: colors.text }]}>Contact Us</Text>
                
                {/* Email */}
                <TouchableOpacity 
                  style={[styles.contactItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={handleEmailPress}
                  activeOpacity={0.8}
                >
                  <View style={styles.contactIconContainer}>
                    <MaterialCommunityIcons name="email-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Email</Text>
                    <Text style={[styles.contactValue, { color: colors.text }]}>{STORE_EMAIL}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Phone */}
                <TouchableOpacity 
                  style={[styles.contactItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={handlePhonePress}
                  activeOpacity={0.8}
                >
                  <View style={styles.contactIconContainer}>
                    <MaterialCommunityIcons name="phone-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Contact Number</Text>
                    <Text style={[styles.contactValue, { color: colors.text }]}>{STORE_PHONE}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Info Box */}
              <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Once your account is approved by the admin, you'll be able to access all features.
                </Text>
              </View>

              {/* Logout Button */}
              <TouchableOpacity 
                style={[styles.logoutButton, { backgroundColor: colors.error || '#dc3545' }]}
                onPress={() => navigation.replace('Auth')}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="logout" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    minHeight: Dimensions.get('window').height - 100,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    padding: 6,
  },
  storeName: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  card: {
    width: '96%',
    alignSelf: 'center',
    borderRadius: 18,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  messageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  contactContainer: {
    marginBottom: 24,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  contactIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    marginLeft: 12,
    lineHeight: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

