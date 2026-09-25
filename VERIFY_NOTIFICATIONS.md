# How to Verify Push Notifications Are Working

## Quick Verification Steps

### Step 1: Check if Push Token is Registered

**On Mobile App:**
1. Open the app and log in
2. Check console logs for:
   ```
   📱 Expo Push Token obtained: ExponentPushToken[xxxxxxxxxxxxxx]
   ✅ Push token registered with backend successfully
   ```

**On Backend:**
Check your database:
```sql
SELECT * FROM push_tokens WHERE active = true;
```

If you see push tokens, **Step 1 is working!** ✅

---

### Step 2: Verify Backend Sends Notifications

**Test by creating/updating a product in your backend:**

1. **Create a new product** in your backend
   - Backend should automatically send push notification
   - Check backend logs for notification sending

2. **Update a product price** in your backend
   - Backend should automatically send push notification
   - Check backend logs for notification sending

**Expected Backend Logs:**
```
Sending push notification to: ExponentPushToken[xxx]
Push notification sent successfully
```

**If you see these logs, your backend IS sending notifications!** ✅

---

### Step 3: Verify Notifications Arrive on Device

**Test Scenarios:**

#### Test A: App is Open (Foreground)
1. Open the app
2. Create/update product in backend
3. **Expected**: Notification appears immediately in the app

#### Test B: App is in Background
1. Open the app, then press Home button
2. Create/update product in backend
3. **Expected**: Notification appears in notification tray

#### Test C: App is Closed ⭐ (Most Important!)
1. **Close the app completely** (swipe away from recent apps)
2. Create/update product in backend
3. **Expected**: Notification appears in notification tray
4. **If this works, everything is configured correctly!** ✅

---

## Troubleshooting

### ❌ No Push Token in Database

**Problem**: Push token not being registered

**Check:**
1. Is user logged in? (Token only registers after login)
2. Check mobile app console for errors
3. Check backend `/api/register-push-token` endpoint logs
4. Verify authentication token is valid

**Solution:**
- Check network connectivity
- Verify backend endpoint is accessible
- Check authentication token

---

### ❌ Backend Not Sending Notifications

**Problem**: Backend not calling push notification code

**Check:**
1. Is your backend code calling `PushNotificationHelper` when products are created/updated?
2. Check backend logs for errors
3. Verify push notification code is integrated in product creation/update flow

**Solution:**
- Ensure backend calls notification helper when creating/updating products
- Check for exceptions in backend logs
- Verify Expo Push API is reachable from backend

---

### ❌ Notifications Not Arriving

**Problem**: Backend sends but device doesn't receive

**Check:**
1. Verify push token format is correct: `ExponentPushToken[xxx]`
2. Check Expo Push API response - does it return success?
3. Verify device has notifications enabled for the app
4. Check if device is physical (emulators may have limitations)

**Solution:**
- Check Expo Push API response in backend logs
- Verify app has notification permissions
- Test on a physical device
- Check Expo Push service status

---

## Quick Test Script

### Test Push Notification Manually (Backend)

You can test if your backend can send notifications by calling your notification helper directly:

```java
// In a test controller or service
@GetMapping("/test-push")
public ResponseEntity<?> testPush(@RequestParam String pushToken) {
    try {
        JSONObject data = new JSONObject();
        data.put("type", "test");
        
        String response = PushNotificationHelper.sendPushNotification(
            pushToken,
            "Test Notification",
            "This is a test notification from backend",
            data
        );
        
        return ResponseEntity.ok("Notification sent: " + response);
    } catch (Exception e) {
        return ResponseEntity.status(500)
            .body("Error: " + e.getMessage());
    }
}
```

**Usage:**
```
GET /api/test-push?pushToken=ExponentPushToken[YOUR_TOKEN]
```

---

## Status Check Checklist

- [ ] Push tokens appear in database after user logs in
- [ ] Backend logs show notification sending when products are created
- [ ] Backend logs show notification sending when prices are updated
- [ ] Expo Push API returns success (check backend logs)
- [ ] Notifications arrive when app is open
- [ ] Notifications arrive when app is in background
- [ ] Notifications arrive when app is closed ⭐

**If all checked: Notifications are working!** ✅

---

## What the Mobile App Does

✅ Registers push token with backend
✅ Receives push notifications from backend
✅ Handles notification taps
✅ Navigates to product detail when notification is tapped

## What the Backend Must Do

✅ Store push tokens when registered
✅ Send push notifications when products are created
✅ Send push notifications when prices are updated
✅ Handle errors gracefully

---

## Still Not Working?

1. **Check backend code** - Is it actually calling the notification helper?
2. **Check backend logs** - Are there any errors?
3. **Check Expo Push API** - Does backend get success response?
4. **Check device** - Are notifications enabled for the app?
5. **Test manually** - Use the test endpoint above

---

## Expected Flow (Working Correctly)

```
1. User opens app → Push token registered → Saved to backend DB ✅
2. Backend creates product → Calls PushNotificationHelper → Expo Push API ✅
3. Expo Push API → Sends to device ✅
4. Device receives notification → Shows in notification tray ✅
5. User taps notification → App opens → Navigates to product ✅
```

If all steps work, **notifications are sending correctly!** 🎉
