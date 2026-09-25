/**
 * GST Validation Utility
 * Validates GSTIN (GST Identification Number) according to Indian GST format
 * 
 * Format: 15 characters
 * - First 2 characters: State code (00-37) - 2 digits
 * - Next 10 characters: PAN number - 5 uppercase letters + 4 digits + 1 uppercase letter
 * - 13th character: Entity number (1-9 or A-Z) - 1 alphanumeric
 * - 14th character: Always 'Z' - 1 letter
 * - 15th character: Check digit (0-9 or A-Z) - 1 alphanumeric
 * 
 * Pattern: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
 */

/**
 * Validates GST number according to exact GSTIN pattern
 * @param {string} gstNumber - The GST number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidGST = (gstNumber) => {
  if (!gstNumber || typeof gstNumber !== 'string') {
    return false;
  }

  // Trim and convert to uppercase
  const trimmedGst = gstNumber.trim().toUpperCase();

  // Check length
  if (trimmedGst.length !== 15) {
    return false;
  }

  // Exact GST pattern: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
  const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  if (!gstPattern.test(trimmedGst)) {
    return false;
  }

  // Additional validation: State code should be between 00-37
  const stateCode = parseInt(trimmedGst.substring(0, 2), 10);
  if (isNaN(stateCode) || stateCode < 0 || stateCode > 37) {
    return false;
  }

  return true;
};

/**
 * Validates GST number and returns error message if invalid
 * @param {string} gstNumber - The GST number to validate
 * @returns {object} - { isValid: boolean, error: string }
 */
export const validateGST = (gstNumber) => {
  if (!gstNumber || typeof gstNumber !== 'string') {
    return { isValid: false, error: 'GST number is required' };
  }

  const trimmedGst = gstNumber.trim().toUpperCase();

  if (trimmedGst.length === 0) {
    return { isValid: true, error: null }; // Optional field, empty is valid
  }

  if (trimmedGst.length !== 15) {
    return { isValid: false, error: 'GST number must be exactly 15 characters' };
  }

  // Check if it matches the exact pattern
  const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  if (!gstPattern.test(trimmedGst)) {
    return { 
      isValid: false, 
      error: 'Invalid GST format. GST number should follow the pattern: 2 digits (state code) + (PAN Number)5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric' 
    };
  }

  // Validate state code (00-37)
  const stateCode = parseInt(trimmedGst.substring(0, 2), 10);
  if (isNaN(stateCode) || stateCode < 0 || stateCode > 37) {
    return { isValid: false, error: 'Invalid state code in GST number. State code must be between 00-37' };
  }

  // Validate 14th character is 'Z'
  if (trimmedGst.charAt(13) !== 'Z') {
    return { isValid: false, error: 'Invalid GST format. 14th character must be Z' };
  }

  return { isValid: true, error: null };
};

/**
 * Formats GST number (uppercase and removes spaces)
 * @param {string} gstNumber - The GST number to format
 * @returns {string} - Formatted GST number
 */
export const formatGST = (gstNumber) => {
  if (!gstNumber || typeof gstNumber !== 'string') {
    return '';
  }
  return gstNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

