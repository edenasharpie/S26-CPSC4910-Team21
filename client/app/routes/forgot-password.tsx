import { useState } from "react";
import { Link } from "react-router";
import { Alert, Button, Card, Input } from "~/components";
import { toApiUrl } from "~/utils/api-url";

type Step = "request" | "verify" | "confirm";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [resetRequestId, setResetRequestId] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [manualEntryKey, setManualEntryKey] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const resetFlow = () => {
    setStep("request");
    setIdentifier("");
    setResetRequestId("");
    setQrCodeDataUrl("");
    setManualEntryKey("");
    setTotpCode("");
    setResetToken("");
    setNewPassword("");
    setMessage("");
    setError("");
    setIsLoading(false);
  };

  const handleRequestChallenge = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(toApiUrl("/api/auth/password-reset/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to start password reset.");
        return;
      }

      if (!data.resetRequestId) {
        setMessage(data.message ?? "If an account exists, a reset challenge has been prepared.");
        return;
      }

      setResetRequestId(String(data.resetRequestId));
      setQrCodeDataUrl(String(data.qrCodeDataUrl ?? ""));
      setManualEntryKey(String(data.manualEntryKey ?? ""));
      setStep("verify");
      setMessage("Challenge created. Scan the QR code and enter your 6-digit authenticator code.");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyTotp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(toApiUrl("/api/auth/password-reset/verify-totp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetRequestId, totpCode }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Invalid verification code.");
        return;
      }

      setResetToken(String(data.resetToken ?? ""));
      setStep("confirm");
      setMessage("Code verified. Set your new password.");
    } catch {
      setError("Could not verify TOTP code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(toApiUrl("/api/auth/password-reset/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to reset password.");
        return;
      }

      setMessage(data.message ?? "Password reset successful.");
      setStep("request");
      setTotpCode("");
      setNewPassword("");
      setResetRequestId("");
      setResetToken("");
      setQrCodeDataUrl("");
      setManualEntryKey("");
      setIdentifier("");
    } catch {
      setError("Could not complete password reset. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Sign in
        </Link>

        <Card>
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Password Reset (2FA)</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Use your authenticator app to verify reset access, then set a new password.
              </p>
            </div>

            {message && <Alert variant="success" dismissible={false} message={message} />}
            {error && <Alert variant="error" dismissible={false} message={error} />}

            {step === "request" && (
              <form className="space-y-4" onSubmit={handleRequestChallenge}>
                <Input
                  id="identifier"
                  name="identifier"
                  label="Username or Email"
                  placeholder="Enter your username or email"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={resetFlow}>
                    Clear
                  </Button>
                  <Button type="submit" isLoading={isLoading} disabled={isLoading}>
                    Request Reset Challenge
                  </Button>
                </div>
              </form>
            )}

            {step === "verify" && (
              <form className="space-y-4" onSubmit={handleVerifyTotp}>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Scan QR Code</p>
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="TOTP QR code"
                      className="mt-3 h-56 w-56 max-w-full rounded border border-gray-200 bg-white p-2"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">No QR code returned by server.</p>
                  )}
                  <p className="mt-3 text-xs text-gray-500 break-all">
                    Manual key: {manualEntryKey || "Unavailable"}
                  </p>
                </div>

                <Input
                  id="totpCode"
                  name="totpCode"
                  label="6-digit Authenticator Code"
                  placeholder="123456"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  maxLength={6}
                  required
                />

                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={resetFlow}>
                    Start Over
                  </Button>
                  <Button type="submit" isLoading={isLoading} disabled={isLoading}>
                    Verify Code
                  </Button>
                </div>
              </form>
            )}

            {step === "confirm" && (
              <form className="space-y-4" onSubmit={handleConfirmReset}>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  label="New Password"
                  placeholder="At least 10 chars, upper/lower/special"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />

                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={resetFlow}>
                    Start Over
                  </Button>
                  <Button type="submit" isLoading={isLoading} disabled={isLoading}>
                    Confirm New Password
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}