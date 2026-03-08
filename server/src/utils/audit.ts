// Helper function to record activity into audit logs
export async function recordAuditEntry(pool: any, userId: number | null, action: string, status: string, ip: string) {
    try {
        await pool.execute(
            'INSERT INTO AUDIT_LOGS (UserID, ActionType, Status, IPAddress) VALUES (?, ?, ?, ?)',
            [userId, action, status, ip]
        );
        console.log(`Audit Log Created: ${action} - ${status}`);
    } catch (err) {
        console.error("CRITICAL: Failed to write to Audit Log:", err);
    }
}