import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { useTheme } from '../utils/ThemeContext';

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function ResetPasswordScreen({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorAnim] = useState(new Animated.Value(0));
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    // Load user data from OTP verification
    const loadUserData = async () => {
      try {
        const pendingData = await AsyncStorage.getItem('pendingUserData');
        if (pendingData) {
          const parsed = JSON.parse(pendingData);
          if (parsed.type === 'forgot_password') {
            setUserData(parsed);
          } else {
            navigation.replace('Auth');
          }
        } else {
          navigation.replace('Auth');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        navigation.replace('Auth');
      }
    };
    loadUserData();
  }, []);

  // Animate error
  const showError = (msg) => {
    setError(msg);
    Animated.sequence([
      Animated.timing(errorAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(15000),
      Animated.timing(errorAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => setError(''));
  };

  const validatePassword = (password) => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    return null;
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      showError('Please enter a new password');
      return;
    }

    if (!confirmPassword.trim()) {
      showError('Please confirm your password');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      showError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call backend API to reset password
      const response = await fetch(`${BACKEND_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstNumber: userData?.gstNumber || undefined,
          mobile: userData?.mobile || undefined,
          newPassword: newPassword,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Clear pending data
        await AsyncStorage.removeItem('pendingUserData');
        
        // Navigate without animation to prevent layout shifts, then add success message
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'Auth', 
            params: { 
              showSuccessMessage: 'Password reset successful! Please login with your new password.' 
            } 
          }],
        });
      } else {
        showError(data.error || 'Failed to reset password. Please try again.');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDisplayNumber = () => {
    if (!userData) return '';
    const mobile = userData.mobile || '';
    const email = userData.email || '';
    if (mobile.length === 10) {
      return `${mobile.slice(0, 3)}***${mobile.slice(6)}`;
    }
    if (email) {
      const [username, domain] = email.split('@');
      return `${username.slice(0, 2)}***@${domain}`;
    }
    return mobile || email;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Soft background gradient */}
      {isDarkMode ? (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="resetGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#resetGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="resetGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#resetGradient)" />
        </Svg>
      )}

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                onPress={() => {
                  // Clear any pending params and navigate back
                  navigation.setParams({ showSuccessMessage: undefined });
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.replace('Auth');
                  }
                }} 
                style={styles.backButton}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
              </TouchableOpacity>
              
              <View style={styles.logoContainer}>
                <MaterialCommunityIcons name="lock-reset" size={60} color={colors.primary} style={{ marginBottom: 8 }} />
                <Text style={[styles.title, { color: colors.text }]}>Set New Password</Text>
              </View>
            </View>

            {/* Card */}
            <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <View style={styles.infoContainer}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Create a new password for
            </Text>
            <Text style={[styles.userInfo, { color: colors.text }]}>{getDisplayNumber()}</Text>
          </View>

          {/* New Password Input */}
          <View style={[styles.inputRow, { position: 'relative', backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="lock-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="New Password"
              placeholderTextColor={colors.textSecondary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
              selectionColor={colors.primary}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
              <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Confirm Password Input */}
          <View style={[styles.inputRow, { position: 'relative', backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="lock-check-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Confirm New Password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              selectionColor={colors.primary}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(v => !v)} style={styles.eyeBtn}>
              <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Password Requirements */}
          <View style={[styles.requirementsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.requirementsTitle, { color: colors.textSecondary }]}>Password Requirements:</Text>
            <Text style={[styles.requirementsText, { color: colors.textSecondary }]}>• At least 6 characters long</Text>
            <Text style={[styles.requirementsText, { color: colors.textSecondary }]}>• Use a combination of letters and numbers</Text>
          </View>

          {/* Error Message */}
          {error ? (
            <Animated.View style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Reset Password Button */}
          <TouchableOpacity 
            style={[styles.resetButton, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.resetButtonDisabled]} 
            onPress={handleResetPassword} 
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.resetButtonText}>
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </Text>
            <MaterialCommunityIcons 
              name={loading ? 'loading' : 'check-circle'} 
              size={22} 
              color="#fff" 
              style={{ marginLeft: 8 }} 
            />
          </TouchableOpacity>

          {/* Back to Login */}
          <View style={[styles.backToLoginContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.backToLoginText, { color: colors.textSecondary }]}>
              Remember your password?{' '}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                // Clear any pending params and navigate back
                navigation.setParams({ showSuccessMessage: undefined });
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.replace('Auth');
                }
              }} 
              activeOpacity={0.8}
            >
              <Text style={[styles.backToLoginLink, { color: colors.primary }]}>Back to Login</Text>
            </TouchableOpacity>
          </View>
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
    paddingBottom: 20,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    minHeight: '100%',
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
    marginBottom: 24,
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  userInfo: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
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
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  requirementsContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  requirementsText: {
    fontSize: 13,
    marginBottom: 2,
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
});
