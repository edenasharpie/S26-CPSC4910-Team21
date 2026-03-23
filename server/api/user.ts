// tentatively commenting out this file due to its peculiar placement in the project structure.

//// server/api/user.ts
//import { verifyPassword, hashPassword } from '../src/utils/auth';
//import { Pool, RowDataPacket } from 'mysql2/promise';

///** * 1. TYPE DEFINITIONS
// * These tell TypeScript exactly what properties exist on your objects.
// */
//interface User {
//  id: number;
//  display_name: string;
//  first_name: string;
//  last_name: string;
//  email: string;
//  phone_number: string;
//  password_hash: string; // This fixes the "property does not exist" error
//  account_type: 'Admin' | 'Sponsor' | 'Driver';
//  last_password_change?: string;
//}

//interface DBResponse {
//  success: boolean;
//  error?: string;
//}

//interface PasswordHistoryEntry {
//  password_hash: string;
//  changed_at: string;
//}

//// Helper function to call to db
//export async function getUserById(pool: any, userId: number | string): Promise<User | undefined> {
//  const [rows] = await pool.query(
//    'SELECT * FROM USERS WHERE UserID = ?',
//    [userId]
//  );
//  const results = rows as any[];
//  return results[0] as User | undefined;
//}
///**
// * GET /api/user/profile
// */
//export async function getProfile(pool: any, userId: number) {
//  const user = await getUserById(pool, userId);
//// Helper function to call to db
//export async function getUserById(pool: any, userId: number | string): Promise<User | undefined> {
//  const [rows] = await pool.query(
//    `SELECT u.*, d.PerformanceStatus as performance_status 
//     FROM USERS u 
//     LEFT JOIN DRIVERS d ON u.UserID = d.UserID 
//     WHERE u.UserID = ?`,
//    [userId]
//  );
//  const results = rows as any[];
//  return results[0] as User | undefined;
//}
///**
// * GET /api/user/profile
// */
//export async function getProfile(pool: any, userId: number) {
//  const user = await getUserById(pool, userId);
  
//  if (!user) {
//    return { error: 'User not found', status: 404 };
//  }
  
//  const { password_hash, ...userProfile } = user;

//  const profileWithDisplayName = {
//    ...userProfile,
//    displayName: `${user.first_name} ${user.last_name}`
//  };
  
//  return { 
//    data: userProfile,
//    status: 200 
//  };
//}

///**
// * PATCH /api/user/profile
// */
//export async function updateProfile(
//  pool: any, 
//  userId: number, 
//  updates: Partial<Omit<User, 'id' | 'password_hash'>>,
//  updateUserProfileFn: Function
//) {
//  try {
//    if (updates.email && !isValidEmail(updates.email)) {
//      return { error: 'Invalid email address', status: 400 };
//    }
    
//    await updateUserProfileFn(pool, userId, updates);
    
//    const updatedUser = await getUserById(pool, userId);
//    if (!updatedUser) return { error: 'User not found', status: 404 };

//    const { password_hash, ...userProfile } = updatedUser;
    
//    return {
//      data: userProfile,
//      message: 'Profile updated successfully',
//      status: 200
//    };
    
//  } catch (error) {
//    console.error('Error updating profile:', error);
//    return { error: 'Failed to update profile', status: 500 };
//  }
//}

///**
// * POST /api/user/change-password
// */
//export async function changePasswordWithHistory(
//  pool: any,
//  userId: number,
//  currentPassword: string,
//  newPassword: string,
//  changePasswordFn: Function, // Pass the changePassword logic in
//  ipAddress?: string,
//  userAgent?: string
//) {
//  try {
//    const user = await getUserById(pool, userId);
//    if (!user) {
//      return { error: 'User not found', status: 404 };
//    }
    
//    const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
//    if (!isValidPassword) {
//      return { error: 'Current password is incorrect', status: 401 };
//    }
    
//    if (newPassword.length < 8) {
//      return { error: 'Password must be at least 8 characters long', status: 400 };
//    }

//    // Compare with password history
//    const [historyRows] = await pool.query(
//      'SELECT password_hash FROM PasswordHistory WHERE UserID = ? ORDER BY changed_at DESC LIMIT 5',
//      [userId]
//    );
//    const history = historyRows as PasswordHistoryEntry[];
    
//    // Check if new password matches any in the last 5
//    for (const entry of history) {
//      const isMatch = await verifyPassword(newPassword, entry.password_hash);
//      if (isMatch) {
//        return { error: 'New password cannot be one of your last 5 passwords', status: 400 };
//      }
//    }
    
//    const newPasswordHash = await hashPassword(newPassword);
    
//    // Fix: Await the change logic and pass pool
//    const result = await changePasswordFn(
//      pool,
//      userId,
//      user.password_hash, 
//      newPasswordHash,
//      ipAddress,
//      userAgent
//    ) as DBResponse;
    
//    if (!result.success) {
//      return { error: result.error || 'Password change failed', status: 400 };
//    }
    
//    const updatedUser = await getUserById(pool, userId);
    
