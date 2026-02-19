import bcrypt from "bcrypt";
import { data } from "react-router";
import type { Route } from "./+types/change-password";
import { getUserById, getPasswordHistory, changePassword } from "../../../server/database/db";

// Type definitions for database objects
interface User {
  id: number;
  username: string;
  display_name: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  profile_picture_url?: string;
  account_type: string;
  point_to_dollar_ratio: number;
  created_at: string;
  updated_at: string;
  last_password_change: string;
  is_active: number;
}

interface PasswordHistoryRecord {
  password_hash: string;
  changed_at: string;
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const { userId, currentPassword, newPassword } = await request.json();


  const response = await fetch('/api/user/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      currentPassword,
      newPassword,
    }),
  });

 
  if (response.status === 400) {
    const data = await response.json();
    return { error: data.message || "Cannot reuse a recent password." };
    // Get user from database
    const user = getUserById(userId) as User | undefined;
    if (!user) {
      return data({ error: "User not found" }, { status: 404 });
    }

    // 1. Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      return data({ error: "Current password is incorrect" }, { status: 400 });
    }

    // 2. Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password_hash);
    if (isSameAsCurrent) {
      return data({ error: "New password cannot be the same as your current one" }, { status: 400 });
    }

    // 3. Check password history (prevent reuse)
    const history = getPasswordHistory(userId, 10) as PasswordHistoryRecord[];
    for (const record of history) {
      const wasUsedBefore = await bcrypt.compare(newPassword, record.password_hash);
      if (wasUsedBefore) {
        return data({ error: "You cannot reuse an old password" }, { status: 400 });
      }
    }

    // 4. Hash the new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // 5. Get client info for logging
    const ipAddress = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // 6. Change password
    const result = await changePassword(
      userId, 
      user.password_hash, // old password hash
      newHash,            // new password hash
      ipAddress,
      userAgent
    );

    if (!result.success) {
      return data({ error: result.error }, { status: 400 });
    }

    return data({ success: true });

  } catch (err: any) {
    console.error("Password change error:", err);
    return data({ error: "An error occurred while changing password" }, { status: 500 });
  }
}