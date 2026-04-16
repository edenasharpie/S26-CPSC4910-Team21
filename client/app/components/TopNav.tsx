import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useNavigate } from "react-router";
import { toApiUrl } from "~/utils/api-url";
import { Badge } from "~/components/Badge";

type NavRole = "driver" | "sponsor" | "admin";

type NotificationItem = {
  notificationId: number;
  timestamp?: string | null;
  content?: string;
  category?: string;
  readAt?: string | null;
  properties?: Record<string, unknown>;
};

interface TopNavProps {
  user:
    | {
        username: string;
        role: NavRole;
        firstName?: string;
        lastName?: string;
        userId?: number | string;
      }
    | null;
  dashboardHref?: string;
  notifications?: NotificationItem[];
  unreadNotificationCount?: number;
}

const NAV_SHELL_BY_ROLE: Record<"guest" | NavRole, string> = {
  guest:
    "bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 border-amber-200 text-amber-900 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-amber-900/40 dark:border-amber-700 dark:text-amber-100",
  driver:
    "bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-emerald-200 text-emerald-900 dark:from-emerald-900/40 dark:via-teal-900/30 dark:to-emerald-900/40 dark:border-emerald-700 dark:text-emerald-100",
  sponsor:
    "bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-100 border-sky-200 text-sky-900 dark:from-sky-900/40 dark:via-cyan-900/30 dark:to-sky-900/40 dark:border-sky-700 dark:text-sky-100",
  admin:
    "bg-gradient-to-r from-rose-50 via-red-50 to-rose-100 border-rose-200 text-rose-900 dark:from-rose-900/40 dark:via-red-900/30 dark:to-rose-900/40 dark:border-rose-700 dark:text-rose-100",
};

const NOTIFICATION_SCROLL_THRESHOLD = 5;

