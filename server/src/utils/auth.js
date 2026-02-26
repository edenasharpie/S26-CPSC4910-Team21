import crypto from "crypto";

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from("abcdef0123456789abcdef0123456789"); // TODO: Populate (and move it to environment variable?)
const IV_LENGTH = 16;

// Use a salted SHA-256 hash for password storage. Format: <saltHex>:<hashHex>
export async function verifyPassword(plain, hashed) {
    if (!hashed) return false;
    const parts = hashed.split(":");
    if (parts.length !== 2) return false;
    const [saltHex, hashHex] = parts;
    const computed = crypto.createHash('sha256').update(saltHex + plain).digest('hex');
    return computed === hashHex;
}

export async function hashPassword(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + plain).digest('hex');
    return `${salt}:${hash}`;
}

// Function to hash new private data
export function encryptPrivateData(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Function to decrypt private data
export function decryptPrivateData(encryptedText) {
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
export async function isOldPassword(newPassword, oldHashes) {
    for (const hash of oldHashes) {
        const isMatch = await verifyPassword(newPassword, hash);
        if (isMatch) {
            return true;
        }
    }
    return false;
}
