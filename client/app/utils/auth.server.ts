import crypto from "crypto";

export async function verifyPassword(plain: string, hashed: string) {
    if (!hashed) return false;
    const parts = hashed.split(":");
    if (parts.length !== 2) return false;
    const [saltHex, hashHex] = parts;
    const computed = crypto.createHash('sha256').update(saltHex + plain).digest('hex');
    return computed === hashHex;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "secret_key_must_be_32_characters_";
const IV_LENGTH = 16;

export function encryptPrivateData(data: string) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(data);

    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}