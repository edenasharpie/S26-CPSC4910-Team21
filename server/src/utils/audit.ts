import { resolveAuditActorUserId } from '../db.js';

// Helper function to record activity into the EVENTS audit log table.
// Maps legacy (action, status, ip) arguments onto the EVENTS schema.
export async function recordAuditEntry(pool: any, userId: number | null, action: string, status: string, ip: string) {
    try {
        const effectiveUserId = await resolveAuditActorUserId(userId);
        const success = status.toUpperCase() === 'SUCCESS';
        const properties = JSON.stringify({ success, result: status.toLowerCase(), ipAddress: ip });
        await pool.execute(
            'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
            [effectiveUserId, action, properties]
        );
        console.log(`Audit Event Created: ${action} - ${status}`);
    } catch (err) {
        console.error("CRITICAL: Failed to write to EVENTS audit log:", { err, userId, action, status, ip });
    }
}