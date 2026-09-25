import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Easing, Platform, KeyboardAvoidingView, ScrollView, Dimensions, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { useTheme } from '../utils/ThemeContext';
import { isValidGST, validateGST, formatGST } from '../utils/gstValidation';

const { width: screenWidth } = Dimensions.get('window');

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function AuthScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const { colors: globalColors, isDarkMode: globalIsDarkMode } = useTheme();
  // Force light theme for auth screens
  const isDarkMode = false;
  const colors = {
    // Light theme colors
    background: '#fff',
    surface: '#f5f5f5',
    card: '#fff',
    primary: '#4CAF50',
    secondary: '#FFD700',
    text: '#000',
    textSecondary: '#666',
    border: '#e0e0e0',
    shadow: '#000',
    success: '#00C853',
    error: '#FF3B30',
    warning: '#FF9800',
    info: '#2196F3',
  };
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'otp'
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorAnim] = useState(new Animated.Value(0));
  const [successAnim] = useState(new Animated.Value(0));
  const hasShownSuccessRef = React.useRef(false);

  // Handle navigation params for success message with delay to prevent layout shifts
  useEffect(() => {
    const successMsg = route.params?.showSuccessMessage;
    if (successMsg && !hasShownSuccessRef.current) {
      hasShownSuccessRef.current = true;
      
      // Wait for screen to fully mount and stabilize before showing message
      const timer = setTimeout(() => {
        setSuccess(true);
        setSuccessMessage(successMsg);
        setError('');
        errorAnim.setValue(0);
        Animated.sequence([
          Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(2000), // Show message for 2 seconds
          Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => {
          setSuccess(false);
          setSuccessMessage('');
          hasShownSuccessRef.current = false;
        });
        // Clear the param to prevent showing again
        navigation.setParams({ showSuccessMessage: undefined });
      }, 300); // Reduced delay to let screen stabilize
      
      return () => {
        clearTimeout(timer);
      };
    } else if (!successMsg) {
      // Reset ref when param is cleared
      hasShownSuccessRef.current = false;
    }
  }, [route.params?.showSuccessMessage]);

  // Animate error
  const showError = (msg) => {
    setError(msg);
    setSuccess(false);
    Animated.sequence([
      Animated.timing(errorAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(15000),
      Animated.timing(errorAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => setError(''));
  };

  // Animate success
  const showSuccess = (msg) => {
    setSuccess(true);
    setSuccessMessage(msg);
    setError('');
    Animated.sequence([
      Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
    ]).start(() => {
      // Redirect to login after showing success message
      setTimeout(() => {
        setMode('login');
        setSuccess(false);
        setSuccessMessage('');
        // Clear form fields
        setFirstName('');
        setLastName('');
        setMobile('');
        setGstNumber('');
        setPassword('');
        setConfirmPassword('');
        successAnim.setValue(0);
      }, 500);
    });
  };

  const handleAuth = async () => {
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      let response, data;
      if (mode === 'signup') {
        // Validate all required fields
        if (!firstName || firstName.trim().length === 0) {
          showError('First name is required');
          setLoading(false);
          return;
        }
        
        if (!lastName || lastName.trim().length === 0) {
          showError('Last name is required');
          setLoading(false);
          return;
        }
        
        if (!mobile || mobile.length !== 10) {
          showError('Please enter a valid 10-digit mobile number');
          setLoading(false);
          return;
        }
        
        if (!/^[0-9]{10}$/.test(mobile)) {
          showError('Mobile number must contain only digits');
          setLoading(false);
          return;
        }
        
        // GST number is optional - validate only if provided
        if (gstNumber && gstNumber.trim().length > 0) {
          const gstValidation = validateGST(gstNumber);
          if (!gstValidation.isValid) {
            showError(gstValidation.error || 'Invalid GST number format');
            setLoading(false);
            return;
          }
        }
        
        if (!password || password.length < 6) {
          showError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        
        if (password !== confirmPassword) {
          showError('Passwords do not match');
          setLoading(false);
          return;
        }
        
        // Step 1: Save pending user data (before OTP verification)
        // Normalize all values to ensure consistency
        const normalizedMobile = mobile.trim();
        const normalizedGst = gstNumber && gstNumber.trim().length > 0 
          ? gstNumber.trim().toUpperCase() 
          : null;
        
        const pendingUserData = {
          mobile: normalizedMobile,
          gstNumber: normalizedGst,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password: password,
          type: 'signup'
        };
        await AsyncStorage.setItem('pendingUserData', JSON.stringify(pendingUserData));

        // Step 2: Request OTP first (verify mobile number before creating account)
        const otpRequestBody = {
          mobile: normalizedMobile,
          type: 'signup',
        };
        
        // Only include GST if provided
        if (normalizedGst) {
          otpRequestBody.gstNumber = normalizedGst;
        }
        
        console.log('Request OTP - Signup:', otpRequestBody);
        
        const otpResponse = await fetch(`${BACKEND_URL}/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otpRequestBody),
        });

        const otpData = await otpResponse.json();

        if (!otpData.success) {
          showError(otpData.error || 'Failed to send OTP. Please try again.');
          setLoading(false);
          return;
        }

        // Step 3: Navigate to OTP verification screen
        // Account will be created AFTER OTP verification in OTPVerificationScreen
        navigation.replace('OTPVerification');
      } else {
        // login
        if (loginMethod === 'otp') {
          // OTP Login
          if (!emailOrMobile || emailOrMobile.trim().length !== 10) {
            showError('Please enter a valid 10-digit mobile number');
            setLoading(false);
            return;
          }
          
          if (!/^[0-9]{10}$/.test(emailOrMobile)) {
            showError('Mobile number must contain only digits');
            setLoading(false);
            return;
          }
          
          // First check if user exists (OTP login only for registered users)
          const checkUserResponse = await fetch(`${BACKEND_URL}/check-user-exists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobile: emailOrMobile.trim(),
            }),
          });
          
          const checkUserData = await checkUserResponse.json();
          
          if (!checkUserData.exists) {
            showError('No account found with this mobile number. Please sign up first or use password login.');
            setLoading(false);
            return;
          }
          
          // User exists, request OTP for login
          const otpResponse = await fetch(`${BACKEND_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobile: emailOrMobile.trim(),
              type: 'login',
            }),
          });
          
          const otpData = await otpResponse.json();
          
          if (!otpData.success) {
            showError(otpData.error || 'Failed to send OTP. Please try again.');
            setLoading(false);
            return;
          }
          
          // Save user data for OTP verification
          const pendingUserData = {
            mobile: emailOrMobile.trim(),
            type: 'login'
          };
          await AsyncStorage.setItem('pendingUserData', JSON.stringify(pendingUserData));
          
          // Navigate to OTP verification
          navigation.replace('OTPVerification');
          setLoading(false);
          return;
        } else {
          // Password Login
          if (!emailOrMobile || emailOrMobile.trim().length === 0) {
            showError('Please enter your mobile number or GST number');
            setLoading(false);
            return;
          }
          
          if (!password || password.length === 0) {
            showError('Please enter your password');
            setLoading(false);
            return;
          }
          
          // Determine if input is mobile or GST
          const isMobile = /^[0-9]{10}$/.test(emailOrMobile);
          const isGst = isValidGST(emailOrMobile);
          
          if (!isMobile && !isGst) {
            showError('Please enter a valid 10-digit mobile number or valid GST number');
            setLoading(false);
            return;
          }
          
          response = await fetch(`${BACKEND_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobile: isMobile ? emailOrMobile : undefined,
              gstNumber: isGst ? emailOrMobile.toUpperCase() : undefined,
              password: password,
            }),
          });
        }
        
        data = await response.json();
        
        if (data.success) {
          // Save authentication token
          await AsyncStorage.setItem('authToken', data.token || 'authenticated');
          
          // Store user data for session tracking with approval status
          const userData = {
            gstNumber: data.user?.gstNumber || null,
            mobile: data.user?.mobile || null,
            name: data.user?.name || emailOrMobile,
            registrationDate: data.user?.registrationDate || data.user?.createdAt || null,
            isApproved: data.user?.isApproved || data.user?.approved || false
          };
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          
          // Check approval status and trial period
          const trialPeriodDays = 7;
          const registrationDate = userData.registrationDate ? new Date(userData.registrationDate) : null;
          const now = new Date();
          
          if (userData.isApproved) {
            // User is approved, navigate to StockList
            navigation.replace('StockList');
          } else if (registrationDate) {
            // Check if trial period (7 days) has expired
            const daysSinceRegistration = Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24));
            
            if (daysSinceRegistration >= trialPeriodDays) {
              // Trial expired and not approved, show contact details
              navigation.replace('ContactDetails');
            } else {
              // Still within trial period, allow access
              navigation.replace('StockList');
            }
          } else {
            // No registration date, assume new user - allow access for now
            navigation.replace('StockList');
          }
        } else {
          showError(data.error || 'Login failed. Please check your credentials.');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };



  // Create dynamic styles function
  const createDynamicStyles = (colors, isDarkMode) => {
    return StyleSheet.create({
      // Add any additional dynamic styles here if needed
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Soft background gradient */}
      {isDarkMode ? (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="authGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#authGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="authGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#authGradient)" />
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
          bounces={false}
        >
          <View style={styles.container}>
            {/* Logo and Name */}
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={[styles.appName, { color: colors.text }]}>Saini Dry Fruits</Text>
            </View>

            {/* Card */}
            <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            {/* Form */}
            {mode === 'login' ? (
              <>
                {/* Login Method Toggle */}
                <View style={[styles.loginMethodContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.loginMethodButton, loginMethod === 'password' && { backgroundColor: colors.primary }]}
                    onPress={() => setLoginMethod('password')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.loginMethodText, { color: loginMethod === 'password' ? '#fff' : colors.text }]}>Password</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.loginMethodButton, loginMethod === 'otp' && { backgroundColor: colors.primary }]}
                    onPress={() => setLoginMethod('otp')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.loginMethodText, { color: loginMethod === 'otp' ? '#fff' : colors.text }]}>OTP</Text>
                  </TouchableOpacity>
                </View>
                
                {loginMethod === 'password' ? (
                  <>
                    <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="Mobile Number or GST Number"
                        placeholderTextColor={colors.textSecondary}
                        value={emailOrMobile}
                        onChangeText={(text) => setEmailOrMobile(text.toUpperCase())}
                        keyboardType="default"
                        autoCapitalize="characters"
                        selectionColor={colors.primary}
                      />
                    </View>
                    <View style={[styles.inputRow, { position: 'relative', backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <MaterialCommunityIcons name="lock-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="Password"
                        placeholderTextColor={colors.textSecondary}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        selectionColor={colors.primary}
                      />
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                        <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialCommunityIcons name="cellphone" size={22} color={colors.text} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="Mobile Number"
                      placeholderTextColor={colors.textSecondary}
                      value={emailOrMobile}
                      onChangeText={(text) => setEmailOrMobile(text.replace(/[^0-9]/g, '').slice(0, 10))}
                      keyboardType="phone-pad"
                      maxLength={10}
                      selectionColor={colors.primary}
                    />
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="First Name"
                    placeholderTextColor={colors.textSecondary}
                    value={firstName}
                    onChangeText={setFirstName}
                    keyboardType="default"
                    autoCapitalize="words"
                    selectionColor={colors.primary}
                  />
                </View>
                <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Last Name"
                    placeholderTextColor={colors.textSecondary}
                    value={lastName}
                    onChangeText={setLastName}
                    keyboardType="default"
                    autoCapitalize="words"
                    selectionColor={colors.primary}
                  />
                </View>
                <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="cellphone" size={22} color={colors.text} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Mobile Number"
                    placeholderTextColor={colors.textSecondary}
                    value={mobile}
                    onChangeText={setMobile}
                    keyboardType="phone-pad"
                    maxLength={10}
                    selectionColor={colors.primary}
                  />
                </View>
                <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="GST Number (Optional - 15 characters)"
                    placeholderTextColor={colors.textSecondary}
                    value={gstNumber}
                    onChangeText={(text) => setGstNumber(formatGST(text))}
                    keyboardType="default"
                    autoCapitalize="characters"
                    maxLength={15}
                    selectionColor={colors.primary}
                  />
                </View>
              </>
            )}
            {mode === 'signup' && (
              <>
                <View style={[styles.inputRow, { position: 'relative', backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="lock-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    selectionColor={colors.primary}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                    <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </>
            )}
            {mode === 'signup' && (
              <View style={[styles.inputRow, { position: 'relative', backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="lock-check-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirm Password"
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
            )}
            {/* Animated Error */}
            {error ? (
              <Animated.View style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </Animated.View>
            ) : null}
            
            {/* Animated Success */}
            {success && successMessage ? (
              <Animated.View style={{ opacity: successAnim, transform: [{ translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <View style={[styles.successContainer, { backgroundColor: colors.success || '#4CAF50' }]}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.successText}>{successMessage}</Text>
                </View>
              </Animated.View>
            ) : null}
            <TouchableOpacity style={[styles.authButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={handleAuth} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.authButtonText}>{loading ? (mode === 'login' ? 'Logging in...' : 'Signing up...') : (mode === 'login' ? 'Login' : 'Sign Up')}</Text>
              <MaterialCommunityIcons name={mode === 'login' ? 'login' : 'account-plus'} size={22} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
            
            {/* Forgot Password Link - Only show in login mode */}
            {mode === 'login' && (
              <TouchableOpacity 
                onPress={() => navigation.navigate('ForgotPassword')} 
                style={styles.forgotPasswordContainer}
                activeOpacity={0.8}
              >
                <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
              </TouchableOpacity>
            )}
            
            {/* Show SignUp link only in login mode */}
            {mode === 'login' && (
              <View style={[styles.signupLinkContainer, { borderTopColor: colors.border }]}>
                <Text style={[styles.signupText, { color: colors.textSecondary }]}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => setMode('signup')} activeOpacity={0.8}>
                  <Text style={[styles.signupLink, { color: colors.primary }]}>SignUp</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Show SignIn link only in signup mode */}
            {mode === 'signup' && (
              <View style={[styles.signupLinkContainer, { borderTopColor: colors.border }]}>
                <Text style={[styles.signupText, { color: colors.textSecondary }]}>Existing user? </Text>
                <TouchableOpacity onPress={() => setMode('login')} activeOpacity={0.8}>
                  <Text style={[styles.signupLink, { color: colors.primary }]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
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
    minHeight: Dimensions.get('window').height - 100,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 18,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    padding: 8,
  },
  appName: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
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
  authButton: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  authButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 4,
  },
  errorText: {
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    fontSize: 15,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  successText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center',
  },

  signupLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  signupText: {
    fontSize: 16,
  },
  signupLink: {
    fontSize: 16,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  forgotPasswordContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 16,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  loginMethodContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    marginBottom: 16,
    padding: 4,
    borderWidth: 2,
  },
  loginMethodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginMethodText: {
    fontSize: 16,
    fontWeight: '600',
  },
}); 