export function TopNav({ user, dashboardHref, notifications, unreadNotificationCount }: TopNavProps) {
  const navigate = useNavigate();
  const role = user?.role ?? "guest";
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.trim() ||
    (user?.username?.[0]?.toUpperCase() ?? "U");
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>(notifications ?? []);
  const [unreadCount, setUnreadCount] = useState(unreadNotificationCount ?? 0);
  const [isNotificationMutationPending, setIsNotificationMutationPending] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  const notificationBasePath = useMemo(() => {
    if (!user?.userId) return null;
    if (user.role === "driver") {
      return `/api/driver/${user.userId}/notifications`;
    }
    if (user.role === "sponsor") {
      return `/api/sponsors/${user.userId}/notifications`;
    }
    return null;
  }, [user?.role, user?.userId]);

  useEffect(() => {
    setNotificationItems(notifications ?? []);
  }, [notifications]);

  useEffect(() => {
    setUnreadCount(unreadNotificationCount ?? 0);
  }, [unreadNotificationCount]);

  useEffect(() => {
    if (!isNotificationMenuOpen) return undefined;

    function handleOutsideClick(event: MouseEvent) {
      if (!notificationMenuRef.current) return;
      if (!notificationMenuRef.current.contains(event.target as Node)) {
        setIsNotificationMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isNotificationMenuOpen]);

  function categoryVariant(category: string | undefined) {
    const normalized = String(category ?? "").toLowerCase();
    if (
      normalized.includes("point")
    ) {
      return "success" as const;
    }
    if (
      normalized.includes("order")
    ) {
      return "info" as const;
    }
    if (
      normalized.includes("application")
    ) {
      return "warning" as const;
    }
    if (
      normalized.includes("left_company") ||
      normalized.includes("removed")
    ) {
      return "danger" as const;
    }
    return "default" as const;
  }

  function categoryLabel(category: string | undefined) {
    const normalized = String(category ?? "").trim();
    if (!normalized) return "General";
    return normalized
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }

  function formatNotificationTimestamp(timestamp: string | null | undefined) {
    if (!timestamp) return "Unknown";
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleString();
  }

  async function markNotificationRead(notificationId: number) {
    if (!notificationBasePath) return;

    setIsNotificationMutationPending(true);
    try {
      const response = await fetch(toApiUrl(`${notificationBasePath}/${notificationId}/read`), {
        method: "PATCH",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to mark notification read", {
          notificationId,
          status: response.status,
        });
        return;
      }

      const now = new Date().toISOString();
      setNotificationItems((previous) =>
        previous.map((item) =>
          item.notificationId === notificationId ? { ...item, readAt: item.readAt ?? now } : item
        )
      );
      setUnreadCount((previous) => (previous > 0 ? previous - 1 : 0));
    } catch (error) {
      console.error("Error marking notification read", error);
    } finally {
      setIsNotificationMutationPending(false);
    }
  }

  async function markAllNotificationsRead() {
    if (!notificationBasePath) return;

    setIsNotificationMutationPending(true);
    try {
      const response = await fetch(toApiUrl(`${notificationBasePath}/read-all`), {
        method: "PATCH",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to mark all notifications read", {
          status: response.status,
        });
        return;
      }

      const now = new Date().toISOString();
      setNotificationItems((previous) => previous.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all notifications read", error);
    } finally {
      setIsNotificationMutationPending(false);
    }
  }

  async function clearNotification(notificationId: number) {
    if (!notificationBasePath) return;

    setIsNotificationMutationPending(true);
    try {
      const response = await fetch(toApiUrl(`${notificationBasePath}/${notificationId}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to clear notification", {
          notificationId,
          status: response.status,
        });
        return;
      }

      setNotificationItems((previous) => {
        const target = previous.find((item) => Number(item.notificationId) === notificationId);
        if (target && !target.readAt) {
          setUnreadCount((current) => (current > 0 ? current - 1 : 0));
        }
        return previous.filter((item) => Number(item.notificationId) !== notificationId);
      });
    } catch (error) {
      console.error("Error clearing notification", error);
    } finally {
      setIsNotificationMutationPending(false);
    }
  }

  async function clearAllNotifications() {
    if (!notificationBasePath) return;

    setIsNotificationMutationPending(true);
    try {
      const response = await fetch(toApiUrl(`${notificationBasePath}/clear-all`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to clear all notifications", {
          status: response.status,
        });
        return;
      }

      setNotificationItems([]);
      setUnreadCount(0);
    } catch (error) {
      console.error("Error clearing all notifications", error);
    } finally {
      setIsNotificationMutationPending(false);
    }
  }

  const hasNotificationSurface = Boolean(notificationBasePath);
  const shouldUseNotificationScroll = notificationItems.length > NOTIFICATION_SCROLL_THRESHOLD;

  return (
    <header className={`border-b ${NAV_SHELL_BY_ROLE[role]}`}>
      <div className="container-padding py-3">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-black tracking-tight text-current hover:opacity-80"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4 8.5L12 4L20 8.5V15.5L12 20L4 15.5V8.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 12H16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M9.5 15H14.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              FleetScore
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Link
              to="/features"
              className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
            >
              Features
            </Link>
            <Link
              to="/about"
              className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
            >
              About
            </Link>
            {user ? (
              <>
                <Link
                  to={dashboardHref ?? "/"}
                  className="rounded-md border border-current/20 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Dashboard
                </Link>
                {hasNotificationSurface ? (
                  <div className="relative" ref={notificationMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsNotificationMenuOpen((previous) => !previous)}
                      className="relative rounded-md border border-current/20 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                      aria-label="Open notifications"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 3C8.68629 3 6 5.68629 6 9V12.5L4.5 15.5H19.5L18 12.5V9C18 5.68629 15.3137 3 12 3Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 18C10.4 19.2 11.2 20 12 20C12.8 20 13.6 19.2 14 18"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        Alerts
                      </span>
                      {unreadCount > 0 ? (
                        <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </button>

                    {isNotificationMenuOpen ? (
                      <div className="absolute right-0 z-50 mt-2 w-90 max-w-[90vw] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Notifications</h3>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void markAllNotificationsRead()}
                              disabled={isNotificationMutationPending || unreadCount === 0}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-gray-400"
                            >
                              Mark all read
                            </button>
                            <button
                              type="button"
                              onClick={() => void clearAllNotifications()}
                              disabled={isNotificationMutationPending || notificationItems.length === 0}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-gray-400"
                            >
                              Clear all
                            </button>
                          </div>
                        </div>

                        <div className={`space-y-2 ${shouldUseNotificationScroll ? "max-h-96 overflow-y-auto pr-1" : ""}`}>
                          {notificationItems.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                              No notifications yet.
                            </p>
                          ) : (
                            notificationItems.map((notification) => {
                              const read = Boolean(notification.readAt);
                              return (
                                <div
                                  key={notification.notificationId}
                                  className={`rounded-lg border px-3 py-2 ${
                                    read
                                      ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                                      : "border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20"
                                  }`}
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <Badge variant={categoryVariant(notification.category)} size="sm">
                                      {categoryLabel(notification.category)}
                                    </Badge>
                                    <div className="flex items-center gap-2">
                                      {!read ? (
                                        <button
                                          type="button"
                                          onClick={() => void markNotificationRead(Number(notification.notificationId))}
                                          disabled={isNotificationMutationPending}
                                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-gray-400"
                                        >
                                          Mark read
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => void clearNotification(Number(notification.notificationId))}
                                        disabled={isNotificationMutationPending}
                                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-gray-400"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                  <p className={`text-xs ${read ? "text-gray-600 dark:text-gray-300" : "font-semibold text-gray-900 dark:text-gray-100"}`}>
                                    {notification.content || "Notification"}
                                  </p>
                                  <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                    {formatNotificationTimestamp(notification.timestamp ?? null)}
                                  </p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(`/${user.role}/profile/${user.userId}/edit`)}
                  className="flex items-center gap-2 rounded-md border border-current/20 px-2 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase w-6 h-6">
                    {initials}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-semibold leading-none">{user.firstName ?? user.username} {user.lastName ?? ""}</div>
                    <div className="text-[10px] text-current/70 leading-none">@{user.username}</div>
                  </div>
                </button>
                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-current/25 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Sign Out
                  </button>
                </Form>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md border border-current/25 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
