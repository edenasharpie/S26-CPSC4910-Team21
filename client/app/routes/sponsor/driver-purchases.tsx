import { Link, useLoaderData } from "react-router";
import { Table, Badge } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request, ["sponsor"]);
  try {
    // TODO: replace with sponsorCompanyId from session-backed sponsor profile
    const res = await fetch(`${API_URL}/api/sponsors/driver-purchases/${session.UserID}`);
    const result = await res.json();

    if (result.error || !Array.isArray(result)) {
        return { purchases: [] };
    }

    return { purchases: result };
  } catch (error) {
    console.error("Loader failed:", error);
    return { purchases: [] }; 
  }
}

export default function DriverPurchases() {
  const { purchases } = useLoaderData<typeof loader>();

  const columns = [
    {
      key: "TimeChanged",
      header: "Date",
      render: (row: any) => new Date(row.TimeChanged).toLocaleDateString(),
    },
    {
      key: "Driver",
      header: "Driver",
      render: (row: any) => `${row.FirstName} ${row.LastName}`,
    },
    {
      key: "PointChange",
      header: "Points",
      render: (row: any) => (
        <Badge variant={row.PointChange >= 0 ? "success" : "danger"}>
          {row.PointChange >= 0 ? `+${row.PointChange}` : row.PointChange}
        </Badge>
      ),
    },
    { key: "ReasonForChange", header: "Reason" },
  ];

    return (
    <div style={{ 
      backgroundColor: '#f9fafb', 
      minHeight: '100vh', 
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      padding: '40px'
    }}>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        
        <header style={{ marginBottom: '32px' }}>
          <Link
            to="/"
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-3"
          >
            &larr; Home
          </Link>
          <h1 style={{ 
            color: '#1f2937', 
            fontSize: '32px', 
            fontWeight: 'bold',
            margin: 0 
          }}>
            Driver Purchase History
          </h1>
          <p style={{ 
            color: '#4b5563', 
            fontSize: '18px',
            marginTop: '8px' 
          }}>
            Manage and review fleet redemptions.
          </p>
        </header>

        <div style={{ 
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #475569', 
          overflow: 'hidden',
          padding: '24px'
        }}>
           <Table data={purchases} columns={columns} />
        </div>

      </div>
    </div>
  );
}