import React from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { Entypo, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';

export default function SearchBar({ searchQuery, onSearchChange, t, autoFocus }) {
  const { colors } = useTheme();
  
  const handleClear = () => {
    onSearchChange('');
  };
  
  return (
    <View style={[styles.searchBarContainer, { backgroundColor: colors.background }]}>
      <View style={[
        styles.searchBarRow, 
        { 
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border
        }
      ]}>
        <Entypo name="magnifying-glass" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchBarInput, { color: colors.text }]}
          placeholder={t?.searchProduct ?? t?.search ?? 'Search any product'}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            style={styles.clearButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = {
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 7,
    marginBottom: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
}; 