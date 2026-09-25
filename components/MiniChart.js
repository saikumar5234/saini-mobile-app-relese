import React from 'react';
import { View, Animated, Easing } from 'react-native';
import { Svg, Polyline, Path, Defs, LinearGradient, Stop as SvgStop } from 'react-native-svg';
import * as shape from 'd3-shape';

// Chart data comes from parent via chartPrices (StockListScreen fetches bulk price-history).
// No per-product fetch - avoids duplicate requests and uses bulk endpoint only.
const MiniChart = React.memo(function MiniChart({ productId, chartPrices: chartPricesProp, width = 60, height = 32, strokeWidth = 1.5 }) {
  const [animationValue] = React.useState(() => new Animated.Value(0));
  const prices = chartPricesProp && Array.isArray(chartPricesProp) ? chartPricesProp : [];

  React.useEffect(() => {
    if (prices.length >= 2) {
      Animated.timing(animationValue, {
        toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    }
  }, [prices.length, animationValue]);

  if (prices.length < 2) {
    // Show subtle placeholder while loading - avoids empty/jumpy layout
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Svg width={width} height={height}>
          <Path d={`M0,${height/2} L${width},${height/2}`} fill="none" stroke="#888" strokeWidth={1} strokeDasharray="4,2" strokeOpacity={0.4} />
        </Svg>
      </View>
    );
  }

  // Determine trend color: green if latest price >= previous, red if latest < previous
  let chartColor = '#00C853';
  if (prices.length > 1) {
    chartColor = prices[prices.length - 1] < prices[prices.length - 2] ? '#FF3B30' : '#00C853';
  }
  const gradientId = `miniGradient-${productId ?? 'x'}`;

  let pathData = '';
  let areaPath = '';
  if (prices.length === 0) {
    // Flat line in the middle
    const y = height / 2;
    pathData = `M0,${y} L${width},${y}`;
    areaPath = `M0,${y} L${width},${y} L${width},${height} L0,${height} Z`;
  } else if (prices.length === 1) {
    // Flat line at the price value
    const minY = prices[0];
    const maxY = prices[0];
    const y = height - ((prices[0] - minY) / (maxY - minY || 1)) * height;
    pathData = `M0,${y} L${width},${y}`;
    areaPath = `M0,${y} L${width},${y} L${width},${height} L0,${height} Z`;
  } else {
    // 2 or more prices: normal chart
    const minY = Math.min(...prices);
    const maxY = Math.max(...prices);
    const rangeY = maxY - minY || 1;
    const points = prices.map((y, i) => [
      (i / (prices.length - 1)) * width,
      height - ((y - minY) / rangeY) * height
    ]);
    const lineGenerator = shape.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(shape.curveMonotoneX);
    pathData = lineGenerator(points);
    // Area path for gradient fill
    const areaPoints = [
      ...points,
      [width, height],
      [0, height],
      points[0],
    ];
    const areaGenerator = shape.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(shape.curveMonotoneX);
    areaPath = areaGenerator(areaPoints);
  }

  return (
    <Animated.View style={{ opacity: animationValue }}>
             <Svg width={width} height={height}>
                   <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <SvgStop offset="0%" stopColor={chartColor} stopOpacity={0.5} />
              <SvgStop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
        {/* Dashed line at the bottom of the mini graph */}
        <Polyline
          points={`0,${height - 1} ${width},${height - 1}`}
          fill="none"
          stroke={chartColor}
          strokeWidth={1.5}
          strokeDasharray="4,2"
        />
        {/* Area gradient fill under the line */}
        <Path
          d={areaPath}
          fill={`url(#${gradientId})`}
          stroke="none"
        />
        {/* Line on top */}
        <Path
          d={pathData}
          fill="none"
          stroke={chartColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
});

export default MiniChart;