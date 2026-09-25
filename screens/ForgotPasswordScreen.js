import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Alert, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { useTheme } from '../utils/ThemeContext';

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function ForgotPasswordScreen({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorAnim] = useState(new Animated.Value(0));

  // Animate error
  const showError = (msg) => {
    setError(msg);
    Animated.sequence([
      Animated.timing(errorAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(15000),
      Animated.timing(errorAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => setError(''));
  };

  const handleForgotPassword = async () => {
    if (!mobile.trim()) {
      showError('Please enter your registered mobile number');
      return;
    }

    // Validate mobile number - must be exactly 10 digits
    if (!/^[0-9]{10}$/.test(mobile)) {
      showError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check if user is registered in database by mobile number
      const normalizedMobile = mobile.trim();
      
      const response = await fetch(`${BACKEND_URL}/check-user-exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: normalizedMobile,
        }),
      });
      
      const data = await response.json();
      
      if (data.exists) {
        // User is registered, proceed with password reset
        const userData = {
          mobile: normalizedMobile,
          gstNumber: null,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          fullName: data.user.firstName + ' ' + data.user.lastName,
          type: 'forgot_password',
          identifierUsed: 'mobile'
        };
        
        await AsyncStorage.setItem('pendingUserData', JSON.stringify(userData));

        console.log('Request OTP - Forgot Password:', { mobile: normalizedMobile, type: 'forgot_password' });

        // Request OTP from backend - send only mobile number
        const otpResponse = await fetch(`${BACKEND_URL}/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mobile: normalizedMobile,
            type: 'forgot_password',
          }),
        });

        const otpData = await otpResponse.json();

        if (!otpData.success) {
          showError(otpData.error || 'Failed to send OTP. Please try again.');
          setLoading(false);
          return;
        }

        // Navigate to OTP verification for password reset
        navigation.replace('OTPVerification');
      } else {
        // User is not registered
        showError('No account found with this mobile number. Please sign up first.');
      }
    } catch (error) {
      console.error('Error checking user existence:', error);
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Soft background gradient */}
      {isDarkMode ? (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="forgotGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#forgotGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="forgotGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#forgotGradient)" />
        </Svg>
      )}

      <View style={[styles.container, { paddingBottom: bottomPadding }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="lock-reset" size={60} color={colors.primary} style={{ marginBottom: 8 }} />
            <Text style={[styles.title, { color: colors.text }]}>Reset Password</Text>
          </View>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <View style={styles.infoContainer}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Enter your registered mobile number to receive a password reset code
            </Text>
            <Text style={[styles.infoSubText, { color: colors.textSecondary }]}>
              Only registered users can reset their password
            </Text>
          </View>

          {/* Input */}
          <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="cellphone" size={22} color={colors.text} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Mobile Number (10 digits)"
              placeholderTextColor={colors.textSecondary}
              value={mobile}
              onChangeText={(text) => setMobile(text.replace(/[^0-9]/g, '').slice(0, 10))}
              keyboardType="phone-pad"
              maxLength={10}
              selectionColor={colors.primary}
            />
          </View>

          {/* Error Message */}
          {error ? (
            <Animated.View style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Send Reset Code Button */}
          <TouchableOpacity 
            style={[styles.resetButton, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.resetButtonDisabled]} 
            onPress={handleForgotPassword} 
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.resetButtonText}>
              {loading ? 'Sending Code...' : 'Send Reset Code'}
            </Text>
            <MaterialCommunityIcons 
              name={loading ? 'loading' : 'send'} 
              size={22} 
              color="#fff" 
              style={{ marginLeft: 8 }} 
            />
          </TouchableOpacity>

          {/* Info */}
          <View style={[styles.demoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.demoText, { color: colors.textSecondary }]}>
              Enter your registered mobile number to receive OTP for password reset
            </Text>
          </View>

          {/* Back to Login */}
          <View style={[styles.backToLoginContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.backToLoginText, { color: colors.textSecondary }]}>
              Remember your password?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Text style={[styles.backToLoginLink, { color: colors.primary }]}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
    zIndex: 1,
  },
  logoContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  card: {
    width: '96%',
    alignSelf: 'center',
    borderRadius: 18,
    padding: 24,
    marginTop: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  infoSubText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  errorText: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 15,
  },
  resetButton: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  resetButtonDisabled: {
    backgroundColor: '#666',
    shadowColor: '#666',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 4,
  },
  backToLoginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  backToLoginText: {
    fontSize: 16,
  },
  backToLoginLink: {
    fontSize: 16,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  demoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  demoText: {
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
