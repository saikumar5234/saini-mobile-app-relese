import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';
import { useTheme } from '../utils/ThemeContext';
import { validateGST, formatGST } from '../utils/gstValidation';

const BOTTOM_NAV_PADDING_ANDROID = 28;

export default function EditProfileScreen({ navigation, route }) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? BOTTOM_NAV_PADDING_ANDROID : 0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [errorAnim] = useState(new Animated.Value(0));
  const [successAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          setFirstName(userData.firstName || '');
          setLastName(userData.lastName || '');
          setGstNumber(userData.gstNumber || '');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };
    loadUserData();
  }, []);

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
    errorAnim.setValue(0);
    Animated.sequence([
      Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => {
      setSuccess(false);
      setSuccessMessage('');
    });
  };

  const [successMessage, setSuccessMessage] = useState('');

  const handleUpdateProfile = async () => {
    // Validate inputs
    if (!firstName.trim()) {
      showError('First name is required');
      return;
    }

    if (!lastName.trim()) {
      showError('Last name is required');
      return;
    }

    // Validate GST if provided
    if (gstNumber && gstNumber.trim().length > 0) {
      const gstValidation = validateGST(gstNumber);
      if (!gstValidation.isValid) {
        showError(gstValidation.error || 'Invalid GST number format');
        return;
      }
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Get current user data to identify the user
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) {
        showError('User data not found. Please login again.');
        setLoading(false);
        return;
      }

      const currentUserData = JSON.parse(userDataStr);
      const identifier = currentUserData.mobile || currentUserData.gstNumber;

      if (!identifier) {
        showError('Unable to identify user. Please login again.');
        setLoading(false);
        return;
      }

      // Prepare update request
      const updateData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };

      // Add mobile OR GST for identification (prefer mobile if available)
      // Backend expects one identifier, not both
      if (currentUserData.mobile) {
        updateData.mobile = currentUserData.mobile;
      } else if (currentUserData.gstNumber) {
        updateData.gstNumber = currentUserData.gstNumber;
      }

      // Add GST number if provided (or empty string to clear it)
      if (gstNumber && gstNumber.trim().length > 0) {
        updateData.newGstNumber = gstNumber.trim().toUpperCase();
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
          showError('The update profile endpoint is not available on the server. Please contact support or check if the backend is properly deployed.');
          setLoading(false);
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
        showError(`${errorMessage}${errorDetails}`);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Update local storage
        const updatedUserData = {
          ...currentUserData,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          gstNumber: gstNumber && gstNumber.trim().length > 0 ? gstNumber.trim().toUpperCase() : (data.user?.gstNumber || currentUserData.gstNumber || null),
        };

        await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
        
        showSuccess('Profile updated successfully!');
        
        // Navigate back after a short delay
        setTimeout(() => {
          navigation.goBack();
        }, 2000);
      } else {
        showError(data.error || 'Failed to update profile. Please try again.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
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
            <SvgLinearGradient id="editGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#222" stopOpacity="1" />
              <Stop offset="100%" stopColor="#000" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#editGradient)" />
        </Svg>
      ) : (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgLinearGradient id="editGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f8f9fa" stopOpacity="1" />
              <Stop offset="100%" stopColor="#e9ecef" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#editGradient)" />
        </Svg>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
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
            <MaterialCommunityIcons name="account-edit" size={60} color={colors.primary} style={{ marginBottom: 8 }} />
            <Text style={[styles.title, { color: colors.text }]}>Edit Profile</Text>
          </View>
        </View>

        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Card */}
          <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            {/* First Name */}
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="First Name"
                placeholderTextColor={colors.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                selectionColor={colors.primary}
              />
            </View>

            {/* Last Name */}
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Last Name"
                placeholderTextColor={colors.textSecondary}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                selectionColor={colors.primary}
              />
            </View>

            {/* GST Number */}
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="card-account-details-outline" size={22} color={colors.text} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="GST Number (optional, 15 chars)"
                placeholderTextColor={colors.textSecondary}
                value={gstNumber}
                onChangeText={(text) => setGstNumber(formatGST(text))}
                keyboardType="default"
                autoCapitalize="characters"
                maxLength={15}
                selectionColor={colors.primary}
              />
            </View>

            {/* Info Text */}
            <View style={[styles.infoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {gstNumber && gstNumber.trim().length > 0 
                  ? 'You can update your GST number. Make sure it follows the correct format.'
                  : 'You can add your GST number if you logged in without one.'}
              </Text>
            </View>

            {/* Error Message */}
            {error ? (
              <Animated.View style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* Success Message */}
            {success ? (
              <Animated.View style={{ opacity: successAnim, transform: [{ translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Text style={[styles.successText, { color: colors.primary }]}>{successMessage}</Text>
              </Animated.View>
            ) : null}

            {/* Update Button */}
            <TouchableOpacity 
              style={[styles.updateButton, { backgroundColor: colors.primary, shadowColor: colors.primary }, loading && styles.updateButtonDisabled]} 
              onPress={handleUpdateProfile} 
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.updateButtonText}>
                {loading ? 'Updating...' : 'Update Profile'}
              </Text>
              <MaterialCommunityIcons 
                name={loading ? 'loading' : 'check'} 
                size={22} 
                color="#fff" 
                style={{ marginLeft: 8 }} 
              />
            </TouchableOpacity>
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
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
    position: 'relative',
    width: '100%',
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    left: 24,
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    width: '100%',
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
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
    flex: 1,
  },
  errorText: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 15,
  },
  successText: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 15,
  },
  updateButton: {
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
  updateButtonDisabled: {
    backgroundColor: '#666',
    shadowColor: '#666',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 4,
  },
});

