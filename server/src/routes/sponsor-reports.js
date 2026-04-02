import express from 'express';
import { pool } from '../db.js';
import { 
  getAvailableReports,
  generateReport
} from '../services/report-service.js';
import { 
  getSponsorCompanyId,
  listGeneratedReportsForSponsor,
  getGeneratedReportByIdForSponsor,
} from '../utils/queries.js';
import { generateReportPDF } from '../utils/pdf-generator.js';

const router = express.Router({ mergeParams: true });

// Middleware to validate sponsor user and get sponsor company ID
async function validateSponsorAndGetCompanyId(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const [userRows] = await pool.execute(
      'SELECT UserID, UserType, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get sponsor's company ID
    const sponsorCompanyId = await getSponsorCompanyId(userId);
    if (!sponsorCompanyId) {
      return res.status(403).json({ 
        error: 'Access forbidden: User is not a sponsor' 
      });
    }

    // Attach to request for use in route handlers
    req.sponsorCompanyId = sponsorCompanyId;
    next();
  } catch (error) {
    console.error('Error validating sponsor:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Apply middleware to all routes
router.use(validateSponsorAndGetCompanyId);

// GET /sponsor/:userId/reports/generated - List generated daily reports for this sponsor company
router.get('/generated', async (req, res) => {
  try {
    const allowedTypes = ['driver-applications', 'point-transactions', 'orders'];
    const reportType = req.query.reportType;

    if (reportType && !allowedTypes.includes(reportType)) {
      return res.status(400).json({
        error: 'Invalid reportType. Must be one of: driver-applications, point-transactions, orders',
      });
    }

    if (req.query.startDate && isNaN(Date.parse(req.query.startDate))) {
      return res.status(400).json({
        error: 'Invalid startDate format. Must be ISO 8601 datetime or date',
      });
    }

    if (req.query.endDate && isNaN(Date.parse(req.query.endDate))) {
      return res.status(400).json({
        error: 'Invalid endDate format. Must be ISO 8601 datetime or date',
      });
    }

    const limit = Number.parseInt(req.query.limit, 10);
    const offset = Number.parseInt(req.query.offset, 10);

    if (req.query.limit && (Number.isNaN(limit) || limit < 1 || limit > 200)) {
      return res.status(400).json({ error: 'Invalid limit. Must be between 1 and 200' });
    }

    if (req.query.offset && (Number.isNaN(offset) || offset < 0)) {
      return res.status(400).json({ error: 'Invalid offset. Must be zero or greater' });
    }

    const reports = await listGeneratedReportsForSponsor(req.sponsorCompanyId, {
      reportType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: Number.isInteger(limit) ? limit : 20,
      offset: Number.isInteger(offset) ? offset : 0,
    });

    res.json(reports);
  } catch (error) {
    console.error('Error listing generated reports:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /sponsor/:userId/reports/generated/:reportId/download - Download generated daily report PDF
router.get('/generated/:reportId/download', async (req, res) => {
  try {
    const reportId = Number.parseInt(req.params.reportId, 10);

    if (Number.isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid reportId' });
    }

    const generatedReport = await getGeneratedReportByIdForSponsor(reportId, req.sponsorCompanyId);

    if (!generatedReport) {
      return res.status(404).json({ error: 'Generated report not found' });
    }

    if (generatedReport.GenerationStatus !== 'success' || !generatedReport.ReportPayload) {
      return res.status(400).json({
        error: 'Generated report is not available for download',
      });
    }

    const pdfBuffer = await generateReportPDF(generatedReport.ReportType, generatedReport.ReportPayload, {
      reportDate: generatedReport.ReportDate,
      generatedAt: generatedReport.GeneratedAt,
      source: 'daily-generated',
    });

    const safeDate = String(generatedReport.ReportDate).slice(0, 10);
    const filename = `${generatedReport.ReportType}-daily-${safeDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading generated report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /sponsor/:userId/reports/types - Get available report types for sponsors
router.get('/types', async (req, res) => {
  try {
    const reportTypes = getAvailableReports('sponsor');
    res.json({ types: reportTypes });
  } catch (error) {
    console.error('Error fetching report types:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /sponsor/:userId/reports/:reportType - Generate a report (generic endpoint)
router.get('/:reportType', async (req, res) => {
  try {
    const reportType = req.params.reportType;
    
    // Parse query parameters (sponsor cannot override sponsorCompanyId)
    const filters = {};
    
    // Common filters
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.includeDetails) filters.includeDetails = req.query.includeDetails === 'true';
    
    // Report-specific filters (limited for sponsors)
    if (req.query.status) filters.status = req.query.status;
    if (req.query.orderStatus) filters.orderStatus = req.query.orderStatus;
    
    // Sponsors cannot filter by driverId or reasonForChange for security
    // They also cannot specify sponsorCompanyId - it's enforced by middleware

    // Validate status enum for driver applications
    if (filters.status && !['pending', 'accepted', 'rejected'].includes(filters.status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be one of: pending, accepted, rejected' 
      });
    }

    // Validate orderStatus enum for orders
    if (filters.orderStatus && !['confirmed', 'shipped', 'delivered', 'cancelled'].includes(filters.orderStatus)) {
      return res.status(400).json({ 
        error: 'Invalid orderStatus. Must be one of: confirmed, shipped, delivered, cancelled' 
      });
    }

    // Validate date formats if provided
    if (filters.startDate && isNaN(Date.parse(filters.startDate))) {
      return res.status(400).json({ 
        error: 'Invalid startDate format. Must be ISO 8601 datetime' 
      });
    }

    if (filters.endDate && isNaN(Date.parse(filters.endDate))) {
      return res.status(400).json({ 
        error: 'Invalid endDate format. Must be ISO 8601 datetime' 
      });
    }

    // Generate report using report service with sponsor company ID injection
    const report = await generateReport(reportType, filters, { 
      role: 'sponsor',
      sponsorCompanyId: req.sponsorCompanyId 
    });

    // Remove sensitive fields from response that sponsor shouldn't see
    delete report.sponsorCompanyId;
    delete report.driverId;

    res.json(report);
  } catch (error) {
    if (error.message.includes('Invalid report type')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Invalid filters') || error.message.includes('not allowed')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /sponsor/:userId/reports/export - Export report to PDF
router.post('/export', async (req, res) => {
  try {
    const { reportType, reportData } = req.body;

    if (!reportType || !reportData) {
      return res.status(400).json({ 
        error: 'Missing required fields: reportType, reportData' 
      });
    }

    // Generate PDF
    const pdfBuffer = await generateReportPDF(reportType, reportData);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
