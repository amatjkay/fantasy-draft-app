/**
 * Admin Seed Script
 * Creates default admin user if not exists
 */

import { dataStore } from './dataStore';
import { hashPassword } from './auth';

export async function seedAdmin() {
  const ADMIN_ID = '1'; // Fixed ID for admin
  const adminLogin = process.env.ADMIN_LOGIN || 's3ifer';
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    console.error('[Seed] ADMIN_PASSWORD environment variable is not set. Skipping admin creation.');
    return;
  }
  
  // Check if admin already exists by ID or login
  const existingById = dataStore.getUser(ADMIN_ID);
  const existingByLogin = dataStore.getUserByLogin(adminLogin);
  
  if (existingById || existingByLogin) {
    console.log('[Seed] Admin user already exists:', adminLogin);
    return;
  }

  // Create admin user with fixed ID
  const passwordHash = await hashPassword(adminPassword);
  const admin = dataStore.createUserWithId(
    ADMIN_ID,
    adminLogin,
    passwordHash,
    'Admin Team',
    'admin-logo',
    'admin'
  );

  // Create admin team
  dataStore.createTeam(admin.id, 'Admin Team', 'admin-logo', 1);

  console.log('[Seed] Admin user created with ID=1:', adminLogin);
}
