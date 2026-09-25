import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Alert, Dimensions, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { useTheme } from '../utils/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function OTPVerificationScreen({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [userData, setUserData] = useState(null);
  const [errorAnim] = useState(new Animated.Value(0));
  const inputRefs = useRef([]);
  const hiddenOtpRef = useRef(null);

  useEffect(() => {
    // Load pending user data
    const loadUserData = async () => {
      try {
        const pendingData = await AsyncStorage.getItem('pendingUserData');
        if (pendingData) {
          setUserData(JSON.parse(pendingData));
        } else {
          // If no pending data, redirect to auth
          navigation.replace('Auth');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        navigation.replace('Auth');
      }
    };
    loadUserData();

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
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

  const handleOtpChange = (value, index) => {
    // Paste or autofill: accept multiple digits and fill boxes
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (i < 6) newOtp[i] = d;
      });
      setOtp(newOtp);
      if (digits.length === 6) {
        handleVerifyOTP(newOtp.join(''));
      } else {
        inputRefs.current[Math.min(digits.length, 5)]?.focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit !== '') && newOtp.join('').length === 6) {
      handleVerifyOTP(newOtp.join(''));
    }
  };

  const handleHiddenOtpChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    if (digits.length === 0) {
      setOtp(['', '', '', '', '', '']);
      return;
    }
    const arr = digits.split('');
    const newOtp = ['', '', '', '', '', ''];
    arr.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
    setOtp(newOtp);
    if (digits.length === 6) {
      handleVerifyOTP(digits);
    }
  };

  const handleKeyPress = (key, index) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async (otpCode = null) => {
    const code = otpCode || otp.join('');
    if (code.length !== 6) {
      showError('Please enter 6-digit OTP');
      return;
    }

    if (!userData) {
      showError('User data missing. Please go back and try again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // CRITICAL: Use the SAME identifier that was used when requesting OTP
      // For forgot_password: use the identifierUsed field to know which one to send
      // For signup: both mobile and GST are always present, so send both
      
      const requestBody = {
        otp: code,
        type: userData.type, // 'signup', 'login', or 'forgot_password'
      };
      
      if (userData.type === 'forgot_password' && userData.identifierUsed) {
        // For forgot_password, use ONLY the identifier that was used to request OTP
        if (userData.identifierUsed === 'mobile' && userData.mobile) {
          requestBody.mobile = userData.mobile.trim();
        } else if (userData.identifierUsed === 'gst' && userData.gstNumber) {
          requestBody.gstNumber = userData.gstNumber.trim().toUpperCase();
        }
      } else if (userData.type === 'login') {
        // For login, only mobile is used
        if (userData.mobile) {
          requestBody.mobile = userData.mobile.trim();
        }
      } else if (userData.type === 'signup') {
        // For signup, mobile is required, GST is optional
        if (userData.mobile) {
          requestBody.mobile = userData.mobile.trim();
        }
        // Only include GST if it was provided
        if (userData.gstNumber && userData.gstNumber.trim().length > 0) {
          requestBody.gstNumber = userData.gstNumber.trim().toUpperCase();
        }
      } else {
        // Fallback for other types
        if (userData.mobile) {
          requestBody.mobile = userData.mobile.trim();
        }
        if (userData.gstNumber && userData.gstNumber.trim().length > 0) {
          requestBody.gstNumber = userData.gstNumber.trim().toUpperCase();
        }
      }
      
      console.log('OTP Verification Request:', JSON.stringify(requestBody, null, 2));
      
      // Call backend to verify OTP
      const response = await fetch(`${BACKEND_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OTP verification failed. Status:', response.status, 'Response:', errorText);
        let errorMessage = 'OTP verification failed. Please try again.';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // If response is not JSON, use default message
        }
        showError(errorMessage);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!data.success) {
        showError(data.error || 'Invalid OTP. Please try again.');
        setLoading(false);
        return;
      }

      // OTP verified successfully
      console.log('OTP verification response:', data);
      
      if (userData.type === 'forgot_password') {
        // For password reset flow, navigate to reset password screen
        navigation.replace('ResetPassword');
      } else if (userData.type === 'login') {
        // For OTP login flow: Check if verify-otp returned token directly
        if (data.token && data.user) {
          // Backend returns token directly from verify-otp for login
          console.log('Token received from verify-otp for login');
          
          // Save authentication token
          await AsyncStorage.setItem('authToken', data.token || 'authenticated');
          
          // Store user data with approval status
          const userDataToStore = {
            gstNumber: data.user?.gstNumber || null,
            mobile: data.user?.mobile || userData.mobile,
            name: data.user?.name || `${data.user?.firstName || ''} ${data.user?.lastName || ''}`.trim() || userData.mobile,
            registrationDate: data.user?.registrationDate || data.user?.createdAt || null,
            isApproved: data.user?.isApproved || data.user?.approved || false
          };
          await AsyncStorage.setItem('userData', JSON.stringify(userDataToStore));
          
          await AsyncStorage.removeItem('pendingUserData');
          
          // Check approval status and trial period
          const trialPeriodDays = 7;
          const registrationDate = userDataToStore.registrationDate ? new Date(userDataToStore.registrationDate) : null;
          const now = new Date();
          
          if (userDataToStore.isApproved) {
            navigation.replace('StockList');
          } else if (registrationDate) {
            const daysSinceRegistration = Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24));
            if (daysSinceRegistration >= trialPeriodDays) {
              navigation.replace('ContactDetails');
            } else {
              navigation.replace('StockList');
            }
          } else {
            navigation.replace('StockList');
          }
        } else {
          // Backend doesn't return token from verify-otp, need to call login endpoint
          // But login requires password, so we need an OTP-based login endpoint
          // Try using /api/login-otp or similar, or use a special flag
          console.log('No token from verify-otp, attempting alternative login...');
          
          // Option 1: Try login with OTP (separate endpoint)
          const loginResponse = await fetch(`${BACKEND_URL}/login-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobile: userData.mobile,
              otp: code, // Send the OTP code for verification
            }),
          });

          if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            if (loginData.success) {
              await AsyncStorage.setItem('authToken', loginData.token || 'authenticated');
              const userDataToStore = {
                gstNumber: loginData.user?.gstNumber || null,
                mobile: loginData.user?.mobile || userData.mobile,
                name: loginData.user?.name || userData.mobile,
                registrationDate: loginData.user?.registrationDate || loginData.user?.createdAt || null,
                isApproved: loginData.user?.isApproved || loginData.user?.approved || false
              };
              await AsyncStorage.setItem('userData', JSON.stringify(userDataToStore));
              await AsyncStorage.removeItem('pendingUserData');
              
              const trialPeriodDays = 7;
              const registrationDate = userDataToStore.registrationDate ? new Date(userDataToStore.registrationDate) : null;
              const now = new Date();
              
              if (userDataToStore.isApproved) {
                navigation.replace('StockList');
              } else if (registrationDate) {
                const daysSinceRegistration = Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24));
                if (daysSinceRegistration >= trialPeriodDays) {
                  navigation.replace('ContactDetails');
                } else {
                  navigation.replace('StockList');
                }
              } else {
                navigation.replace('StockList');
              }
              return;
            }
          }
          
          // Option 2: If backend verify-otp for login type should return token, but doesn't
          // We'll use the user data from verify-otp response and set authenticated
          console.log('Using verify-otp response data for login');
          await AsyncStorage.setItem('authToken', 'authenticated');
          
          const userDataToStore = {
            gstNumber: data.user?.gstNumber || null,
            mobile: data.user?.mobile || userData.mobile,
            name: data.user?.name || `${data.user?.firstName || ''} ${data.user?.lastName || ''}`.trim() || userData.mobile,
            registrationDate: data.user?.registrationDate || data.user?.createdAt || null,
            isApproved: data.user?.isApproved || data.user?.approved || false
          };
          await AsyncStorage.setItem('userData', JSON.stringify(userDataToStore));
          await AsyncStorage.removeItem('pendingUserData');
          
          const trialPeriodDays = 7;
          const registrationDate = userDataToStore.registrationDate ? new Date(userDataToStore.registrationDate) : null;
          const now = new Date();
          
          if (userDataToStore.isApproved) {
            navigation.replace('StockList');
          } else if (registrationDate) {
            const daysSinceRegistration = Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24));
            if (daysSinceRegistration >= trialPeriodDays) {
              navigation.replace('ContactDetails');
            } else {
              navigation.replace('StockList');
            }
          } else {
            navigation.replace('StockList');
          }
        }
      } else if (userData.type === 'signup') {
        // For signup flow: OTP verified, now create the user account
        // Build signup request body - only include GST if provided
        const signupBody = {
          mobile: userData.mobile,
          firstName: userData.firstName,
          lastName: userData.lastName,
          password: userData.password,
        };
        
        // Only include GST if it was provided
        if (userData.gstNumber && userData.gstNumber.trim().length > 0) {
          signupBody.gstNumber = userData.gstNumber;
        }
        
        const signupResponse = await fetch(`${BACKEND_URL}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signupBody),
        });

        const signupData = await signupResponse.json();

        if (!signupData.success) {
          showError(signupData.error || 'Account creation failed. Please try again.');
          setLoading(false);
          return;
        }

        // Account created successfully, save authentication token
        await AsyncStorage.setItem('authToken', 'authenticated');
        
        // Save user data from backend response with registration date and approval status
        const registrationDate = new Date().toISOString();
        const isApproved = signupData.user?.isApproved || signupData.user?.approved || false;
        
        if (signupData.user) {
          await AsyncStorage.setItem('userData', JSON.stringify({
            gstNumber: signupData.user.gstNumber || null,
            mobile: signupData.user.mobile,
            name: `${signupData.user.firstName} ${signupData.user.lastName}`,
            registrationDate: signupData.user.registrationDate || registrationDate,
            isApproved: isApproved
          }));
        } else if (userData) {
          await AsyncStorage.setItem('userData', JSON.stringify({
            gstNumber: userData.gstNumber || null,
            mobile: userData.mobile,
            name: `${userData.firstName} ${userData.lastName}`,
            registrationDate: registrationDate,
            isApproved: false // New users start as not approved
          }));
        }
        
        await AsyncStorage.removeItem('pendingUserData');
        
        // Navigate to StockList after successful signup
        navigation.replace('StockList');
      } else {
        // Fallback for any other flow
        await AsyncStorage.setItem('authToken', 'authenticated');
        
        if (userData) {
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          await AsyncStorage.removeItem('pendingUserData');
        }
        
        navigation.replace('StockList');
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      showError('Verification failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!userData) {
      showError('User data missing. Please go back and try again.');
      return;
    }

    setCountdown(60);
    setCanResend(false);
    setOtp(['', '', '', '', '', '']);
    setError('');
    
    try {
      // Ensure GST number is uppercase and trimmed to match original request format
      const gstNumber = userData.gstNumber ? userData.gstNumber.trim().toUpperCase() : null;
      const mobile = userData.mobile ? userData.mobile.trim() : null;
      
      // Build request body - only include fields that have values
      const requestBody = {
        type: userData.type,
      };
      
      if (mobile) {
        requestBody.mobile = mobile;
      }
      if (gstNumber) {
        requestBody.gstNumber = gstNumber;
      }
      
      // Call backend to resend OTP
      const response = await fetch(`${BACKEND_URL}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.success) {
        showError(data.error || 'Failed to resend OTP. Please try again.');
        setCanResend(true);
        return;
      }

      Alert.alert('OTP Sent', 'A new OTP has been sent to your mobile number.');
      
      // Restart countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Resend OTP error:', error);
      showError('Failed to resend OTP. Please check your connection and try again.');
      setCanResend(true);
    }
  };

  const getDisplayNumber = () => {
    if (!userData) return '';
    const mobile = userData.mobile || '';
    if (mobile.length === 10) {
      return `${mobile.slice(0, 3)}***${mobile.slice(6)}`;
    }
    return mobile;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Soft background gradient */}
      {isDarkMode ? (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="otpGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#otpGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="otpGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#otpGradient)" />
        </Svg>
      )}

      <View style={[styles.container, { paddingBottom: bottomPadding }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.replace('Auth')} 
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="shield-check" size={60} color={colors.primary} style={{ marginBottom: 8 }} />
            <Text style={[styles.title, { color: colors.text }]}>Verify OTP</Text>
          </View>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <View style={styles.infoContainer}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              We've sent a 6-digit verification code to
            </Text>
            <Text style={[styles.phoneNumber, { color: colors.text }]}>{getDisplayNumber()}</Text>
          </View>

          {/* Hidden input for OTP auto-fill (iOS oneTimeCode / Android one-time-code) */}
          <TextInput
            ref={hiddenOtpRef}
            value={otp.join('')}
            onChangeText={handleHiddenOtpChange}
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            style={styles.hiddenOtpInput}
            caretHidden
          />
          {/* OTP Input: tap to focus hidden field (enables SMS OTP suggestion) */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => hiddenOtpRef.current?.focus()}
            style={styles.otpContainer}
          >
            {otp.map((digit, index) => {
              const isFilled = digit !== '';
              const activeIndex = Math.min(otp.join('').length, 5);
              const isActive = index === activeIndex;
              return (
                <TextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  editable={false}
                  style={[
                    styles.otpInput,
                    { 
                      backgroundColor: colors.surface, 
                      borderColor: colors.border,
                      color: colors.text
                    },
                    (isFilled || isActive) && { 
                      borderColor: colors.primary, 
                      borderWidth: 2,
                      backgroundColor: isDarkMode ? '#1a2e1a' : '#e8f5e8' 
                    },
                    isActive && !isFilled && {
                      borderColor: colors.primary,
                      backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.12)',
                    },
                    error && { borderColor: colors.error }
                  ]}
                  value={digit}
                  onFocus={() => hiddenOtpRef.current?.focus()}
                />
              );
            })}
          </TouchableOpacity>

          {/* Error Message */}
          {error ? (
            <Animated.View style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Verify Button */}
          <TouchableOpacity 
            style={[styles.verifyButton, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.verifyButtonDisabled]} 
            onPress={() => handleVerifyOTP()} 
            disabled={loading || otp.join('').length !== 6}
            activeOpacity={0.85}
          >
            <Text style={styles.verifyButtonText}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </Text>
            <MaterialCommunityIcons 
              name={loading ? 'loading' : 'check-circle'} 
              size={22} 
              color="#fff" 
              style={{ marginLeft: 8 }} 
            />
          </TouchableOpacity>

          {/* Resend OTP */}
          <View style={[styles.resendContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.resendText, { color: colors.textSecondary }]}>
              Didn't receive the code?{' '}
            </Text>
            {canResend ? (
              <TouchableOpacity onPress={handleResendOTP} activeOpacity={0.8}>
                <Text style={[styles.resendLink, { color: colors.primary }]}>Resend OTP</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.countdownText, { color: colors.textSecondary }]}>
                Resend in {countdown}s
              </Text>
            )}
          </View>

          {/* Info */}
          <View style={[styles.demoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.demoText, { color: colors.textSecondary }]}>
              Enter the 6-digit code sent to your mobile number
            </Text>
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
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  otpInput: {
    width: 40,
    height: 55,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorText: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 15,
  },
  verifyButton: {
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
  verifyButtonDisabled: {
    backgroundColor: '#666',
    shadowColor: '#666',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 4,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  resendText: {
    fontSize: 16,
  },
  resendLink: {
    fontSize: 16,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  countdownText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  demoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  demoText: {
    fontSize: 14,
    marginLeft: 8,
    fontStyle: 'italic',
  },
});
