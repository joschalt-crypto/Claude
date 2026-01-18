/**
 * Authentication utilities
 * Secure implementation following security best practices
 */

const mysql = require('mysql');
const crypto = require('crypto');

// FIX 1: Use environment variables for sensitive configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// FIX 2: API key from environment variable
const API_KEY = process.env.API_KEY;

// FIX 3: Use secure password hashing with salt (PBKDF2)
// In production, consider using bcrypt or argon2
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
}

// FIX 4: Use parameterized queries to prevent SQL injection
function getUserByUsername(username) {
  const connection = mysql.createConnection(DB_CONFIG);
  // Parameterized query - safe from SQL injection
  const query = 'SELECT * FROM users WHERE username = ?';

  return new Promise((resolve, reject) => {
    connection.query(query, [username], (error, results) => {
      connection.end();
      if (error) reject(error);
      resolve(results);
    });
  });
}

// FIX 5: Use parameterized queries for authentication
function authenticateUser(username, password) {
  const connection = mysql.createConnection(DB_CONFIG);
  // Parameterized query with placeholders
  const query = 'SELECT * FROM users WHERE username = ?';

  return new Promise((resolve, reject) => {
    connection.query(query, [username], (error, results) => {
      connection.end();
      if (error) reject(error);
      if (results.length === 0) {
        resolve(false);
        return;
      }
      // Verify password using secure comparison
      const isValid = verifyPassword(password, results[0].password);
      resolve(isValid);
    });
  });
}

// FIX 6: Use cryptographically secure random token generation
function generateSessionToken() {
  // crypto.randomBytes is cryptographically secure
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  getUserByUsername,
  authenticateUser,
  generateSessionToken,
  hashPassword,
  verifyPassword
};
