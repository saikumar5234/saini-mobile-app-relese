# App Icon Requirements & Setup Guide

## Icon Specifications

For your app icon to display correctly on all devices (circular, square, rounded square), you need to follow these specifications:

### Main App Icon (app_icon.png)
- **Size**: 1024x1024 pixels
- **Format**: PNG with transparency support
- **Content**: Your logo should be centered
- **Safe Area**: Keep important content within the center 80% of the image
  - For circular icons: Center 66% is safe
  - For square icons: Center 80% is safe
  - For rounded square: Center 75% is safe

### Your Logo Design
Based on your logo description:
- **Center**: Globe/grid sphere with "SAINI" text
- **Top Arc**: "SYMBOL OF TRUST"
- **Bottom Arc**: "NUTS & DRY FRUITS"
- **Background**: White
- **Trademark**: ® symbol in upper right

## Important: Safe Area Guidelines

### For Circular Icons (Android)
- Keep all important content within a **circle of 66% diameter** centered in the 1024x1024 image
- The outer 17% on each side may be cropped
- Ensure "SAINI" text and globe are well within the safe area

### For Square Icons (iOS & some Android)
- Keep all important content within **80% of the image** (centered)
- The outer 10% on each side may be cropped
- All text should be readable within this area

### For Rounded Square (Modern Android)
- Keep content within **75% of the image** (centered)
- Corners will be rounded automatically

## Current Configuration

Your `app.json` is now configured with:
- ✅ Main icon: `./assets/app_icon.png`
- ✅ Android adaptive icon with white background
- ✅ iOS icon support
- ✅ Notification icon
- ✅ Web favicon

## Recommendations for Your Icon File

1. **Create/Update app_icon.png**:
   - Size: 1024x1024 pixels
   - Format: PNG
   - Background: White (#FFFFFF)
   - Content: Your logo centered with proper padding

2. **Safe Area Design**:
   ```
   ┌─────────────────────────┐
   │                         │ ← 10% padding (may be cropped)
   │  ┌───────────────────┐  │
   │  │                   │  │ ← Safe area (80% of image)
   │  │   YOUR LOGO HERE   │  │
   │  │   (centered)       │  │
   │  │                   │  │
   │  └───────────────────┘  │
   │                         │
   └─────────────────────────┘
   ```

3. **For Circular Icons** (Android):
   - Keep "SAINI" text and globe in center 66%
   - Arc text ("SYMBOL OF TRUST", "NUTS & DRY FRUITS") may be partially visible
   - Consider making arc text larger or repositioning if needed

## Testing Your Icon

After updating your icon file:

1. **Build the app**:
   ```bash
   eas build --profile preview --platform android
   ```

2. **Test on different devices**:
   - Devices with circular icons (Samsung, etc.)
   - Devices with square icons (Pixel, etc.)
   - Devices with rounded square icons

3. **Check**:
   - Icon displays correctly
   - No important content is cropped
   - Background color matches
   - Icon is clear and readable

## Icon File Checklist

- [ ] app_icon.png is 1024x1024 pixels
- [ ] Logo is centered in the image
- [ ] Important content is within safe area (center 66-80%)
- [ ] Background is white (#FFFFFF)
- [ ] File format is PNG
- [ ] No important elements near edges
- [ ] Text is readable at small sizes

## Quick Fixes

If your icon is being cropped:

1. **Move content inward**: Ensure "SAINI" and globe are more centered
2. **Increase padding**: Add more white space around the logo
3. **Simplify design**: Consider if arc text needs to be visible or can be simplified
4. **Test different sizes**: Create versions with different safe areas

## Current Status

✅ **Configuration is correct** - Your app.json is properly set up
⚠️ **Icon file needs verification** - Ensure app_icon.png follows the specifications above

The app will automatically:
- Use the icon for iOS (square)
- Use adaptive icon for Android (circular/square based on device)
- Apply white background for Android adaptive icon
- Display correctly on all device types
