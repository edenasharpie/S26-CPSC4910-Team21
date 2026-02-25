import { useState } from "react";
import type { Route } from "./+types/components-demo";
import { Button, Input, Card, Modal, Table, Badge, Alert } from "~/components";

// metadata?
export function meta({}: Route.MetaArgs) {
  return [
    { title: "FleetScore - Components" },
    { name: "description", content: "Showcase of reusable UI components in React with Tailwind CSS" },
  ];
}

export default function ComponentsDemo() {
  // state for modal visibility, input value, loading states, etc
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sampleData = [
    { id: 1, name: "John Doe", role: "Driver", status: "Active" },
    { id: 2, name: "Jane Smith", role: "Sponsor", status: "Active" },
    { id: 3, name: "Bob Wilson", role: "Admin", status: "Inactive" },
  ];

  // define columns for the table
  const columns = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
    { key: "role", header: "Role" },
    {
      key: "status",
      header: "Status",
      render: (item: any) => (
        // active status gets a green badge, inactive default
        <Badge variant={item.status === "Active" ? "success" : "default"}>
          {item.status}
        </Badge>
      ),
    },
  ];

  // button handler
  const handleButtonClick = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  // input handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.length > 0 && value.length < 3) {
      setInputError("Must be at least 3 characters");
    } else {
      setInputError("");
    }
  };

  return (
    // main container
    <div className="min-h-screen container-padding section-spacing">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* header */}
        <div>
          <h1>FleetScore - Components</h1>
          <p className="mt-2">
            Showcase of reusable UI components in React with Tailwind CSS.
          </p>
        </div>

        {/* buttons */}
        <Card title="Buttons" variant="elevated">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Variants
              </h4>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sizes
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                States
              </h4>
              <div className="flex flex-wrap gap-3">
                <Button disabled>Disabled</Button>
                <Button isLoading={isLoading} onClick={handleButtonClick}>
                  {isLoading ? "Loading..." : "Click to Load"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* inputs */}
        <Card title="Inputs" variant="elevated">
          <div className="space-y-4">
            <Input
              type="text"
              label="Basic Input"
              placeholder="Enter text..."
              helperText="This is a helper text"
            />
            <Input
              type="text"
              label="Validated Input"
              value={inputValue}
              onChange={handleInputChange}
              error={inputError}
              placeholder="Type at least 3 characters"
            />
            <Input
              type="text"
              label="Disabled Input"
              disabled
              placeholder="Can't type here"
              defaultValue="Disabled value"
            />
            <Input
              type="email"
              label="Email Input"
              placeholder="driver@example.com"
            />
            <Input
              type="password"
              label="Password Input"
              placeholder="Enter password"
            />
          </div>
        </Card>

        {/* badges */}
        <Card title="Badges" variant="elevated">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Variants
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="info">Info</Badge>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sizes
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="sm">Small</Badge>
                <Badge size="md">Medium</Badge>
                <Badge size="lg">Large</Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* table */}
        <Card title="Table" variant="elevated">
          <Table
            data={sampleData}
            columns={columns}
            onRowClick={(item) => alert(`Clicked: ${item.name} (${item.role})`)}
          />
        </Card>

        {/* card variants */}
        <div>
          <h2 className="mb-4">Card Variants</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Default Card" variant="default">
              <p>Content</p>
            </Card>
            <Card title="Bordered Card" variant="bordered">
              <p>Content</p>
            </Card>
            <Card
              title="Elevated Card"
              variant="elevated"
              footer={<Button variant="ghost" size="sm">Action</Button>}
            >
              <p>Content</p>
            </Card>
          </div>
        </div>

        {/* loading states */}
        <Card title="Loading States" variant="elevated">
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Skeleton Loaders
              </h4>
              <div className="space-y-2">
                <div className="skeleton h-4 w-3/4"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-5/6"></div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Table Loading
              </h4>
              <Table data={[]} columns={columns} isLoading={true} />
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Empty State
              </h4>
              <Table
                data={[]}
                columns={columns}
                emptyMessage="Empty table content"
              />
            </div>
          </div>
        </Card>

        {/* error/notification alerts */}
        <Card title="Alert & Notification Components" variant="elevated">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Alert Variants
              </h4>
              <div className="space-y-3">
                <Alert 
                  variant="error"
                  title="Server Error"
                  message="Failed to connect to the server. Please try again later."
                />
                <Alert 
                  variant="warning"
                  title="Warning"
                  message="Your session will expire in 5 minutes."
                />
                <Alert 
                  variant="info"
                  message="New features are available! Check them out."
                />
                <Alert 
                  variant="success"
                  message="Changes saved successfully!"
                />
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Non-dismissible Alert
              </h4>
              <Alert 
                variant="error"
                message="Critical system error - contact support"
                dismissible={false}
              />
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                With Error Object (simulated)
              </h4>
              <Alert 
                error={{
                  message: "Network request failed",
                  status: 500
                }}
              />
            </div>
          </div>
        </Card>

        {/* gradients */}
        <Card title="Gradients" variant="elevated">
          <div className="space-y-4">
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="gradient-primary h-16 rounded-lg flex items-center justify-center text-white text-sm">
                  Primary
                </div>
                <div className="gradient-success h-16 rounded-lg flex items-center justify-center text-white text-sm">
                  Success
                </div>
                <div className="gradient-warning h-16 rounded-lg flex items-center justify-center text-white text-sm">
                  Warning
                </div>
                <div className="gradient-danger h-16 rounded-lg flex items-center justify-center text-white text-sm">
                  Danger
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}