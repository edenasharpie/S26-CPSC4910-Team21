// server/api/user.ts
import bcrypt from 'bcrypt';
import { Pool, RowDataPacket } from 'mysql2/promise';

/** * 1. TYPE DEFINITIONS
 * These tell TypeScript exactly what properties exist on your objects.
 */
interface User {
  id: number;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password_hash: string; // This fixes the "property does not exist" error
  account_type: 'Admin' | 'Sponsor' | 'Driver';
  last_password_change?: string;
}

interface DBResponse {
  success: boolean;
  error?: string;
}

interface PasswordHistoryEntry {
  password_hash: string;
  changed_at: string;
}

// Helper function to call to db
export async function getUserById(pool: any, userId: number | string): Promise<User | undefined> {
  const [rows] = await pool.query(
    'SELECT * FROM USERS WHERE UserID = ?',
    [userId]
  );
  const results = rows as any[];
  return results[0] as User | undefined;
}
/**
 * GET /api/user/profile
 */
export async function getProfile(pool: any, userId: number) {
  const user = await getUserById(pool, userId);
  
  if (!user) {
    return { error: 'User not found', status: 404 };
  }
  
  const { password_hash, ...userProfile } = user;
  
  return { 
    data: userProfile,
    status: 200 
  };
}

/**
 * PATCH /api/user/profile
 */
export async function updateProfile(
  pool: any, 
  userId: number, 
  updates: Partial<Omit<User, 'id' | 'password_hash'>>,
  updateUserProfileFn: Function
) {
  try {
    if (updates.email && !isValidEmail(updates.email)) {
      return { error: 'Invalid email address', status: 400 };
    }
    
    await updateUserProfileFn(pool, userId, updates);
    
    const updatedUser = await getUserById(pool, userId);
    if (!updatedUser) return { error: 'User not found', status: 404 };

    const { password_hash, ...userProfile } = updatedUser;
    
    return {
      data: userProfile,
      message: 'Profile updated successfully',
      status: 200
    };
    
  } catch (error) {
    console.error('Error updating profile:', error);
    return { error: 'Failed to update profile', status: 500 };
  }
}

/**
 * POST /api/user/change-password
 */
export async function changeUserPassword(
  pool: any,
  userId: number,
  currentPassword: string,
  newPassword: string,
  changePasswordFn: Function, // Pass the changePassword logic in
  ipAddress?: string,
  userAgent?: string
) {
  try {
    const user = await getUserById(pool, userId);
    if (!user) {
      return { error: 'User not found', status: 404 };
    }
    
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return { error: 'Current password is incorrect', status: 401 };
    }
    
    if (newPassword.length < 8) {
      return { error: 'Password must be at least 8 characters long', status: 400 };
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    
    // Fix: Await the change logic and pass pool
    const result = await changePasswordFn(
      pool,
      userId,
      user.password_hash, 
      newPasswordHash,
      ipAddress,
      userAgent
    ) as DBResponse;
    
    if (!result.success) {
      return { error: result.error || 'Password change failed', status: 400 };
    }
    
    const updatedUser = await getUserById(pool, userId);
    
    return {
      data: { lastPasswordChange: updatedUser?.last_password_change },
      message: 'Password changed successfully',
      status: 200
    };
    
  } catch (error) {
    console.error('Error changing password:', error);
    return { error: 'Failed to change password', status: 500 };
  }
}

/**
 * PATCH /api/user/point-ratio
 */
export async function updateUserPointRatio(
    pool: any, 
    userId: number, 
    ratio: number,
    updatePointRatioFn: Function
) {
  try {
    const user = await getUserById(pool, userId);
    if (!user) {
      return { error: 'User not found', status: 404 };
    }
    
    if (user.account_type !== 'Admin' && user.account_type !== 'Sponsor') {
      return { error: 'Only Admin and Sponsor accounts can change point ratio', status: 403 };
    }
    
    if (ratio <= 0) {
      return { error: 'Point to dollar ratio must be greater than 0', status: 400 };
    }
    
    await updatePointRatioFn(pool, userId, ratio);
    
    const updatedUser = await getUserById(pool, userId);
    const { password_hash, ...userProfile } = updatedUser!;
    
    return {
      data: userProfile,
      message: 'Point ratio updated successfully',
      status: 200
    };
    
  } catch (error) {
    console.error('Error updating point ratio:', error);
    return { error: 'Failed to update point ratio', status: 500 };
  }
}

/**
 * GET /api/user/password-history
 */
export async function getUserPasswordHistory(pool: any, userId: number) {
  try {
    const [rows] = await pool.query(
      'SELECT password_hash, changed_at FROM PasswordHistory WHERE UserID = ? ORDER BY changed_at DESC LIMIT 5',
      [userId]
    );
    
    const history = rows as PasswordHistoryEntry[];
    
    return {
      data: history.map(h => ({ changed_at: h.changed_at })),
      status: 200
    };
  } catch (error) {
    console.error('Error getting history:', error);
    return { error: 'Failed to get history', status: 500 };
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/*
GET /api/drivers/profile/:userId
*/
export const getDriverProfile = async (pool, userId) => {
    const query = `
        SELECT 
            u.FirstName, 
            u.LastName, 
            u.Email,
            d.PerformanceStatus,
            d.TotalPoints
        FROM USERS u
        JOIN DRIVERS d ON u.UserID = d.UserID
        WHERE u.UserID = ?`;
    
    const [rows] = await pool.execute(query, [userId]);
    
    if (rows.length > 0) {
        const user = rows[0];
        return {
            success: true,
            data: {
                firstName: user.FirstName,
                lastName: user.LastName,
                displayName: `${user.FirstName} ${user.LastName}`, 
                performanceStatus: user.PerformanceStatus,        
                email: user.Email,
                points: user.TotalPoints
            }
        };
    }
    return { success: false, message: "Driver not found" };
};

// GET /api/drivers/performance/:userId
export const getDriverPerformance = async (pool, userId) => {
    const query = `
        SELECT 
            u.FirstName, 
            u.LastName, 
            d.PerformanceStatus,
            d.TotalPoints
        FROM USERS u
        JOIN DRIVERS d ON u.UserID = d.UserID
        WHERE u.UserID = ?`;
    
    const [rows] = await pool.execute(query, [userId]);
    
    if (rows.length > 0) {
        return { success: true, data: rows[0] };
    }
    return { success: false, message: "Driver performance data not found" };
};