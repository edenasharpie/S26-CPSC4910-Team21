import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData, Form } from 'react-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/Alert';
import { createApiClient } from '~/utils/api';
import { requireAuth } from '~/utils/session.server';
import type { Route } from './+types/catalogs';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireAuth(request, ['driver']);
  return { user };
}

interface CatalogItem {
  id: number;
  externalProductId?: string;
  name: string;
  originalSource: string;
  description: string;
  pointCost: number;
  imageUrl: string;
}

interface Catalog {
  id: number;
  sponsorCompanyId: number;
  sponsorCompanyName?: string;
  itemCount: number;
}

interface CartItem {
  item: CatalogItem;
  quantity: number;
}

export default function DriverCatalogs() {
  const { user } = useLoaderData<typeof loader>();
  const api = useMemo(() => createApiClient({ id: user.UserID, role: 'driver' }), [user.UserID]);

  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    fetchCatalogs();
  }, []);

  useEffect(() => {
    if (selectedCatalog) {
      fetchCatalogItems(selectedCatalog);
    }
  }, [selectedCatalog]);

  const getCatalogFetchErrorMessage = async (response: Response) => {
    if (response.status >= 500) {
      return 'Failed to fetch catalogs. Please check your catalog connection.';
    }

    try {
      const body = await response.json();
      if (body && typeof body.error === 'string' && body.error.trim().length > 0) {
        return body.error;
      }
    } catch {
      // Ignore non-JSON responses and fall back to generic copy.
    }

    return 'Unable to load catalogs right now.';
  };

  const fetchCatalogs = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await api.get('/catalogs');
      if (!response.ok) {
        setCatalogs([]);
        setError(await getCatalogFetchErrorMessage(response));
        return;
      }
      const data = await response.json();
      console.log('Fetched driver catalogs:', data);
      setCatalogs(data);
    } catch (error) {
      console.error('Error fetching catalogs:', error);
      setError('Unable to load catalogs right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogItems = async (catalogId: number) => {
    try {
      setLoading(true);
      const response = await api.get(`/catalogs/${catalogId}`);
      const data = await response.json();
      setCatalogItems(data.items || []);
    } catch (error) {
      console.error('Error fetching catalog items:', error);
      setError('Failed to fetch catalog items.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewItemDetail = (item: CatalogItem) => {
    setSelectedItem(item);
    setIsItemDetailOpen(true);
  };

  const handleOpenLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setIsLightboxOpen(true);
  };

  const handleAddToCart = (item: CatalogItem) => {
    setCartItems((prev) => {
      const existing = prev.find((entry) => entry.item.id === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.item.id === item.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
    setSuccessMessage(`${item.name} added to cart.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleUpdateCartQuantity = (itemId: number, quantity: number) => {
    setCartItems((prev) =>
      prev
        .map((entry) =>
          entry.item.id === itemId
            ? { ...entry, quantity: Math.max(1, Math.floor(quantity)) }
            : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  };

  const handleRemoveFromCart = (itemId: number) => {
    setCartItems((prev) => prev.filter((entry) => entry.item.id !== itemId));
  };

  const totalPoints = cartItems.reduce(
    (sum, entry) => sum + entry.item.pointCost * entry.quantity,
    0
  );

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    try {
      setPlacingOrder(true);
      setError(null);
      const payload = {
        items: cartItems.map((entry) => ({
          itemId: entry.item.id,
          quantity: entry.quantity,
        })),
      };
      const response = await api.post("/orders", payload);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to place order");
      }
      setCartItems([]);
      setIsCartOpen(false);
      setSuccessMessage("Order placed successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Order failed:", err);
      setError(err.message || "Failed to place order.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const catalogColumns = [
    { key: 'id', header: 'Catalog ID' },
    { 
      key: 'sponsorCompanyName', 
      header: 'Sponsor Company',
      render: (catalog: Catalog) => catalog.sponsorCompanyName || `ID: ${catalog.sponsorCompanyId}`
    },
    { key: 'itemCount', header: 'Item Count' },
    {
      key: 'actions',
      header: 'Actions',
      render: (catalog: Catalog) => (
        <Button
          variant={selectedCatalog === catalog.id ? 'primary' : 'secondary'}
          onClick={() => setSelectedCatalog(catalog.id)}
        >
          {selectedCatalog === catalog.id ? 'Selected' : 'View Items'}
        </Button>
      )
    }
  ];

  const itemColumns = [
    {
      key: 'imageUrl',
      header: 'Image',
      render: (item: CatalogItem) => {
        const itemIndex = catalogItems.indexOf(item);
        return (
          <img 
            src={item.imageUrl} 
            alt={item.name} 
            className="w-16 h-16 object-cover rounded cursor-pointer hover:scale-105 transition-transform" 
            onClick={() => handleOpenLightbox(itemIndex)}
            title="Click to zoom"
          />
        );
      }
    },
    { key: 'name', header: 'Name' },
    { 
      key: 'description', 
      header: 'Description',
      render: (item: CatalogItem) => (
        <div className="max-w-md truncate" title={item.description}>
          {item.description}
        </div>
      )
    },
    { key: 'pointCost', header: 'Point Cost' },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: CatalogItem) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => handleViewItemDetail(item)}>
            View Details
          </Button>
          <Button variant="primary" onClick={() => handleAddToCart(item)}>
            Add to Cart
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">← Home</Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Available Catalogs</h1>
        <div className="flex gap-2">
          {user.OriginalUser && (
            <Form method="post" action="/exit-assumption">
              <Button variant="primary" size="sm" type="submit">Exit Assumed View</Button>
            </Form>
          )}
          <Button variant="secondary" onClick={() => setIsCartOpen(true)}>
            Cart ({cartItems.length})
          </Button>
          <Link to="/driver/orders">
            <Button variant="ghost">View Orders</Button>
          </Link>
          <Form method="post" action="/logout">
            <Button variant="secondary" size="sm" type="submit">Sign out</Button>
          </Form>
        </div>
      </div>

      {/* Error Display */}
      {error && !isCartOpen && (
        <Alert message={error} onDismiss={() => setError(null)} />
      )}

      {successMessage && (
        <Alert variant="success" message={successMessage} onDismiss={() => setSuccessMessage(null)} />
      )}

      {/* Catalogs List */}
      <Card title="Your Sponsor's Catalogs">
        {loading && !selectedCatalog ? (
          <p className="text-center py-4">Loading catalogs...</p>
        ) : catalogs.length === 0 ? (
          <p className="text-center py-4 text-gray-500">No catalogs available</p>
        ) : (
          <Table data={catalogs} columns={catalogColumns} />
        )}
      </Card>

      {/* Catalog Items */}
      {selectedCatalog && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Items in Catalog #{selectedCatalog}</h2>
          <Card>
            {loading ? (
              <p className="text-center py-4">Loading items...</p>
            ) : catalogItems.length === 0 ? (
              <p className="text-center py-4 text-gray-500">No items in this catalog</p>
            ) : (
              <Table data={catalogItems} columns={itemColumns} />
            )}
          </Card>
        </div>
      )}

      {/* Item Detail Modal */}
      <Modal
        isOpen={isItemDetailOpen}
        onClose={() => {
          setIsItemDetailOpen(false);
          setSelectedItem(null);
        }}
        title="Item Details"
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <img 
                src={selectedItem.imageUrl} 
                alt={selectedItem.name} 
                className="max-w-full h-64 object-contain rounded cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  const itemIndex = catalogItems.findIndex(i => i.id === selectedItem.id);
                  handleOpenLightbox(itemIndex >= 0 ? itemIndex : 0);
                }}
                title="Click to zoom"
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
              <p className="text-gray-600 mt-2">{selectedItem.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <span className="font-medium">Point Cost:</span>
                <p className="text-lg text-blue-600">{selectedItem.pointCost} points</p>
              </div>
              {selectedItem.originalSource && (
                <div>
                  <span className="font-medium">Source:</span>
                  <p className="text-sm text-gray-500 truncate" title={selectedItem.originalSource}>
                    {selectedItem.originalSource}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsItemDetailOpen(false);
                    setSelectedItem(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (selectedItem) {
                      handleAddToCart(selectedItem);
                    }
                  }}
                >
                  Add to Cart
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Your Cart"
      >
        <div className="space-y-4">
          {error && (
            <div className="fixed top-4 left-1/2 z-60 w-[min(90vw,40rem)] -translate-x-1/2">
              <Alert message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          {cartItems.length === 0 ? (
            <p className="text-sm text-gray-500">Your cart is empty.</p>
          ) : (
            <div className="space-y-3">
              {cartItems.map((entry) => (
                <div key={entry.item.id} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{entry.item.name}</p>
                    <p className="text-xs text-gray-500">{entry.item.pointCost} pts each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-right"
                      value={entry.quantity}
                      onChange={(event) =>
                        handleUpdateCartQuantity(entry.item.id, Number(event.target.value))
                      }
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveFromCart(entry.item.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4 text-sm">
            <span className="font-semibold">Total Points</span>
            <span>{totalPoints}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCartOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={handlePlaceOrder} disabled={placingOrder}>
              {placingOrder ? "Placing..." : "Place Order"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* image lightbox with zoom */}
      <Lightbox
        open={isLightboxOpen}
        close={() => setIsLightboxOpen(false)}
        slides={catalogItems.map(item => ({
          src: item.imageUrl,
          alt: item.name,
          title: item.name,
          description: `${item.pointCost} points`
        }))}
        index={currentImageIndex}
        plugins={[Zoom]}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true
        }}
        carousel={{
          finite: catalogItems.length <= 1
        }}
        controller={{
          closeOnBackdropClick: true
        }}
      />
    </div>
  );
}
