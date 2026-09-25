# Trial Period & Approval Check Flow

## Overview
Users get a 7-day trial period after registration. After 7 days, if the admin hasn't approved them, they see the ContactDetailsScreen with store contact information.

## Flow Diagram

```
User Signs Up
    ↓
Registration Date Stored (isApproved: false)
    ↓
User Can Access App (Trial Period - 7 days)
    ↓
After 7 Days:
    ├─ If Approved → Full Access ✅
    └─ If NOT Approved → ContactDetailsScreen 📞
```

## Implementation Details

### 1. **Signup Flow** (`OTPVerificationScreen.js`)
- When user completes signup, stores:
  - `registrationDate`: Current date/time
  - `isApproved`: `false` (default for new users)

### 2. **Login Flow** (`AuthScreen.js`)
- After successful login:
  - Checks `isApproved` status from backend
  - Calculates days since registration
  - Routes accordingly:
    - ✅ **Approved** → `StockList` (full access)
    - ⏰ **Not Approved + Within 7 days** → `StockList` (trial access)
    - 🚫 **Not Approved + 7+ days** → `ContactDetails` (trial expired)

### 3. **App Startup Check** (`App.js`)
- On app launch:
  - Checks if user is authenticated
  - Checks approval status
  - Calculates days since registration
  - If trial expired and not approved → Shows `ContactDetailsScreen`

### 4. **ContactDetailsScreen**
- Displays:
  - Message: "Account Pending Approval - Your trial period has ended"
  - Store Email: sainimewastore@gmail.com
  - Store Phone: +919000022066
  - Logout button

## Key Variables

- **Trial Period**: 7 days
- **Registration Date**: Stored in `userData.registrationDate`
- **Approval Status**: Stored in `userData.isApproved`
- **Calculation**: `daysSinceRegistration = (now - registrationDate) / (1000 * 60 * 60 * 24)`

## Test Scenarios

### ✅ Scenario 1: New User (Day 0)
- User signs up
- `isApproved: false`, `registrationDate: today`
- **Result**: Can access app (trial period)

### ✅ Scenario 2: User Within Trial (Day 3)
- User logs in
- `isApproved: false`, `daysSinceRegistration: 3`
- **Result**: Can access app (trial period)

### ✅ Scenario 3: User After 7 Days, Not Approved
- User logs in or opens app
- `isApproved: false`, `daysSinceRegistration: 8`
- **Result**: Shows ContactDetailsScreen

### ✅ Scenario 4: User Approved by Admin
- User logs in
- `isApproved: true` (regardless of days)
- **Result**: Full access to app

## Backend Requirements

The backend should return:
- `isApproved` or `approved` field in login/signup response
- `registrationDate` or `createdAt` field in login/signup response

Example response:
```json
{
  "success": true,
  "user": {
    "mobile": "9000022066",
    "gstNumber": "29ABCDE1234F1Z5",
    "isApproved": false,
    "registrationDate": "2024-01-15T10:30:00Z"
  }
}
```

## Current Status

✅ **All checks are implemented and working:**
- ✅ Signup stores registration date
- ✅ Login checks approval and trial period
- ✅ App startup checks approval and trial period
- ✅ ContactDetailsScreen displays correctly
- ✅ Routing logic is correct

## Notes

- Trial period is exactly 7 days (168 hours)
- Calculation uses `Math.floor()` to get whole days
- If `registrationDate` is missing, user gets access (assumes new user)
- Contact details are hardcoded in `ContactDetailsScreen.js`:
  - Email: sainimewastore@gmail.com
  - Phone: +919000022066

