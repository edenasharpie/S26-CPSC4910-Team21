import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/Alert';

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

export default function DriverCatalogs() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: Replace with actual user ID from authentication
  const userId = 1; // Placeholder - should come from auth context

  useEffect(() => {
    fetchCatalogs();
  }, []);

  useEffect(() => {
    if (selectedCatalog) {
      fetchCatalogItems(selectedCatalog);
    }
  }, [selectedCatalog]);

  const fetchCatalogs = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/driver/${userId}/catalogs`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Fetched driver catalogs:', data);
      setCatalogs(data);
    } catch (error) {
      console.error('Error fetching catalogs:', error);
      setError('Failed to fetch catalogs. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogItems = async (catalogId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/driver/${userId}/catalogs/${catalogId}`);
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
      render: (item: CatalogItem) => (
        <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded" />
      )
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
        <Button variant="secondary" onClick={() => handleViewItemDetail(item)}>
          View Details
        </Button>
      )
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">← Home</Link>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Available Catalogs</h1>
      </div>

      {/* Error Display */}
      {error && (
        <Alert message={error} onDismiss={() => setError(null)} />
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
                className="max-w-full h-64 object-contain rounded"
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
              <Button 
                variant="secondary" 
                onClick={() => {
                  setIsItemDetailOpen(false);
                  setSelectedItem(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
