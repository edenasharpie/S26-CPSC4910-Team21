import { useEffect, useState } from 'react';
import { Button, Card, Table, Modal, Input } from '~/components';

const BASE_URL = 'http://localhost:5000';

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

interface SponsorCompany {
  id: number;
  companyName: string;
  pointDollarValue: number;
}

interface StoreProduct {
  id: number;
  title: string;
  description: string;
  price: number;
  category: string;
  image: string;
}

export default function Catalogs() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [sponsorCompanies, setSponsorCompanies] = useState<SponsorCompany[]>([]);
  const [isCreateCatalogOpen, setIsCreateCatalogOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(false);

  // Store search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StoreProduct[]>([]);
  const [selectedStoreProduct, setSelectedStoreProduct] = useState<StoreProduct | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [itemSource, setItemSource] = useState<'manual' | 'store'>('manual');

  // Form states
  const [newCatalog, setNewCatalog] = useState({ sponsorCompanyId: '' });
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    pointCost: '',
    imageUrl: '',
    originalSource: 'manual'
  });
  const [editItem, setEditItem] = useState({
    name: '',
    description: '',
    pointCost: '',
    imageUrl: ''
  });

  // Fetch catalogs and sponsor companies on mount
  useEffect(() => {
    fetchCatalogs();
    fetchSponsorCompanies();
  }, []);

  // Fetch items when catalog is selected
  useEffect(() => {
    if (selectedCatalog) {
      fetchCatalogItems(selectedCatalog);
    }
  }, [selectedCatalog]);

  const fetchCatalogs = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/catalogs`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Fetched catalogs:', data);
      setCatalogs(data);
    } catch (error) {
      console.error('Error fetching catalogs:', error);
      alert('Failed to fetch catalogs. Check console for details.');
    }
  };

  const fetchSponsorCompanies = async () => {
    try {
      console.log('Fetching sponsors from:', `${BASE_URL}/api/sponsors`);
      const response = await fetch(`${BASE_URL}/api/sponsors`);
      console.log('Sponsor response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Fetched sponsor companies:', data);
      setSponsorCompanies(data);
    } catch (error) {
      console.error('Error fetching sponsor companies:', error);
      alert('Failed to fetch sponsor companies. Check console for details.');
    }
  };

  const fetchCatalogItems = async (catalogId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/catalogs/${catalogId}`);
      const data = await response.json();
      setCatalogItems(data.items || []);
    } catch (error) {
      console.error('Error fetching catalog items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BASE_URL}/api/catalogs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorCompanyId: parseInt(newCatalog.sponsorCompanyId),
          externalProductIds: [],
          pointCost: 0
        })
      });

      if (response.ok) {
        setIsCreateCatalogOpen(false);
        setNewCatalog({ sponsorCompanyId: '' });
        fetchCatalogs();
      }
    } catch (error) {
      console.error('Error creating catalog:', error);
    }
  };

  const handleSearchStore = async () => {
    try {
      setSearchLoading(true);
      const response = await fetch(`${BASE_URL}/api/store/search?query=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching store:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectStoreProduct = (product: StoreProduct) => {
    setSelectedStoreProduct(product);
    setNewItem({
      name: product.title,
      description: product.description,
      pointCost: '',
      imageUrl: product.image,
      originalSource: `https://fakestoreapi.com/products/${product.id}`
    });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalog) return;

    try {
      const payload = itemSource === 'store' && selectedStoreProduct
        ? {
            externalProductId: selectedStoreProduct.id.toString(),
            pointCost: parseFloat(newItem.pointCost)
          }
        : {
            name: newItem.name,
            description: newItem.description,
            pointCost: parseFloat(newItem.pointCost),
            imageUrl: newItem.imageUrl,
            originalSource: newItem.originalSource
          };

      const response = await fetch(`${BASE_URL}/api/catalogs/${selectedCatalog}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsAddItemOpen(false);
        setNewItem({
          name: '',
          description: '',
          pointCost: '',
          imageUrl: '',
          originalSource: 'manual'
        });
        setSearchQuery('');
        setSearchResults([]);
        setSelectedStoreProduct(null);
        setItemSource('manual');
        fetchCatalogItems(selectedCatalog);
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalog || !selectedItem) return;

    try {
      const response = await fetch(`${BASE_URL}/api/catalogs/${selectedCatalog}/items/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editItem.name,
          description: editItem.description,
          pointCost: parseFloat(editItem.pointCost),
          imageUrl: editItem.imageUrl
        })
      });

      if (response.ok) {
        setIsEditItemOpen(false);
        setSelectedItem(null);
        fetchCatalogItems(selectedCatalog);
      }
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!selectedCatalog || !confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(`${BASE_URL}/api/catalogs/${selectedCatalog}/items/${itemId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchCatalogItems(selectedCatalog);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const handleDeleteCatalog = async (catalogId: number) => {
    if (!confirm('Are you sure you want to delete this catalog? This will delete all items.')) return;

    try {
      const response = await fetch(`${BASE_URL}/api/catalogs/${catalogId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (selectedCatalog === catalogId) {
          setSelectedCatalog(null);
          setCatalogItems([]);
        }
        fetchCatalogs();
      }
    } catch (error) {
      console.error('Error deleting catalog:', error);
    }
  };

  const openEditModal = (item: CatalogItem) => {
    setSelectedItem(item);
    setEditItem({
      name: item.name,
      description: item.description,
      pointCost: item.pointCost.toString(),
      imageUrl: item.imageUrl
    });
    setIsEditItemOpen(true);
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
        <div className="flex gap-2">
          <Button
            variant={selectedCatalog === catalog.id ? 'primary' : 'secondary'}
            onClick={() => setSelectedCatalog(catalog.id)}
          >
            {selectedCatalog === catalog.id ? 'Selected' : 'View Items'}
          </Button>
          <Button variant="danger" onClick={() => handleDeleteCatalog(catalog.id)}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  const itemColumns = [
    {
      key: 'imageUrl',
      header: 'Image',
      render: (item: CatalogItem) => (
        <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded" />
      )
    },
    { key: 'name', header: 'Name' },
    { key: 'description', header: 'Description' },
    { key: 'pointCost', header: 'Point Cost' },
    { key: 'originalSource', header: 'Source' },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: CatalogItem) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => openEditModal(item)}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => handleDeleteItem(item.id)}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Catalog Management</h1>
        <Button variant="primary" onClick={() => setIsCreateCatalogOpen(true)}>
          Create Catalog
        </Button>
      </div>

      {/* Catalogs List */}
      <Card title="All Catalogs">
        <Table data={catalogs} columns={catalogColumns} />
      </Card>

      {/* Catalog Items */}
      {selectedCatalog && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Items in Catalog #{selectedCatalog}</h2>
            <Button variant="primary" onClick={() => setIsAddItemOpen(true)}>
              Add Item
            </Button>
          </div>
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

      {/* Create Catalog Modal */}
      <Modal
        isOpen={isCreateCatalogOpen}
        onClose={() => setIsCreateCatalogOpen(false)}
        title="Create New Catalog"
      >
        <form onSubmit={handleCreateCatalog} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Sponsor Company <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={newCatalog.sponsorCompanyId}
              onChange={(e) => setNewCatalog({ sponsorCompanyId: e.target.value })}
              required
            >
              <option value="">Select a sponsor company</option>
              {sponsorCompanies.map((sponsor) => (
                <option key={sponsor.id} value={sponsor.id}>
                  {sponsor.companyName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setIsCreateCatalogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        isOpen={isAddItemOpen}
        onClose={() => {
          setIsAddItemOpen(false);
          setSearchQuery('');
          setSearchResults([]);
          setSelectedStoreProduct(null);
          setItemSource('manual');
        }}
        title="Add Item to Catalog"
      >
        <div className="space-y-4">
          {/* Source Selection */}
          <div className="flex gap-4 mb-4">
            <Button
              variant={itemSource === 'manual' ? 'primary' : 'secondary'}
              onClick={() => {
                setItemSource('manual');
                setSelectedStoreProduct(null);
                setNewItem({
                  name: '',
                  description: '',
                  pointCost: '',
                  imageUrl: '',
                  originalSource: 'manual'
                });
              }}
            >
              Manual Entry
            </Button>
            <Button
              variant={itemSource === 'store' ? 'primary' : 'secondary'}
              onClick={() => setItemSource('store')}
            >
              Search Store
            </Button>
          </div>

          {/* Store Search Section */}
          {itemSource === 'store' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  label="Search Products"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter product name or category..."
                />
                <Button
                  variant="primary"
                  onClick={handleSearchStore}
                  disabled={searchLoading}
                  style={{ marginTop: '24px' }}
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold mb-2">Search Results:</h3>
                  <div className="space-y-2">
                    {searchResults.map((product) => (
                      <div
                        key={product.id}
                        className={`border rounded p-3 cursor-pointer transition ${
                          selectedStoreProduct?.id === product.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-300'
                        }`}
                        onClick={() => handleSelectStoreProduct(product)}
                      >
                        <div className="flex gap-3">
                          <img
                            src={product.image}
                            alt={product.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div className="flex-1">
                            <h4 className="font-medium">{product.title}</h4>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {product.description}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Category: {product.category} | Price: ${product.price}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedStoreProduct && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Selected Product:</h3>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="font-medium">{selectedStoreProduct.title}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Item Form */}
          <form onSubmit={handleAddItem} className="space-y-4">
            {itemSource === 'manual' && (
              <>
                <Input
                  label="Item Name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  required
                />
                <Input
                  label="Description"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  required
                />
                <Input
                  label="Image URL"
                  value={newItem.imageUrl}
                  onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })}
                  required
                />
              </>
            )}

            <Input
              label="Point Cost"
              type="number"
              step="0.01"
              value={newItem.pointCost}
              onChange={(e) => setNewItem({ ...newItem, pointCost: e.target.value })}
              required
            />

            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsAddItemOpen(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedStoreProduct(null);
                  setItemSource('manual');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={itemSource === 'store' && !selectedStoreProduct}
              >
                Add Item
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        isOpen={isEditItemOpen}
        onClose={() => setIsEditItemOpen(false)}
        title="Edit Item"
      >
        <form onSubmit={handleEditItem} className="space-y-4">
          <Input
            label="Item Name"
            value={editItem.name}
            onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
            required
          />
          <Input
            label="Description"
            value={editItem.description}
            onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
            required
          />
          <Input
            label="Point Cost"
            type="number"
            step="0.01"
            value={editItem.pointCost}
            onChange={(e) => setEditItem({ ...editItem, pointCost: e.target.value })}
            required
          />
          <Input
            label="Image URL"
            value={editItem.imageUrl}
            onChange={(e) => setEditItem({ ...editItem, imageUrl: e.target.value })}
            required
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setIsEditItemOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Update
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}