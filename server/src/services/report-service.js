import { 
  getDriverApplicationReport, 
  getPointTransactionsReport,
  getOrdersReport 
} from '../utils/queries.js';

/**
 * Report type registry
 * Each report type defines its handler function and metadata
 */
const reportRegistry = {
  'driver-applications': {
    id: 'driver-applications',
    name: 'Driver Applications',
    description: 'Report on driver application submissions and status',
    handler: getDriverApplicationReport,
    allowedFilters: ['status', 'startDate', 'endDate', 'sponsorCompanyId', 'driverId'],
    allowedRoles: ['admin', 'sponsor'],
    requiresSponsorCompanyId: true // For sponsor role
  },
  'point-transactions': {
    id: 'point-transactions',
    name: 'Point Transactions',
    description: 'Report on point changes and transactions',
    handler: getPointTransactionsReport,
    allowedFilters: ['startDate', 'endDate', 'driverId', 'reasonForChange'],
    allowedRoles: ['admin', 'sponsor'],
    requiresSponsorCompanyId: false
  },
  'orders': {
    id: 'orders',
    name: 'Orders',
    description: 'Report on driver orders and spending',
    handler: getOrdersReport,
    allowedFilters: ['startDate', 'endDate', 'driverId', 'sponsorCompanyId', 'orderStatus'],
    allowedRoles: ['admin', 'sponsor'],
    requiresSponsorCompanyId: true // For sponsor role
  }
};

/**
 * Get available report types for a specific role
 * @param {string} role - User role (admin, sponsor, driver)
 * @returns {Array} Array of available report types with metadata
 */
export function getAvailableReports(role) {
  return Object.values(reportRegistry)
    .filter(report => report.allowedRoles.includes(role))
    .map(report => ({
      id: report.id,
      name: report.name,
      description: report.description,
      allowedFilters: report.allowedFilters
    }));
}

/**
 * Generate a report based on type and filters
 * @param {string} reportType - Type of report to generate
 * @param {Object} filters - Filter parameters
 * @param {Object} options - Additional options
 * @param {string} options.role - User role making the request
 * @param {number} [options.sponsorCompanyId] - Sponsor company ID (for sponsor users)
 * @returns {Promise<Object>} Report data
 * @throws {Error} If report type is invalid or not allowed for role
 */
export async function generateReport(reportType, filters = {}, options = {}) {
  const report = reportRegistry[reportType];
  
  if (!report) {
    throw new Error(`Invalid report type: ${reportType}`);
  }
  
  // Check role authorization
  if (options.role && !report.allowedRoles.includes(options.role)) {
    throw new Error(`Report type ${reportType} not allowed for role ${options.role}`);
  }
  
  // Inject sponsor company ID for sponsor users if required
  if (options.role === 'sponsor' && report.requiresSponsorCompanyId && options.sponsorCompanyId) {
    filters.sponsorCompanyId = options.sponsorCompanyId;
  }
  
  // Validate filters
  const invalidFilters = Object.keys(filters).filter(key => 
    key !== 'includeDetails' && !report.allowedFilters.includes(key)
  );
  
  if (invalidFilters.length > 0) {
    throw new Error(`Invalid filters for report type ${reportType}: ${invalidFilters.join(', ')}`);
  }
  
  // Generate report using registered handler
  return await report.handler(filters);
}

/**
 * Get report metadata by type
 * @param {string} reportType - Type of report
 * @returns {Object|null} Report metadata or null if not found
 */
export function getReportMetadata(reportType) {
  const report = reportRegistry[reportType];
  if (!report) return null;
  
  return {
    id: report.id,
    name: report.name,
    description: report.description,
    allowedFilters: report.allowedFilters,
    allowedRoles: report.allowedRoles
  };
}
