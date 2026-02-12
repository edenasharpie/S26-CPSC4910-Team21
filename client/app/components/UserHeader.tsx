import { Badge } from "~/components";

interface UserHeaderProps {
    user: {
        name: string;
        role: string;
        avatarUrl?: string;
    };
}

export function UserHeader({ user }: UserHeaderProps) {
    return (
    <div className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-800">
      {/* Profile Picture / Avatar Circle */}
      <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-lg">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          user.name.charAt(0)
        )}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-white text-base">
            {user.name}
          </span>
          
          {/* Text-Only Sponsor Badge */}
          {user.role === "sponsor" && (
            <Badge 
              variant="info" 
              size="sm" 
              className="px-2 py-0.5 font-bold uppercase tracking-widest text-[10px] leading-tight"
            >
              Sponsor
            </Badge>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
          {user.role} Account
        </span>
      </div>
    </div>
  );
}