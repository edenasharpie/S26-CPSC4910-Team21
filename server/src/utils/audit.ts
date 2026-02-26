// Helper function to record activity into audit logs
export async function recordAuditEntry(
  pool: any, 
  userId: number, 
  action: 'LOGIN_ATTEMPT' | 'PASSWORD_CHANGE' | 'ACCOUNT_LOCK',
  status: 'SUCCESS' | 'FAILURE',
  details?: string
) {
  const query = `
    INSERT INTO AUDIT_LOGS (UserID, ActionType, Status, Details, CreatedAt)
    VALUES (?, ?, ?, ?, NOW())
  `;
  await pool.execute(query, [userId, action, status, details]);
}