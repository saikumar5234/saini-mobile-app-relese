import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const deviceColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [followDeviceTheme, setFollowDeviceTheme] = useState(true); // Default to follow device theme
  const [forceLightMode, setForceLightMode] = useState(false); // When true (e.g. before login), always light

  useEffect(() => {
    // Load saved theme preference
    const loadTheme = async () => {
      try {
        const savedFollowDevice = await AsyncStorage.getItem('followDeviceTheme');
        if (savedFollowDevice !== null) {
          setFollowDeviceTheme(savedFollowDevice === 'true');
        }
        
        const savedTheme = await AsyncStorage.getItem('theme');
        if (savedTheme !== null && savedFollowDevice === 'false') {
          // Only use saved theme if not following device theme
          setIsDarkMode(savedTheme === 'dark');
        } else if (savedFollowDevice === null || savedFollowDevice === 'true') {
          // Follow device theme by default
          setIsDarkMode(deviceColorScheme === 'dark');
        }
      } catch (error) {
        console.error('Error loading theme:', error);
        // Fallback to device theme on error
        setIsDarkMode(deviceColorScheme === 'dark');
      }
    };
    loadTheme();
  }, []);

  // Listen to device theme changes
  useEffect(() => {
    if (followDeviceTheme) {
      setIsDarkMode(deviceColorScheme === 'dark');
    }
  }, [deviceColorScheme, followDeviceTheme]);

  // Listen to system appearance changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (followDeviceTheme) {
        setIsDarkMode(colorScheme === 'dark');
      }
    });

    return () => subscription.remove();
  }, [followDeviceTheme]);

  const toggleTheme = async () => {
    try {
      const newTheme = !isDarkMode;
      setIsDarkMode(newTheme);
      setFollowDeviceTheme(false); // When manually toggled, stop following device theme
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
      await AsyncStorage.setItem('followDeviceTheme', 'false');
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const setFollowDevice = async (follow) => {
    try {
      setFollowDeviceTheme(follow);
      await AsyncStorage.setItem('followDeviceTheme', follow.toString());
      if (follow) {
        // When enabling follow device, use device theme
        setIsDarkMode(deviceColorScheme === 'dark');
        await AsyncStorage.removeItem('theme'); // Clear manual theme preference
      }
    } catch (error) {
      console.error('Error saving follow device theme setting:', error);
    }
  };

  const effectiveDarkMode = forceLightMode ? false : isDarkMode;
  const theme = {
    isDarkMode: effectiveDarkMode,
    toggleTheme,
    followDeviceTheme,
    setFollowDevice,
    setForceLightMode,
    colors: effectiveDarkMode ? {
      // Dark theme colors
      background: '#000',
      surface: '#111',
      card: '#181818',
      primary: '#4CAF50',
      secondary: '#FFD700',
      text: '#fff',
      textSecondary: '#aaa',
      border: '#333',
      shadow: '#000',
      success: '#00C853',
      error: '#FF3B30',
      warning: '#FF9800',
      info: '#2196F3',
    } : {
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
    }
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}; 