/*
import { verifyPassword } from "../utils/auth";

export interface LoginResult {
    success: boolean;
    message: string;
    user?: any;
}

// Function to check if username password combo matches with database
// Commenting out when I commit this function due to database not being setup yet
export async function processLogin(username: string, password: string, userFromDb: any): Promise<LoginResult> {
    
    // If user exists
    if (!userFromDb) {
        return { success: false, message: "Invalid username or password" };
    }   

    const comboMatch = await verifyPassword(password, userFromDb.PassHash);

    if (!comboMatch) {
        return { success: false, message: "Invalid username or password" };
    }

    return {
        success: true,
        message: "Login successful",
        user: { id: userFromDb.UserId, role: userFromDb.accountType }
    };

}

*/