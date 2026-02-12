import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = 10;
const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from("abcdef0123456789abcdef0123456789");
const IV_LENGTH = 16;

// Function to compare the input password with the stored hashed password
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
    return await bcrypt.compare(plain, hashed);
}

// Function to hash a new password that has been created
export async function hashPassword(plain: string): Promise<string> {
    return await bcrypt.hash(plain, SALT_ROUNDS);
}

// Function to hash new private data
export function encryptPrivateData(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Function to decrypt private data
export function decryptPrivateData(encryptedText: string): string {
    const [ivHex, dataHex] = encryptedText.split(':');
    if (!ivHex || !dataHex) throw new Error("Invalid encrypted format");

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}

// Function to check against database if newly made password is a match to a user's historic passwords
export async function isOldPassword(
    newPassword: string,
    oldHashes: string[]
): Promise<boolean> {
    for (const hash of oldHashes) {
        const isMatch = await verifyPassword(newPassword, hash);
        if (isMatch) {
            return true;
        }
    }
    return false;
}