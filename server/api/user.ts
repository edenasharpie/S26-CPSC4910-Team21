// server/api/user.ts
import bcrypt from 'bcrypt';
import {
  getUserById,
  updateUserProfile,
  changePassword,
  updatePointRatio,
  getPasswordHistory
} from '../database/db';

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

/**
 * GET /api/user/profile
 */
export async function getProfile(userId: number) {
  const user = getUserById(userId) as User | undefined;
  
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
export async function updateProfile(userId: number, updates: Partial<Omit<User, 'id' | 'password_hash'>>) {
  try {
    if (updates.email && !isValidEmail(updates.email)) {
      return { error: 'Invalid email address', status: 400 };
    }
    
    updateUserProfile(userId, updates);
    
    const updatedUser = getUserById(userId) as User;
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
  userId: number,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    const user = getUserById(userId) as User | undefined;
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
    
    // Casting result to DBResponse fixes the error on result.success and result.error
    const result = changePassword(
      userId,
      user.password_hash, 
      newPasswordHash,
      ipAddress,
      userAgent
    ) as DBResponse;
    
    if (!result.success) {
      return { error: result.error || 'Password change failed', status: 400 };
    }
    
    const updatedUser = getUserById(userId) as User;
    
    return {
      data: { lastPasswordChange: updatedUser.last_password_change },
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
export async function updateUserPointRatio(userId: number, ratio: number) {
  try {
    const user = getUserById(userId) as User | undefined;
    if (!user) {
      return { error: 'User not found', status: 404 };
    }
    
    if (user.account_type !== 'Admin' && user.account_type !== 'Sponsor') {
      return { error: 'Only Admin and Sponsor accounts can change point ratio', status: 403 };
    }
    
    if (ratio <= 0) {
      return { error: 'Point to dollar ratio must be greater than 0', status: 400 };
    }
    
    updatePointRatio(userId, ratio);
    
    const updatedUser = getUserById(userId) as User;
    const { password_hash, ...userProfile } = updatedUser;
    
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
export async function getUserPasswordHistory(userId: number) {
  try {
    const history = getPasswordHistory(userId) as PasswordHistoryEntry[];
    
    const safeHistory = history.map(entry => ({
      changed_at: entry.changed_at
    }));
    
    return {
      data: safeHistory,
      status: 200
    };
    
  } catch (error) {
    console.error('Error getting password history:', error);
    return { error: 'Failed to get password history', status: 500 };
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
