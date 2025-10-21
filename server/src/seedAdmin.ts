/**
 * Admin Seed Script
 * Creates default admin user if not exists
 */

import { dataStore } from './dataStore';
import { hashPassword } from './auth';

export async function seedAdmin() {
  const adminLogin = 's3ifer';
  const adminPassword = 'Fktirf2021@';
  
  // Check if admin already exists
  const existing = dataStore.getUserByLogin(adminLogin);
  if (existing) {
    console.log('[Seed] Admin user already exists:', adminLogin);
    return;
  }

  // Create admin user
  const passwordHash = await hashPassword(adminPassword);
  const admin = dataStore.createUser(
    adminLogin,
    passwordHash,
    'Admin Team',
    'admin-logo',
    'admin'
  );

  // Create admin team
  dataStore.createTeam(admin.id, 'Admin Team', 'admin-logo', 1);

  console.log('[Seed] Admin user created:', adminLogin);
}
