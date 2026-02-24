import { useEffect, useState } from 'react';
import { Button, Card, Table, Modal, Input } from '~/components';

const BASE_URL = 'https://localhost:5000';

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
  itemCount: number;
}

export default function Catalogs() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [isCreateCatalogOpen, setIsCreateCatalogOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Fetch catalogs
  useEffect(() => {
    fetchCatalogs();
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
      const data = await response.json();
      setCatalogs(data);
    } catch (error) {
      console.error('Error fetching catalogs:', error);
    }
  };

  const fetchCatalogItems = async (catalogId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/catalogs/${catalogId}/items`);
      const data = await response.json();
      setCatalogItems(data);
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

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalog) return;

    try {
      const response = await fetch(`${BASE_URL}/api/catalogs/${selectedCatalog}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          pointCost: parseFloat(newItem.pointCost)
        })
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
    { header: 'Catalog ID', accessor: 'id' as const },
    { header: 'Sponsor Company ID', accessor: 'sponsorCompanyId' as const },
    { header: 'Item Count', accessor: 'itemCount' as const },
    {
      header: 'Actions',
      accessor: 'id' as const,
      cell: (catalog: Catalog) => (
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
      header: 'Image',
      accessor: 'imageUrl' as const,
      cell: (item: CatalogItem) => (
        <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded" />
      )
    },
    { header: 'Name', accessor: 'name' as const },
    { header: 'Description', accessor: 'description' as const },
    { header: 'Point Cost', accessor: 'pointCost' as const },
    { header: 'Source', accessor: 'originalSource' as const },
    {
      header: 'Actions',
      accessor: 'id' as const,
      cell: (item: CatalogItem) => (
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
        <Card 
          title={`Items in Catalog #${selectedCatalog}`}
          actions={
            <Button variant="primary" onClick={() => setIsAddItemOpen(true)}>
              Add Item
            </Button>
          }
        >
          {loading ? (
            <p className="text-center py-4">Loading items...</p>
          ) : catalogItems.length === 0 ? (
            <p className="text-center py-4 text-gray-500">No items in this catalog</p>
          ) : (
            <Table data={catalogItems} columns={itemColumns} />
          )}
        </Card>
      )}

      {/* Create Catalog Modal */}
      <Modal
        isOpen={isCreateCatalogOpen}
        onClose={() => setIsCreateCatalogOpen(false)}
        title="Create New Catalog"
      >
        <form onSubmit={handleCreateCatalog} className="space-y-4">
          <Input
            label="Sponsor Company ID"
            type="number"
            value={newCatalog.sponsorCompanyId}
            onChange={(e) => setNewCatalog({ sponsorCompanyId: e.target.value })}
            required
          />
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
        onClose={() => setIsAddItemOpen(false)}
        title="Add Item to Catalog"
      >
        <form onSubmit={handleAddItem} className="space-y-4">
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
            label="Point Cost"
            type="number"
            step="0.01"
            value={newItem.pointCost}
            onChange={(e) => setNewItem({ ...newItem, pointCost: e.target.value })}
            required
          />
          <Input
            label="Image URL"
            value={newItem.imageUrl}
            onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })}
            required
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setIsAddItemOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add Item
            </Button>
          </div>
        </form>
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