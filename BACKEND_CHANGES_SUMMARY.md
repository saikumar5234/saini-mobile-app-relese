# Backend Changes Summary - GST Number Integration

## Overview
The signup form now accepts GST number instead of email. All backend endpoints have been updated to work with GST numbers.

## Changes Made

### 1. User Model (`User.java`)
- **Removed**: `email` field
- **Added**: `gstNumber` field (unique, nullable: false, length: 15)
- GST number is now the primary identifier alongside mobile number

### 2. UserRepository (`UserRepository.java`)
- **Added**: `findByGstNumber(String gstNumber)` method
- Removed email-related queries

### 3. SignupRequest DTO (`SignupRequest.java`)
- **Removed**: `email` field
- **Added**: `gstNumber` field

### 4. LoginRequest DTO (`LoginRequest.java`)
- **Removed**: `email` field
- **Added**: `gstNumber` field

### 5. AuthController (`AuthController.java`)

#### Signup Endpoint (`/api/signup`)
- Validates GST number format (15 alphanumeric characters)
- Checks for duplicate GST numbers
- Returns proper error messages for validation failures
- Returns success message: "User registered successfully. Please login to continue."

#### Login Endpoint (`/api/login`)
- Accepts either mobile number OR GST number
- Updated to use GST number instead of email

#### Check User Exists Endpoint (`/api/check-user-exists`)
- Accepts `gstNumber` or `mobile` in request body
- Returns user data with GST number

#### Reset Password Endpoint (`/api/reset-password`)
- Accepts `gstNumber` or `mobile` in request body
- Updated to find user by GST number

#### Verify OTP Endpoint (`/api/verify-otp`) - NEW
- Accepts `gstNumber` or `mobile` and `otp` in request body
- Verifies OTP and updates user status to APPROVED
- Returns user data with GST number

## Database Migration Required

You'll need to run a database migration to:
1. Add `gst_number` column to `users` table (VARCHAR(15), UNIQUE, NOT NULL)
2. Remove `email` column from `users` table (or make it nullable if you want to keep it for existing data)
3. Update `user_session_summary` table to replace `user_email` with `user_gst_number` if applicable

## Frontend Changes

### AuthScreen.js
- Signup form now uses GST number instead of email
- Shows success message on successful signup
- Redirects to login screen after successful signup
- Better error handling with validation messages
- Login accepts mobile number or GST number

### ForgotPasswordScreen.js
- Updated to accept mobile number or GST number
- Updated placeholder text and messages

## Testing Checklist

- [ ] Signup with valid GST number
- [ ] Signup with duplicate GST number (should show error)
- [ ] Signup with invalid GST format (should show error)
- [ ] Login with mobile number
- [ ] Login with GST number
- [ ] Forgot password with mobile number
- [ ] Forgot password with GST number
- [ ] OTP verification with GST number

## Notes

- GST numbers are stored in uppercase
- GST validation pattern: `^[0-9A-Z]{15}$`
- Mobile number validation: exactly 10 digits
- All GST numbers are automatically converted to uppercase before storage

