# Backend OTP Verification Debug Guide

## Problem
OTP verification fails with "OTP not found or expired" when using GST number, even though OTP is successfully delivered.

**Example Error:**
```
Looking for key: forgot_password_G_999999999999999
Available keys: [forgot_password_M_6309790780]
```

This shows the backend stored OTP with Mobile key, but verification is looking for GST key.

## Root Cause Analysis

The issue is likely in the `buildOtpKey()` function. The key used to **store** the OTP must **exactly match** the key used to **retrieve** it during verification.

## Critical Checks for Backend Code

### 1. Check `buildOtpKey()` Function

The `buildOtpKey()` function must:
- Handle **null/empty** values consistently
- Use the **same format** for both `request-otp` and `verify-otp`
- **Trim and normalize** values the same way

**Example of what it should look like:**

```java
private String buildOtpKey(String mobile, String gstNumber, String type) {
    // Normalize mobile - trim and handle null
    String normalizedMobile = (mobile != null && !mobile.trim().isEmpty()) 
        ? mobile.trim() 
        : "";
    
    // Normalize GST - trim, uppercase, and handle null
    String normalizedGst = (gstNumber != null && !gstNumber.trim().isEmpty()) 
        ? gstNumber.trim().toUpperCase() 
        : "";
    
    // Build key consistently - use same separator and order
    // Option 1: Include both even if empty
    return String.format("otp:%s:%s:%s", normalizedMobile, normalizedGst, type);
    
    // Option 2: Only include non-empty values
    // StringBuilder key = new StringBuilder("otp:");
    // if (!normalizedMobile.isEmpty()) {
    //     key.append("mobile:").append(normalizedMobile);
    // }
    // if (!normalizedGst.isEmpty()) {
    //     if (key.length() > 4) key.append(":");
    //     key.append("gst:").append(normalizedGst);
    // }
    // key.append(":type:").append(type);
    // return key.toString();
}
```

### 2. Verify Both Endpoints Use Same Function

**In `/request-otp` endpoint:**
```java
String key = buildOtpKey(mobile, gstNumber, type);
otpStore.put(key, generatedOtp);
otpExpiry.put(key, expiryTime);
System.out.println("STORED OTP KEY: " + key);
```

**In `/verify-otp` endpoint:**
```java
String key = buildOtpKey(mobile, gstNumber, type);
System.out.println("LOOKING FOR OTP KEY: " + key);
String storedOtp = otpStore.get(key);
```

### 3. Check Request Body Parsing

Ensure both endpoints parse the request body the same way:

```java
// In request-otp
String mobile = request.get("mobile");
String gstNumber = request.get("gstNumber");
String type = Optional.ofNullable(request.get("type")).orElse("signup");

// Normalize immediately
mobile = (mobile != null) ? mobile.trim() : null;
gstNumber = (gstNumber != null) ? gstNumber.trim().toUpperCase() : null;
```

**Do the same normalization in verify-otp!**

### 4. Add Debug Logging

Add these logs to both endpoints:

```java
// In request-otp
System.out.println("========== REQUEST OTP ==========");
System.out.println("Raw Mobile: " + request.get("mobile"));
System.out.println("Raw GST: " + request.get("gstNumber"));
System.out.println("Normalized Mobile: " + mobile);
System.out.println("Normalized GST: " + gstNumber);
System.out.println("Type: " + type);
String key = buildOtpKey(mobile, gstNumber, type);
System.out.println("STORED KEY: [" + key + "]");
System.out.println("OTP: " + generatedOtp);
System.out.println("=================================");

// In verify-otp
System.out.println("========== VERIFY OTP ==========");
System.out.println("Raw Mobile: " + request.get("mobile"));
System.out.println("Raw GST: " + request.get("gstNumber"));
System.out.println("Normalized Mobile: " + mobile);
System.out.println("Normalized GST: " + gstNumber);
System.out.println("Type: " + type);
String key = buildOtpKey(mobile, gstNumber, type);
System.out.println("LOOKING FOR KEY: [" + key + "]");
System.out.println("Available Keys: " + otpStore.keySet());
System.out.println("=================================");
```

