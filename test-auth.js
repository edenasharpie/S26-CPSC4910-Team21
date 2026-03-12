import crypto from 'crypto';

const testPassword = 'TestPassword123!';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(salt + testPassword).digest('hex');
const passhash = `${salt}:${hash}`;

console.log('Test Password:', testPassword);
console.log('Password Hash:', passhash);
console.log('Hash Length:', passhash.length);
console.log('');
console.log('To update a user in the database, run:');
console.log(`UPDATE USERS SET PassHash = '${passhash}' WHERE Username = 'your_test_user';`);
