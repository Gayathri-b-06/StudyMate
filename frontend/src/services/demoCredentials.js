/**
 * Demo Account Seeding Helper (DEVELOPMENT / DEMO ONLY)
 * 
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * This file is purely for demo and development evaluation.
 * It is deliberately isolated from the core AuthService interface so that
 * when real backend authentication is introduced, this file can be cleanly
 * removed without modifying application components.
 * 
 * Demo Credential:
 *   Email:    demo@studymate.ai
 *   Password: password123
 */

/**
 * Derives a cryptographic hash from a password and salt using Web Crypto API.
 * Never stores plaintext passwords.
 * @param {string} password 
 * @param {Uint8Array} saltBytes 
 * @returns {Promise<string>} Hex representation of SHA-256 hash
 */
export async function hashPasswordWithSalt(password, saltBytes) {
  const enc = new TextEncoder()
  const passwordBytes = enc.encode(password)
  
  // Combine salt + password
  const combined = new Uint8Array(saltBytes.length + passwordBytes.length)
  combined.set(saltBytes, 0)
  combined.set(passwordBytes, saltBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a unique cryptographically random salt per account.
 * @returns {string} Hex-encoded 16-byte random salt
 */
export function generateRandomSalt() {
  const saltBytes = new Uint8Array(16)
  crypto.getRandomValues(saltBytes)
  return Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Helper to convert hex salt back to Uint8Array
 * @param {string} hexString 
 * @returns {Uint8Array}
 */
export function hexToBytes(hexString) {
  const bytes = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substr(i, 2), 16)
  }
  return bytes
}

export const DEMO_USER_CONFIG = {
  id: 'demo_user_1',
  name: 'Demo Student',
  email: 'demo@studymate.ai',
  rawDefaultPassword: 'password123', // Used ONLY for initial demo seeding
  role: 'admin',
  isDemo: true,
}

/**
 * Seeds the demo user into local accounts storage if no accounts exist.
 * Uses a unique random salt and stores only the derived hash.
 * @param {Object} existingAccounts 
 * @returns {Promise<Object>} Updated accounts dictionary
 */
export async function seedDemoAccountIfMissing(existingAccounts = {}) {
  const normalizedEmail = DEMO_USER_CONFIG.email.toLowerCase()

  // If the demo account already exists, ensure its role is correct.
  if (existingAccounts[normalizedEmail]) {
    const existing = existingAccounts[normalizedEmail]
    if (existing.role !== 'admin' || !existing.isDemo) {
      return {
        ...existingAccounts,
        [normalizedEmail]: { ...existing, role: 'admin', isDemo: true },
      }
    }
    return existingAccounts
  }

  const saltHex = generateRandomSalt()
  const saltBytes = hexToBytes(saltHex)
  const passwordHash = await hashPasswordWithSalt(DEMO_USER_CONFIG.rawDefaultPassword, saltBytes)

  const updated = {
    ...existingAccounts,
    [normalizedEmail]: {
      id: DEMO_USER_CONFIG.id,
      name: DEMO_USER_CONFIG.name,
      email: normalizedEmail,
      salt: saltHex,
      passwordHash,
      createdAt: new Date().toISOString(),
      role: DEMO_USER_CONFIG.role || 'admin',
      isDemo: true,
    }
  }

  return updated
}
