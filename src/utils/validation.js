/**
 * Input Validation Utilities
 * Prevents SQL injection, XSS, and invalid data
 */

const validation = {
    // Validate string input
    validateString: (value, fieldName, minLength = 1, maxLength = 1000) => {
        if (typeof value !== 'string') {
            throw new Error(`${fieldName} must be a string`);
        }
        
        const trimmed = value.trim();
        
        if (trimmed.length < minLength) {
            throw new Error(`${fieldName} must be at least ${minLength} characters`);
        }
        
        if (trimmed.length > maxLength) {
            throw new Error(`${fieldName} cannot exceed ${maxLength} characters`);
        }
        
        return trimmed;
    },
    
    // Validate number input
    validateNumber: (value, fieldName, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = parseInt(value, 10);
        
        if (isNaN(num)) {
            throw new Error(`${fieldName} must be a valid number`);
        }
        
        if (num < min) {
            throw new Error(`${fieldName} must be at least ${min}`);
        }
        
        if (num > max) {
            throw new Error(`${fieldName} cannot exceed ${max}`);
        }
        
        return num;
    },
    
    // Validate UUID
    validateUUID: (value, fieldName) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(value)) {
            throw new Error(`${fieldName} must be a valid UUID`);
        }
        
        return value;
    },
    
    // Validate email
    validateEmail: (value, fieldName = 'email') => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(value)) {
            throw new Error(`${fieldName} must be a valid email`);
        }
        
        return value.toLowerCase().trim();
    },
    
    // Validate pagination
    validatePagination: (limit, offset) => {
        const maxLimit = 100;
        const defaultLimit = 20;
        
        let parsedLimit = parseInt(limit, 10) || defaultLimit;
        let parsedOffset = parseInt(offset, 10) || 0;
        
        if (parsedLimit < 1) parsedLimit = defaultLimit;
        if (parsedLimit > maxLimit) parsedLimit = maxLimit;
        if (parsedOffset < 0) parsedOffset = 0;
        
        return { limit: parsedLimit, offset: parsedOffset };
    },
    
    // Validate boolean
    validateBoolean: (value) => {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === '1') return true;
        if (value === 'false' || value === '0') return false;
        return false;
    },
    
    // Validate currency amount
    validateAmount: (value, fieldName = 'amount') => {
        const num = parseFloat(value);
        
        if (isNaN(num) || num < 0) {
            throw new Error(`${fieldName} must be a positive number`);
        }
        
        if (num > 999999999) {
            throw new Error(`${fieldName} is too large`);
        }
        
        return Math.round(num * 100) / 100; // Round to 2 decimals
    }
};

module.exports = validation;
