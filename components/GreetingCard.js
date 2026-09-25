import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Image, Dimensions } from 'react-native';
import { Animated, Easing, PanResponder } from 'react-native';
import { Svg, Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Circle } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');

export default function GreetingCard({ 
  greeting, 
  greetingAnim, 
  sheetAnim, 
  isSheetExpanded, 
  setIsSheetExpanded, 
  sheetHeightCollapsed, 
  sheetHeightExpanded, 
  galleryVisible, 
  setGalleryVisible, 
  galleryImages, 
  t 
}) {
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        let newValue = isSheetExpanded
          ? 1 - gestureState.dy / (sheetHeightExpanded - sheetHeightCollapsed)
          : -gestureState.dy / (sheetHeightExpanded - sheetHeightCollapsed);
        newValue = Math.max(0, Math.min(1, newValue));
        sheetAnim.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldExpand = gestureState.dy < -40 || (isSheetExpanded && gestureState.dy < 40);
        Animated.spring(sheetAnim, {
          toValue: shouldExpand ? 1 : 0,
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }).start(() => setIsSheetExpanded(shouldExpand));
      },
    })
  ).current;

  React.useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: isSheetExpanded ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 40,
    }).start();
  }, [isSheetExpanded]);

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeightExpanded - sheetHeightCollapsed - 40, 0],
    extrapolate: 'clamp',
  });

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetHeightExpanded,
          transform: [{ translateY: sheetTranslateY }],
          backgroundColor: 'transparent',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 12,
        }}
      >
        {/* Drag handle and collapsed card content */}
        {greeting && (
          <View style={{
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingVertical: 20,
            marginBottom: 100,
            borderBottomWidth: 1,
            borderBottomColor: '#333',
          }}>
            <View style={{ 
              width: 50, 
              height: 6, 
              borderRadius: 3, 
              backgroundColor: '#444', 
              marginBottom: 12 
            }} />
            <TouchableOpacity 
              onPress={() => setGalleryVisible(true)}
              style={{
                backgroundColor: '#2a2a2a',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#444',
              }}
            >
              <Text style={{
                color: '#FFD700',
                fontWeight: '600',
                fontSize: 16,
                textAlign: 'center',
                letterSpacing: 0.5,
              }}>
                {t.newGreeting}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Greeting content (only visible when expanded) */}
        <Animated.View style={{
          opacity: sheetAnim,
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 20,
        }}>
          <Animated.View
            style={{
              width: '100%',
              maxWidth: screenWidth - 40,
              borderRadius: 20,
              padding: 0,
              marginBottom: 16,
              opacity: sheetAnim,
              backgroundColor: 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 20,
              elevation: 20,
              transform: [{
                scale: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] })
              }],
            }}
          >
            {/* Modern gradient background */}
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: 20,
                opacity: 0.98,
                overflow: 'hidden',
              }}
            >
              <Svg height="100%" width="100%">
                <Defs>
                  <SvgLinearGradient id="modernGradient" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor="#1e1e1e" stopOpacity="1" />
                    <Stop offset="50%" stopColor="#2a2a2a" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#1a1a1a" stopOpacity="1" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" rx="20" fill="url(#modernGradient)" />
              </Svg>
            </Animated.View>

            {greeting ? (
              (greeting.imageUrl || greeting.image || greeting.photo) ? (
                <View style={{ width: '100%', padding: 24 }}>
                  {/* Image with modern styling */}
                  <Animated.Image
                    source={{ uri: greeting.imageUrl || greeting.image || greeting.photo }}
                    style={{
                      width: '100%',
                      height: 200,
                      borderRadius: 16,
                      marginBottom: 24,
                      borderWidth: 2,
                      borderColor: '#FFD700',
                      opacity: greetingAnim,
                      shadowColor: '#FFD700',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.3,
                      shadowRadius: 16,
                      elevation: 12,
                      transform: [{
                        scale: greetingAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.95, 1],
                        })
                      }]
                    }}
                    resizeMode="cover"
                  />
                  
                  {/* Text with modern typography */}
                  <View style={{
                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    borderRadius: 12,
                    padding: 16,
                    borderLeftWidth: 4,
                    borderLeftColor: '#FFD700',
                  }}>
                    <Text style={{
                      color: '#FFD700',
                      fontWeight: '600',
                      fontSize: 18,
                      textAlign: 'center',
                      lineHeight: 26,
                      letterSpacing: 0.3,
                    }}>
                      {greeting.greeting || greeting.message || greeting.text || greeting.title || greeting.content}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ width: '100%', padding: 32 }}>
                  {/* Text-only with enhanced styling */}
                  <View style={{
                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    borderRadius: 16,
                    padding: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 215, 0, 0.3)',
                    alignItems: 'center',
                  }}>
                    <View style={{
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      backgroundColor: 'rgba(255, 215, 0, 0.2)',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 20,
                    }}>
                      <Text style={{
                        color: '#FFD700',
                        fontSize: 24,
                        fontWeight: 'bold',
                      }}>
                        ✨
                      </Text>
                    </View>
                    <Text style={{
                      color: '#FFD700',
                      fontWeight: '600',
                      fontSize: 20,
                      textAlign: 'center',
                      lineHeight: 28,
                      letterSpacing: 0.3,
                    }}>
                      {greeting.greeting || greeting.message || greeting.text || greeting.title || greeting.content}
                    </Text>
                  </View>
                </View>
              )
            ) : (
              <View style={{ 
                width: '100%', 
                padding: 32,
                alignItems: 'center',
              }}>
                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 20,
                }}>
                  <Text style={{
                    color: '#fff',
                    fontSize: 32,
                  }}>
                    📝
                  </Text>
                </View>
                <Text style={{ 
                  color: '#fff', 
                  fontWeight: '500', 
                  fontSize: 16, 
                  textAlign: 'center',
                  opacity: 0.7,
                }}>
                  {t.noGreeting}
                </Text>
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Enhanced Modal for product image gallery */}
      <Modal
        visible={galleryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryVisible(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.9)', 
          justifyContent: 'center', 
          alignItems: 'center' 
        }}>
          <TouchableOpacity 
            onPress={() => setGalleryVisible(false)} 
            style={{ 
              position: 'absolute', 
              top: 50, 
              right: 30, 
              zIndex: 2,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.2)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>×</Text>
          </TouchableOpacity>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ 
              alignItems: 'center', 
              paddingHorizontal: 20,
              paddingVertical: 40,
            }}
          >
            {galleryImages.map((img, idx) => (
              <View key={idx} style={{
                marginHorizontal: 10,
                borderRadius: 20,
                shadowColor: '#FFD700',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
                elevation: 12,
              }}>
                <Image
                  source={{ uri: img }}
                  style={{ 
                    width: 280, 
                    height: 360, 
                    borderRadius: 20, 
                    borderWidth: 3, 
                    borderColor: '#FFD700' 
                  }}
                  resizeMode="cover"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const StyleSheet = {
  absoluteFillObject: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
}; 