import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Card, Button, Table, Badge, Alert } from '~/components';

const BASE_URL = 'http://localhost:5000';
// TODO: Replace with actual user ID from authentication
const CURRENT_USER_ID = 1;

interface ReportType {
  id: string;
  name: string;
  description: string;
  allowedFilters: string[];
}

interface ReportData {
  // Common fields
  dateRangeStart?: string;
  dateRangeEnd?: string;
  
  // Driver Applications
  totalApplications?: number;
  pendingCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  
  // Point Transactions
  totalTransactions?: number;
  totalPointsAdded?: number;
  totalPointsDeducted?: number;
  netPointChange?: number;
  
  // Orders
  totalOrders?: number;
  totalPointsSpent?: number;
  totalDollarsSpent?: number;
  confirmedCount?: number;
  shippedCount?: number;
  deliveredCount?: number;
  cancelledCount?: number;
  
  // Detailed records
  detailedRecords?: any[];
}

export default function SponsorReports() {
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [selectedReportType, setSelectedReportType] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Fetch available report types on mount
  useEffect(() => {
    fetchReportTypes();
  }, []);

  const fetchReportTypes = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/sponsor/${CURRENT_USER_ID}/reports/types`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setReportTypes(data.types || []);
      // Set first report type as default
      if (data.types && data.types.length > 0) {
        setSelectedReportType(data.types[0].id);
      }
    } catch (error: any) {
      console.error('Error fetching report types:', error);
      setError('Failed to load report types. Please refresh the page.');
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedReportType) {
      setError('Please select a report type');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setReportData(null);

      // Build query string from filters
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
      // Always include detailed records
      queryParams.append('includeDetails', 'true');

      const response = await fetch(
        `${BASE_URL}/api/sponsor/${CURRENT_USER_ID}/reports/${selectedReportType}?${queryParams.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setReportData(data);
    } catch (error: any) {
      console.error('Error generating report:', error);
      setError(error.message || 'Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportData || !selectedReportType) return;

    try {
      setExporting(true);
      const response = await fetch(`${BASE_URL}/api/sponsor/${CURRENT_USER_ID}/reports/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType: selectedReportType,
          reportData: reportData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedReportType}-report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      setError(error.message || 'Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleReportTypeChange = (type: string) => {
    setSelectedReportType(type);
    setFilters({});
    setReportData(null);
  };

  const selectedReport = reportTypes.find(rt => rt.id === selectedReportType);

  // Sponsors have limited filters (no driverId, sponsorCompanyId, or reasonForChange)
  const allowedSponsorFilters = ['startDate', 'endDate', 'status', 'orderStatus'];

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6 block"
      >
        ← Home
      </Link>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-gray-600">Generate and export reports for your company</p>
      </div>

      {error && (
        <Alert
          variant="error"
          title="Error"
          message={error}
          dismissible
          onDismiss={() => setError(null)}
        />
      )}

      {/* Report Type Selector */}
      <Card className="mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedReportType}
              onChange={(e) => handleReportTypeChange(e.target.value)}
            >
              {reportTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {selectedReport && (
              <p className="mt-1 text-sm text-gray-500">{selectedReport.description}</p>
            )}
          </div>

          {/* Dynamic Filters (limited for sponsors) */}
          {selectedReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              {selectedReport.allowedFilters.includes('startDate') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </div>
              )}

              {selectedReport.allowedFilters.includes('endDate') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </div>
              )}

              {selectedReport.allowedFilters.includes('status') && allowedSponsorFilters.includes('status') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Application Status
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.status || ''}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}

              {selectedReport.allowedFilters.includes('orderStatus') && allowedSponsorFilters.includes('orderStatus') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Order Status
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.orderStatus || ''}
                    onChange={(e) => handleFilterChange('orderStatus', e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="primary"
              onClick={handleGenerateReport}
              isLoading={loading}
            >
              Generate Report
            </Button>
            {reportData && (
              <Button
                variant="secondary"
                onClick={handleExportPDF}
                isLoading={exporting}
              >
                Export to PDF
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      {reportData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Driver Applications Summary */}
            {reportData.totalApplications !== undefined && (
              <>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Total Applications</h3>
                  <p className="text-3xl font-bold text-gray-900">{reportData.totalApplications}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Pending</h3>
                  <p className="text-3xl font-bold text-yellow-600">{reportData.pendingCount}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Accepted</h3>
                  <p className="text-3xl font-bold text-green-600">{reportData.acceptedCount}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Rejected</h3>
                  <p className="text-3xl font-bold text-red-600">{reportData.rejectedCount}</p>
                </Card>
              </>
            )}

            {/* Point Transactions Summary */}
            {reportData.totalTransactions !== undefined && (
              <>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Total Transactions</h3>
                  <p className="text-3xl font-bold text-gray-900">{reportData.totalTransactions}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Points Added</h3>
                  <p className="text-3xl font-bold text-green-600">+{reportData.totalPointsAdded}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Points Deducted</h3>
                  <p className="text-3xl font-bold text-red-600">-{reportData.totalPointsDeducted}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Net Change</h3>
                  <p className={`text-3xl font-bold ${(reportData.netPointChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(reportData.netPointChange || 0) >= 0 ? '+' : ''}{reportData.netPointChange}
                  </p>
                </Card>
              </>
            )}

            {/* Orders Summary */}
            {reportData.totalOrders !== undefined && (
              <>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Total Orders</h3>
                  <p className="text-3xl font-bold text-gray-900">{reportData.totalOrders}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Points Spent</h3>
                  <p className="text-3xl font-bold text-blue-600">{reportData.totalPointsSpent}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Dollars Spent</h3>
                  <p className="text-3xl font-bold text-green-600">${reportData.totalDollarsSpent?.toFixed(2)}</p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Delivered</h3>
                  <p className="text-3xl font-bold text-green-600">{reportData.deliveredCount}</p>
                </Card>
              </>
            )}
          </div>

          {/* Detailed Records Table */}
          {reportData.detailedRecords && reportData.detailedRecords.length > 0 && (
            <Card title="Detailed Records">
              <Table
                data={reportData.detailedRecords}
                columns={getTableColumns(selectedReportType)}
                isLoading={false}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function getTableColumns(reportType: string) {
  switch (reportType) {
    case 'driver-applications':
      return [
        { key: 'ApplicationID', header: 'Application ID' },
        { key: 'DriverID', header: 'Driver ID' },
        {
          key: 'ApplicationStatus',
          header: 'Status',
          render: (item: any) => {
            const variant = 
              item.ApplicationStatus === 'pending' ? 'warning' :
              item.ApplicationStatus === 'accepted' ? 'success' : 'danger';
            return <Badge variant={variant}>{item.ApplicationStatus}</Badge>;
          }
        },
        {
          key: 'TimeSubmitted',
          header: 'Submitted',
          render: (item: any) => item.TimeSubmitted ? new Date(item.TimeSubmitted).toLocaleDateString() : 'N/A'
        },
      ];

    case 'point-transactions':
      return [
        { key: 'TransactionID', header: 'Transaction ID' },
        { key: 'DriverID', header: 'Driver ID' },
        {
          key: 'PointChange',
          header: 'Point Change',
          render: (item: any) => {
            const change = item.PointChange || 0;
            const color = change >= 0 ? 'text-green-600' : 'text-red-600';
            return <span className={`font-semibold ${color}`}>{change >= 0 ? '+' : ''}{change}</span>;
          }
        },
        { key: 'ReasonForChange', header: 'Reason' },
        {
          key: 'TimeChanged',
          header: 'Date',
          render: (item: any) => item.TimeChanged ? new Date(item.TimeChanged).toLocaleDateString() : 'N/A'
        },
      ];

    case 'orders':
      return [
        { key: 'OrderID', header: 'Order ID' },
        { key: 'DriverID', header: 'Driver ID' },
        { key: 'OrderPointsSpent', header: 'Points Spent' },
        {
          key: 'OrderDollarsSpent',
          header: 'Dollars Spent',
          render: (item: any) => `$${parseFloat(item.OrderDollarsSpent || 0).toFixed(2)}`
        },
        {
          key: 'OrderStatus',
          header: 'Status',
          render: (item: any) => {
            const variant = 
              item.OrderStatus === 'confirmed' ? 'info' :
              item.OrderStatus === 'shipped' ? 'warning' :
              item.OrderStatus === 'delivered' ? 'success' : 'danger';
            return <Badge variant={variant}>{item.OrderStatus}</Badge>;
          }
        },
        {
          key: 'OrderDate',
          header: 'Order Date',
          render: (item: any) => item.OrderDate ? new Date(item.OrderDate).toLocaleDateString() : 'N/A'
        },
      ];

    default:
      return [];
  }
}
