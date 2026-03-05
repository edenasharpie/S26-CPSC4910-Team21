import express from 'express';
import { getAvailableReports, generateReport } from '../services/report-service.js';
import { generateReportPDF } from '../utils/pdf-generator.js';

const router = express.Router();

// GET /admin/reports/types - Get available report types for admins
router.get('/types', async (req, res) => {
  try {
    const reportTypes = getAvailableReports('admin');
    res.json({ types: reportTypes });
  } catch (error) {
    console.error('Error fetching report types:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /admin/reports/:reportType - Generate a report (generic endpoint)
router.get('/:reportType', async (req, res) => {
  try {
    const reportType = req.params.reportType;
    
    // Parse query parameters
    const filters = {};
    
    // Common filters
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.includeDetails) filters.includeDetails = req.query.includeDetails === 'true';
    
    // Report-specific filters
    if (req.query.status) filters.status = req.query.status;
    if (req.query.driverId) filters.driverId = req.query.driverId;
    if (req.query.orderStatus) filters.orderStatus = req.query.orderStatus;
    if (req.query.reasonForChange) filters.reasonForChange = req.query.reasonForChange;
    
    if (req.query.sponsorCompanyId) {
      const sponsorCompanyId = parseInt(req.query.sponsorCompanyId);
      if (isNaN(sponsorCompanyId)) {
        return res.status(400).json({ 
          error: 'Invalid sponsorCompanyId. Must be a valid integer' 
        });
      }
      filters.sponsorCompanyId = sponsorCompanyId;
    }

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

    // Generate report using report service
    const report = await generateReport(reportType, filters, { role: 'admin' });

    res.json(report);
  } catch (error) {
    if (error.message.includes('Invalid report type')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Invalid filters')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /admin/reports/export - Export report to PDF
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
