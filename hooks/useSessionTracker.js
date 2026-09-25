import React from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';

export function useSessionTracker(userId, onSessionEnd) {
  const appState = React.useRef(AppState.currentState);
  const sessionStart = React.useRef(Date.now());

  // Get today's date key for tracking daily time
  const getTodayKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  // Get stored time data
  const getStoredTimeData = async () => {
    try {
      const todayKey = getTodayKey();
      const todayTimeSpent = await AsyncStorage.getItem(`todayTimeSpent_${todayKey}`) || '0';
      const totalTimeSpent = await AsyncStorage.getItem('totalTimeSpent') || '0';
      const userData = await AsyncStorage.getItem('userData');
      
      return {
        todayTimeSpent: parseInt(todayTimeSpent),
        totalTimeSpent: parseInt(totalTimeSpent),
        userData: userData ? JSON.parse(userData) : null
      };
    } catch (error) {
      console.error('Error getting stored time data:', error);
      return { todayTimeSpent: 0, totalTimeSpent: 0, userData: null };
    }
  };

  // Update stored time data
  const updateStoredTimeData = async (sessionDuration) => {
    try {
      const todayKey = getTodayKey();
      const { todayTimeSpent, totalTimeSpent } = await getStoredTimeData();
      
      const newTodayTime = todayTimeSpent + sessionDuration;
      const newTotalTime = totalTimeSpent + sessionDuration;
      
      await AsyncStorage.setItem(`todayTimeSpent_${todayKey}`, newTodayTime.toString());
      await AsyncStorage.setItem('totalTimeSpent', newTotalTime.toString());
      
      return { newTodayTime, newTotalTime };
    } catch (error) {
      console.error('Error updating stored time data:', error);
      return { newTodayTime: 0, newTotalTime: 0 };
    }
  };

  // Send session data to backend
  const sendSessionDataToBackend = async (sessionData) => {
    try {
      console.log('Attempting to send session data to backend...');
      
      const response = await fetch(`${BACKEND_URL}/user-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Session data sent successfully:', result);
      return result;
    } catch (error) {
      console.error('Error sending session data to backend:', error);
      // Don't throw error - session tracking should continue even if backend is down
      // The data is still stored locally
      return null;
    }
  };

  React.useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      console.log('App state changed from', appState.current, 'to', nextAppState);
      
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // App is going to background, calculate session
        const sessionEnd = Date.now();
        const sessionDuration = Math.round((sessionEnd - sessionStart.current) / 1000); // seconds
        
        console.log('Session ending, duration:', sessionDuration, 'seconds');
        
        if (sessionDuration > 0) {
          try {
            // Update stored time data
            const { newTodayTime, newTotalTime } = await updateStoredTimeData(sessionDuration);
            
            // Get user data and device info
            const { userData } = await getStoredTimeData();

            const startDate = new Date(sessionStart.current);
            const endDate = new Date(sessionEnd);
            const tzOffsetMin = startDate.getTimezoneOffset();
            const tzOffsetHours = -tzOffsetMin / 60;
            const tzSign = tzOffsetHours >= 0 ? '+' : '-';
            const tzAbs = Math.abs(tzOffsetHours);
            const tzMins = Math.abs(tzOffsetMin) % 60;
            const tzString = `UTC${tzSign}${String(Math.floor(tzAbs)).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`;

            const toLocalISO = (d) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const h = String(d.getHours()).padStart(2, '0');
              const min = String(d.getMinutes()).padStart(2, '0');
              const s = String(d.getSeconds()).padStart(2, '0');
              return `${y}-${m}-${day}T${h}:${min}:${s} ${tzString}`;
            };

            // Prepare session data for backend (UTC + local time + timezone for India etc.)
            const sessionData = {
              userId: userId || 'anonymous',
              userDetails: userData || {
                gstNumber: null,
                mobile: null,
                firstName: userData?.firstName || null,
                lastName: userData?.lastName || null,
                fullName: userData?.fullName || userData?.name || 'Unknown'
              },
              sessionStart: startDate.toISOString(),
              sessionEnd: endDate.toISOString(),
              sessionStartLocal: toLocalISO(startDate),
              sessionEndLocal: toLocalISO(endDate),
              timezoneOffsetMinutes: tzOffsetMin,
              timezoneString: tzString,
              sessionDuration: sessionDuration,
              totalTimeSpent: newTotalTime,
              deviceInfo: {
                platform: Platform.OS,
                version: Platform.Version
              }
            };
            
            console.log('Sending session data to backend:', sessionData);
            
            // Send to backend
            const result = await sendSessionDataToBackend(sessionData);
            if (result) {
              console.log('Session data sent successfully to backend');
            }
            
            // Call the callback with updated session info
            if (onSessionEnd) {
              onSessionEnd({
                sessionDuration,
                todayTimeSpent: newTodayTime,
                totalTimeSpent: newTotalTime
              });
            }
          } catch (e) {
            console.error('Error handling session end:', e);
          }
        } else {
          console.log('Session duration too short, not tracking:', sessionDuration);
        }
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App comes to foreground
        console.log('App coming to foreground, starting new session');
        sessionStart.current = Date.now();
      }
      appState.current = nextAppState;
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Initialize session start time
    sessionStart.current = Date.now();
    console.log('Session tracker initialized, session start:', new Date(sessionStart.current));
    
    return () => {
      console.log('Cleaning up session tracker');
      subscription.remove();
    };
  }, [userId, onSessionEnd]);
} 