### 5. Common Issues to Check

1. **Case Sensitivity**: GST number must be uppercase in both places
2. **Whitespace**: Mobile and GST must be trimmed in both places
3. **Null Handling**: If mobile is null when using GST, handle it the same way
4. **Key Format**: The key format must be identical (same separators, same order)
5. **Type Parameter**: Ensure type is normalized (lowercase/uppercase) consistently

### 6. Test Case

When testing, check the console logs:

**Request OTP:**
```
STORED KEY: [otp:9000022066:29ABCDE1234F1Z5:signup]
```

**Verify OTP:**
```
LOOKING FOR KEY: [otp:9000022066:29ABCDE1234F1Z5:signup]
```

These must be **exactly the same**!

## Frontend Changes Made

The frontend now:
- ✅ Trims and uppercases GST number consistently
- ✅ Trims mobile number consistently
- ✅ Only sends fields that have values
- ✅ Logs the request body for debugging

## CRITICAL FIX NEEDED

Based on the error logs, your backend's `/request-otp` endpoint is likely:
1. Looking up the user from the database
2. Using the user's mobile number from the database to build the key
3. Instead of using what was sent in the request

### Fix for `/request-otp` Endpoint

**DO NOT** look up the user and use their database values. Use **exactly** what's in the request:

```java
@PostMapping("/request-otp")
public ResponseEntity<Map<String, Object>> requestOtp(@RequestBody Map<String, String> request) {
    // Get values from request
    String mobile = request.get("mobile");
    String gstNumber = request.get("gstNumber");
    String type = Optional.ofNullable(request.get("type")).orElse("signup");
    
    // Normalize immediately (same as verify-otp)
    mobile = (mobile != null && !mobile.trim().isEmpty()) ? mobile.trim() : null;
    gstNumber = (gstNumber != null && !gstNumber.trim().isEmpty()) 
        ? gstNumber.trim().toUpperCase() 
        : null;
    
    // DO NOT look up user and use their mobile/GST from database
    // Use EXACTLY what was sent in the request
    
    // Build key using request values (not database values)
    String key = buildOtpKey(mobile, gstNumber, type);
    
    System.out.println("========== REQUEST OTP ==========");
    System.out.println("Request Mobile: " + mobile);
    System.out.println("Request GST: " + gstNumber);
    System.out.println("STORED KEY: [" + key + "]");
    System.out.println("=================================");
    
    // Generate and store OTP
    String otp = generateOtp();
    otpStore.put(key, otp);
    otpExpiry.put(key, System.currentTimeMillis() + 600000); // 10 minutes
    
    // Send OTP via SMS/Email
    // ...
}
```

### Fix for `buildOtpKey()` Function

Ensure it uses the values passed to it, not database values:

```java
private String buildOtpKey(String mobile, String gstNumber, String type) {
    // Normalize
    String normalizedMobile = (mobile != null && !mobile.trim().isEmpty()) 
        ? mobile.trim() 
        : "";
    String normalizedGst = (gstNumber != null && !gstNumber.trim().isEmpty()) 
        ? gstNumber.trim().toUpperCase() 
        : "";
    
    // Build key - prioritize mobile if both exist (or use what's provided)
    if (!normalizedMobile.isEmpty()) {
        return type + "_M_" + normalizedMobile;
    } else if (!normalizedGst.isEmpty()) {
        return type + "_G_" + normalizedGst;
    } else {
        throw new IllegalArgumentException("Either mobile or GST must be provided");
    }
}
```

## Next Steps

1. ✅ **Frontend is fixed** - Now sends only the identifier used to find user
2. ⚠️ **Backend needs fix** - Ensure `/request-otp` uses request values, not database values
3. Add the debug logging to both endpoints
4. Compare the keys in the console logs - they must match exactly
5. Ensure normalization happens the same way in both endpoints

