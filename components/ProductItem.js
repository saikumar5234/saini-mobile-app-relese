import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MiniChart from './MiniChart';
import { getProductName } from '../utils/translations';
import { useTheme } from '../utils/ThemeContext';

const ProductItem = React.memo(function ProductItem({ 
  item, 
  chartPrices,
  selectedLanguage, 
  t, 
  onProductPress 
}) {
  const { colors } = useTheme();
  const change = item.change != null ? Number(item.change) : 0;
  const productName = getProductName(item.name, selectedLanguage, t);

  // Get product description for current language
  const getProductDescription = (description, lang) => {
    if (!description) return '';
    if (typeof description === 'string') return description;
    return description[lang] || description.en || description.te || description.hi || '';
  };
  const productDescription = getProductDescription(item.description, selectedLanguage);
  
  // Check for disabled state - backend uses "disabled" field as boolean
  // Also check for other possible field names for compatibility
  const checkField = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value === false;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'disabled' || lower === 'false' || lower === 'inactive' || lower === 'unavailable';
    }
    return false;
  };
  
  // Primary check: backend uses "disabled" field as boolean (true = disabled)
  const isDisabled = 
    item.disabled === true ||  // Backend field: disabled: true means out of stock
    checkField(item.state) ||
    checkField(item.status) ||
    checkField(item.enabled) ||
    checkField(item.isEnabled) ||
    checkField(item.active) ||
    checkField(item.isActive) ||
    checkField(item.available) ||
    checkField(item.inStock) ||
    checkField(item.productState) ||
    checkField(item.productStatus);
  
  // Debug logging to help identify the field name used by backend
  if (__DEV__ && item.id && item.disabled === true) {
    console.log(`🔴 Product ${item.id} (${productName}) is DISABLED - showing as Out of Stock`, {
      disabled: item.disabled,
      isDisabled: isDisabled
    });
  }

  return (
    <>
      <TouchableOpacity 
        style={[
          styles.stockRow,
          isDisabled && styles.stockRowDisabled
        ]}
        onPress={() => onProductPress(item)}
        activeOpacity={0.7}
        disabled={false}
      >
        <View style={styles.stockInfo}>
          <Text style={[
            styles.symbol, 
            { color: isDisabled ? colors.textSecondary : colors.text }
          ]}>
            {productName}
          </Text>
          {productDescription ? (
            <Text 
              style={[styles.company, { color: colors.textSecondary }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {productDescription}
            </Text>
          ) : null}
        </View>
        <View style={styles.miniChartBox}>
          {!isDisabled && <MiniChart productId={item.id} chartPrices={chartPrices} />}
        </View>
        <View style={styles.priceInfo}>
          {isDisabled ? (
            <View style={[styles.outOfStockBox, { backgroundColor: colors.error }]}>
              <Text style={styles.outOfStockText}>{t.outOfStock}</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.price, { color: colors.text }]}>
                {item.price !== null && item.price !== undefined 
                  ? `₹${parseFloat(item.price).toFixed(2)}` 
                  : 'N/A'}
              </Text>
              <View style={[styles.changeBox, { 
                backgroundColor: change > 0 ? colors.success : change < 0 ? colors.error : (colors.border || colors.textSecondary) 
              }]}> 
                <Text style={styles.change}>
                  {change > 0 ? `+${change}` : change < 0 ? `${change}` : '0'}
                </Text>
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.price === nextProps.item.price &&
    prevProps.item.change === nextProps.item.change &&
    prevProps.item.disabled === nextProps.item.disabled &&
    prevProps.selectedLanguage === nextProps.selectedLanguage &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.chartPrices === nextProps.chartPrices
  );
});

export default ProductItem;

const styles = {
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  divider: {
    height: 1,
    marginLeft: 20,
    marginRight: 0,
  },
  stockInfo: {
    flex: 2,
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  company: {
    fontSize: 13,
    marginTop: 0,
  },
  miniChartBox: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    marginHorizontal: 8,
  },
  priceInfo: {
    alignItems: 'flex-end',
    flex: 1.2,
    justifyContent: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  changeBox: {
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
    minWidth: 65,
    minHeight: 26,
    alignItems: 'center',
  },
  change: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  stockRowDisabled: {
    opacity: 0.6,
  },
  outOfStockBox: {
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
    minWidth: 65,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
}; 