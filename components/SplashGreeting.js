import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Dimensions, TouchableOpacity } from 'react-native';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SplashGreeting({ greeting, onClose, visible }) {
  const { colors, isDarkMode } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible && greeting) {
      // Start animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

             // Auto close after 9 seconds
       const timer = setTimeout(() => {
         handleClose();
       }, 5000);

      return () => clearTimeout(timer);
    }
  }, [visible, greeting]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 50,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  if (!visible || !greeting) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isDarkMode ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        opacity: fadeAnim,
      }}
    >
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 50,
          right: 20,
          zIndex: 1001,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={handleClose}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="close" size={24} color={colors.text} />
      </TouchableOpacity>

      <Animated.View
        style={{
          width: screenWidth - 40,
          maxWidth: 400,
          transform: [
            { scale: scaleAnim },
            { translateY: slideAnim }
          ],
          alignItems: 'center',
        }}
      >
        {/* Image with transparent background */}
        {(greeting.imageUrl || greeting.image || greeting.photo) && (
          <View style={{ marginBottom: 24, width: '100%', alignItems: 'center' }}>
            <Image
              source={{ uri: greeting.imageUrl || greeting.image || greeting.photo }}
              style={{
                width: '100%',
                height: 300,
                resizeMode: 'contain',
              }}
            />
          </View>
        )}

        {/* Greeting text - simple and clean */}
        <Text
          style={{
            color: colors.text,
            fontWeight: '500',
            fontSize: 18,
            textAlign: 'center',
            lineHeight: 28,
            letterSpacing: 0.2,
            paddingHorizontal: 20,
          }}
        >
          {greeting.greeting || greeting.message || greeting.text || greeting.title || greeting.content}
        </Text>
      </Animated.View>
    </Animated.View>
  );
} 