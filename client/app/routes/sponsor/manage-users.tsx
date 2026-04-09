import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

interface User {
  UserID: string;
  FirstName: string;
  LastName: string;
  Email: string;
}

export async function loader({ request }: { request: Request }) {
  await requireAuth(request, ["sponsor"]);
  try {
    // TODO: clarify if this should list drivers or sponsor users within the company.
    const res = await fetch(`${API_URL}/api/sponsors/affiliated-users`);
    
    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();

    return { users: Array.isArray(data) ? data : [] };

  } catch (error) {
    console.error("Loader Error:", error);
    return { users: [] };
  }
}

export default function UserDirectory() {
  const { users } = useLoaderData() as { users: User[] }; 

  return (
    <div className="min-h-screen bg-[#0f172a] p-12">
      <div className="max-w-5xl mx-auto">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-300 hover:underline mb-6">
          &larr; Home
        </Link>
        
        {/* Header (Text must be white to match screenshot/dark theme) */}
        <h1 className="text-4xl font-extrabold text-white mb-10 tracking-tight">
          Affiliated Users
        </h1>

        <div className="grid gap-6">
          {users.map((u: User) => (
            // This is the white "card" container
            <div 
              key={u.UserID} 
              className="bg-white p-8 rounded-2xl flex justify-between items-center shadow-xl border border-slate-200 transition-shadow hover:shadow-2xl"
            >
              {/*User Details*/}
              <div className="flex flex-col gap-1">
                {/* Name*/}
                <span className="text-2xl font-bold text-slate-900 tracking-tight">
                  {u.FirstName} {u.LastName}
                </span>
                
                {/*Email*/}
                <span className="text-base font-medium text-slate-600">
                  {u.Email}
                </span>
                
                {/*ID*/}
                <span className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">
                  ID: {u.UserID}
                </span>
              </div>
              
              {/* Blue button */}
              <Link 
                to={`/sponsor/manage-users/${u.UserID}`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3 rounded-xl font-bold text-lg shadow-md transition-all whitespace-nowrap"
              >
                Edit Info
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}