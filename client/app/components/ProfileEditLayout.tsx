import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Alert } from "./Alert";

interface ProfileEditLayoutProps {
  apiBaseUrl: string;
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  profilePicture?: string | null;
  initials: string;
  profileMeta?: string;
  successMessage?: string | null;
  errorMessage?: string | null;
  onDismissSuccess?: () => void;
  onDismissError?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  auxiliaryContent?: ReactNode;
}

export function getProfileEditFieldClass(isEditing: boolean) {
  return isEditing
    ? "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 shadow-sm text-gray-900 dark:text-gray-100 opacity-100"
    : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 opacity-100";
}

function resolveProfileImageUrl(profilePicture?: string | null) {
  if (!profilePicture) return null;

  const trimmed = profilePicture.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      return wrapped ? decodeURIComponent(wrapped) : trimmed;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function getProfileImageCandidates(profilePicture?: string | null) {
  const trimmed = profilePicture?.trim();
  if (!trimmed) return [] as string[];

  const candidates = [trimmed];
  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      if (wrapped) candidates.push(decodeURIComponent(wrapped));
    }
  } catch {
    return candidates;
  }

  return Array.from(new Set(candidates));
}

function toRenderableImageUrl(apiBaseUrl: string, profilePicture?: string | null) {
  const resolved = resolveProfileImageUrl(profilePicture);
  if (!resolved) return null;
  if (resolved.startsWith("data:image")) return resolved;
  if (resolved.startsWith(`${apiBaseUrl}/api/images/proxy?url=`)) return resolved;
  return `${apiBaseUrl}/api/images/proxy?url=${encodeURIComponent(resolved)}`;
}

export function ProfileEditLayout({
  apiBaseUrl,
  backTo,
  backLabel,
  title,
  subtitle,
  profilePicture,
  initials,
  profileMeta,
  successMessage,
  errorMessage,
  onDismissSuccess,
  onDismissError,
  actions,
  children,
  auxiliaryContent,
}: ProfileEditLayoutProps) {
  const [profileImageError, setProfileImageError] = useState(false);
  const [profileImageSourceIndex, setProfileImageSourceIndex] = useState(0);

  const profileImageCandidates = useMemo(
    () => getProfileImageCandidates(profilePicture),
    [profilePicture]
  );

  useEffect(() => {
    setProfileImageError(false);
    setProfileImageSourceIndex(0);
  }, [profilePicture]);

  const activeProfileImage = toRenderableImageUrl(
    apiBaseUrl,
    profileImageCandidates[profileImageSourceIndex]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="p-8 max-w-5xl mx-auto space-y-10">
        <div className="flex items-center gap-4">
          <Link
            to={backTo}
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            {`\u2190 ${backLabel}`}
          </Link>
          <Link
            to="/"
            className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Home
          </Link>
        </div>

        {successMessage && (
          <Alert
            variant="success"
            title="Saved"
            message={successMessage}
            onDismiss={onDismissSuccess}
          />
        )}
        {errorMessage && (
          <Alert
            variant="error"
            title="Unable to save"
            message={errorMessage}
            onDismiss={onDismissError}
          />
        )}

        <div className="flex items-center gap-8 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            {activeProfileImage && !profileImageError ? (
              <img
                key={`${profilePicture ?? ""}-${profileImageSourceIndex}`}
                src={activeProfileImage}
                alt="Profile"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (profileImageSourceIndex < profileImageCandidates.length - 1) {
                    setProfileImageSourceIndex((idx) => idx + 1);
                    return;
                  }
                  setProfileImageError(true);
                }}
                className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center text-2xl font-bold">
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 text-left">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            {profileMeta && (
              <div className="flex gap-6 mt-2 text-xs text-gray-400 dark:text-gray-500">
                <span>{profileMeta}</span>
              </div>
            )}
          </div>

          {actions && <div className="flex gap-2">{actions}</div>}
        </div>

        {children}

        {auxiliaryContent}
      </div>
    </div>
  );
}