//    return {
//      data: { lastPasswordChange: updatedUser?.last_password_change },
//      message: 'Password changed successfully',
//      status: 200
//    };
    
//  } catch (error) {
//    console.error('Error changing password:', error);
//    return { error: 'Failed to change password', status: 500 };
//  }
//}

///**
// * PATCH /api/user/point-ratio
// */
//export async function updateUserPointRatio(
//    pool: any, 
//    userId: number, 
//    ratio: number,
//    updatePointRatioFn: Function
//) {
//  try {
//    const user = await getUserById(pool, userId);
//    if (!user) {
//      return { error: 'User not found', status: 404 };
//    }
    
//    if (user.account_type !== 'Admin' && user.account_type !== 'Sponsor') {
//      return { error: 'Only Admin and Sponsor accounts can change point ratio', status: 403 };
//    }
    
//    if (ratio <= 0) {
//      return { error: 'Point to dollar ratio must be greater than 0', status: 400 };
//    }
    
//    await updatePointRatioFn(pool, userId, ratio);
    
//    const updatedUser = await getUserById(pool, userId);
//    const { password_hash, ...userProfile } = updatedUser!;
    
//    return {
//      data: userProfile,
//      message: 'Point ratio updated successfully',
//      status: 200
//    };
    
//  } catch (error) {
//    console.error('Error updating point ratio:', error);
//    return { error: 'Failed to update point ratio', status: 500 };
//  }
//}

///**
// * GET /api/user/password-history
// */
//export async function getUserPasswordHistory(pool: any, userId: number) {
//  try {
//    const [rows] = await pool.query(
//      'SELECT password_hash, changed_at FROM PasswordHistory WHERE UserID = ? ORDER BY changed_at DESC LIMIT 5',
//      [userId]
//    );
    
//    const history = rows as PasswordHistoryEntry[];
    
//    return {
//      data: history.map(h => ({ changed_at: h.changed_at })),
//      status: 200
//    };
//  } catch (error) {
//    console.error('Error getting history:', error);
//    return { error: 'Failed to get history', status: 500 };
//  }
//}

///**
// * POST /api/user/admin
// * Creates a new Admin account. Only callable by an existing Admin.
// *
// * @param pool          - Database connection pool
// * @param requesterId   - UserID of the admin making the request
// * @param newAdminData  - Details for the new admin account
// * @param getUserByUsernameFn - DB helper: checks whether a username is already taken
// * @param createUserFn  - DB helper: inserts into USERS + ADMINS tables
// */
//export async function createAdminAccount(
//  pool: any,
//  requesterId: number,
//  newAdminData: {
//    username: string;
//    firstName: string;
//    lastName: string;
//    email?: string;
//    phone?: string;
//    password: string;
//  },
//  getUserByUsernameFn: (pool: any, username: string) => Promise<any>,
//  createUserFn: (pool: any, userData: Record<string, any>) => Promise<DBResponse>
//) {
//  try {
//    // 1. Verify requester is an Admin
//    const requester = await getUserById(pool, requesterId);
//    if (!requester) {
//      return { error: 'Requester not found', status: 404 };
//    }
//    if (requester.account_type !== 'Admin') {
//      return { error: 'Only Admin accounts can create new admin users', status: 403 };
//    }

//    // 2. Validate required fields
//    const { username, firstName, lastName, email, phone, password } = newAdminData;
//    if (!username || !firstName || !lastName || !password) {
//      return { error: 'username, firstName, lastName, and password are required', status: 400 };
//    }

//    if (email && !isValidEmail(email)) {
//      return { error: 'Invalid email address', status: 400 };
//    }

//    if (password.length < 8) {
//      return { error: 'Password must be at least 8 characters long', status: 400 };
//    }

//    // 3. Ensure username is not already taken
//    const existing = await getUserByUsernameFn(pool, username);
//    if (existing) {
//      return { error: 'Username is already taken', status: 409 };
//    }

//    // 4. Hash the password before storing
//    const passwordHash = await hashPassword(password);

//    // 5. Delegate record creation to the provided DB function
//    const result = await createUserFn(pool, {
//      Username: username,
//      FirstName: firstName,
//      LastName: lastName,
//      Email: email ?? null,
//      Phone: phone ?? null,
//      PassHash: passwordHash,
//      UserType: 'Admin',
//    });

//    if (!result.success) {
//      return { error: result.error || 'Failed to create admin account', status: 500 };
//    }

//    // 6. Fetch and return the newly created user (without the password hash)
//    const newUser = await getUserByUsernameFn(pool, username);
//    if (!newUser) {
//      return { error: 'Account created but could not be retrieved', status: 500 };
//    }

//    const { password_hash: _pw, ...safeUser } = newUser;

//    return {
//      data: safeUser,
//      message: 'Admin account created successfully',
//      status: 201,
//    };
//  } catch (error) {
//    console.error('Error creating admin account:', error);
//    return { error: 'Failed to create admin account', status: 500 };
//  }
//}

//function isValidEmail(email: string): boolean {
//  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//  return emailRegex.test(email);
//}


