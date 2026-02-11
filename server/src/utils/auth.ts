import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// Function to compare the input password with the stored hashed password
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
    return await bcrypt.compare(plain, hashed);
}

// Function to hash a new password that has been created
export async function hashPassword(plain: string): Promise<string> {
    return await bcrypt.hash(plain, SALT_ROUNDS);
}