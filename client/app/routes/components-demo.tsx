import { useState } from "react";
import type { Route } from "./+types/components-demo";
import { Button, Input, Card, Modal, Table, Badge } from "~/components";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Components Demo" }];
}

export default function ComponentsDemo() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /* demo data */
  const sampleData = [
    { id: 1, name: "John Doe", status: "Active" },
    { id: 2, name: "Jane Smith", status: "Inactive" },
  ];

  const columns = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
    {
      key: "status",
      header: "Status",
      render: (item: any) => (
        <Badge variant={item.status === "Active" ? "success" : "default"}>
          {item.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold">Components - Demo</h1>

        <Card title="Buttons">
          <div className="flex gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button isLoading={isLoading} onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 2000);
            }}>
              Click Me
            </Button>
          </div>
        </Card>

        <Card title="Inputs">
          <Input
            label="Test Input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type something..."
          />
        </Card>

        <Card title="Badges">
          <div className="flex gap-2">
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
          </div>
        </Card>

        <Card title="Modal">
          <Button onClick={() => setIsModalOpen(true)}>Open Modal</Button>
        </Card>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Test Modal"
          footer={<Button onClick={() => setIsModalOpen(false)}>Close</Button>}
        >
          <p>Modal content here</p>
        </Modal>

        <Card title="Table">
          <Table data={sampleData} columns={columns} />
        </Card>
      </div>
    </div>
  );
}