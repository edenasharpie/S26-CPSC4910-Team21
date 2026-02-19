import bcrypt from "bcrypt";
import { data } from "react-router";
import type { Route } from "./+types/change-password";
//import { getUserById, getPasswordHistory, changePassword } from "../../../server/database/db";

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

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const userId = formData.get("userId");
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");

  // ✅ REPLACE the old function calls with a FETCH request
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

  // Handle the "Password History" error from Story 4 & 5
  if (response.status === 400) {
    const data = await response.json();
    return { error: data.message || "Cannot reuse a recent password." };
  }

  if (!response.ok) {
    return { error: "Failed to update password. Please try again." };
  }

  return { success: true };
}