import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, Form } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Button, Card, Table, Modal, Alert } from "~/components";
import { createApiClient } from "~/utils/api";
import { requireAuth } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = requireAuth(request, ["driver"]);
  return { user };
}

interface OrderItem {
  orderItemId: number;
  itemId: number;
  name: string;
  imageUrl?: string;
  quantity: number;
  unitPointCost: number;
  unitDollarCost: number;
}

interface DriverOrder {
  orderId: number;
  orderDate: string;
  orderPointsSpent: number;
  orderDollarsSpent: number;
  orderStatus: string;
  sponsorCompanyName?: string | null;
  items: OrderItem[];
}

function parseOrderDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(value as string | number | Date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isDisplayableOrderDate(value: unknown): boolean {
  const parsed = parseOrderDate(value);
  return Boolean(parsed && parsed.getFullYear() >= 2000);
}

function formatOrderDate(value: unknown): string {
  const parsed = parseOrderDate(value);
  if (!parsed) return "";
  return parsed.toLocaleString();
}

export default function DriverOrders() {
  const { user } = useLoaderData<typeof loader>();
  const api = useMemo(() => createApiClient({ id: user.UserID, role: "driver" }), [user.UserID]);

  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<DriverOrder | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/orders");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const filteredOrders = Array.isArray(data)
        ? data.filter((order: DriverOrder) => isDisplayableOrderDate(order.orderDate))
        : [];
      setOrders(filteredOrders);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      setError(null);
      const response = await api.delete(`/orders/${orderId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to cancel order");
      }
      await fetchOrders();
    } catch (err: any) {
      console.error("Cancel order failed:", err);
      setError(err.message || "Failed to cancel order");
    }
  };

  const handleEditOrder = (order: DriverOrder) => {
    setEditingOrder(order);
    setEditItems(order.items.map((item) => ({ ...item })));
  };

  const handleEditQuantity = (itemId: number, quantity: number) => {
    setEditItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, quantity } : item))
    );
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    const payload = editItems
      .map((item) => ({ itemId: item.itemId, quantity: Math.max(1, item.quantity) }))
      .filter((item) => item.quantity > 0);

    if (payload.length === 0) {
      setError("Orders must contain at least one item.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await api.patch(`/orders/${editingOrder.orderId}`, { items: payload });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update order");
      }
      setEditingOrder(null);
      setEditItems([]);
      await fetchOrders();
    } catch (err: any) {
      console.error("Update order failed:", err);
      setError(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const itemColumns = [
    {
      key: "name",
      header: "Item",
      render: (item: OrderItem) => (
        <div className="flex items-center gap-3">
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name} className="h-10 w-10 rounded object-cover" />
          )}
          <span>{item.name}</span>
        </div>
      ),
    },
    { key: "quantity", header: "Qty" },
    { key: "unitPointCost", header: "Per Item Points" },
    {
      key: "linePoints",
      header: "Total Points",
      render: (item: OrderItem) => item.unitPointCost * item.quantity,
    },
    {
      key: "unitDollarCost",
      header: "Unit Price",
      render: (item: OrderItem) => item.unitDollarCost.toFixed(2),
    },
    {
      key: "lineDollars",
      header: "Total Price",
      render: (item: OrderItem) => (item.unitDollarCost * item.quantity).toFixed(2),
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-blue-100/50 dark:from-[#1e4b8f] dark:to-[#163a6f] p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-3">Your Orders</h1>
            <p className="text-gray-600 dark:text-gray-400">Track recent purchases and update confirmed orders.</p>
          </div>
          <div className="flex items-center gap-2">
            {user.OriginalUser && (
              <Form method="post" action="/exit-assumption">
                <Button variant="primary" size="sm" type="submit">
                  Exit Assumed View
                </Button>
              </Form>
            )}
            <Link to="/driver/catalogs">
              <Button variant="ghost" size="sm">
                Back to Catalog
              </Button>
            </Link>
          </div>
        </div>

        {error && <Alert message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <Card>
            <p className="text-center py-6 text-gray-500">Loading orders...</p>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <p className="text-center py-6 text-gray-500">No orders yet.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order.orderId} className="p-6 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Order #{order.orderId}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {formatOrderDate(order.orderDate)} - {order.sponsorCompanyName || "Sponsor"}
                    </p>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-semibold">Status:</span> {order.orderStatus}
                  </div>
                </div>

                <Table data={order.items} columns={itemColumns} />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-semibold">Total Points:</span> {order.orderPointsSpent} -
                    <span className="font-semibold"> Total $:</span> {order.orderDollarsSpent.toFixed(2)}
                  </div>
                  {order.orderStatus === "confirmed" && (
                    <div className="mt-1 flex gap-2 rounded-lg border border-gray-200 bg-white/70 p-2 dark:border-gray-700 dark:bg-gray-900/60">
                      <Button variant="secondary" size="sm" onClick={() => handleEditOrder(order)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleCancelOrder(order.orderId)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={Boolean(editingOrder)}
        onClose={() => {
          setEditingOrder(null);
          setEditItems([]);
        }}
        title={editingOrder ? `Edit Order #${editingOrder.orderId}` : "Edit Order"}
      >
        {editingOrder && (
          <div className="space-y-4">
            <div className="space-y-3">
              {editItems.map((item) => (
                <div key={item.itemId} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.unitPointCost} pts each</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right"
                    value={item.quantity}
                    onChange={(event) => handleEditQuantity(item.itemId, Number(event.target.value))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setEditingOrder(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
