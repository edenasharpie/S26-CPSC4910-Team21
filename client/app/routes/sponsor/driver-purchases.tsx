import { useLoaderData } from "react-router";
import { Table, Badge, Card } from "~/components";
import { useEffect } from "react";

export async function loader() {
  try {
    const res = await fetch("http://localhost:5001/api/sponsors/driver-purchases/101");
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
      key: "PurchaseDate",
      header: "Date",
      render: (row: any) => new Date(row.PurchaseDate).toLocaleDateString(),
    },
    {
      key: "Driver",
      header: "Driver",
      render: (row: any) => `${row.DriverFirstName} ${row.DriverLastName}`,
    },
    {
      key: "ItemName",
      header: "Item",
      render: (row: any) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.ItemName}</span>
          <span className="text-xs text-gray-400">{row.ItemCategory}</span>
        </div>
      ),
    },
    {
      key: "TotalCost",
      header: "Cost (Points)",
      render: (row: any) => (
        <span className="font-bold text-indigo-600">{row.TotalCost} pts</span>
      ),
    },
    {
      key: "Status",
      header: "Status",
      render: (row: any) => (
        <Badge variant={row.Status === "Shipped" ? "success" : "warning"}>
          {row.Status}
        </Badge>
      ),
    },
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