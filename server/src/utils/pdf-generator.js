import PDFDocument from 'pdfkit';

/**
 * Generate a PDF buffer for a report
 * @param {string} reportType - Type of report
 * @param {Object} reportData - Report data including summary and details
 * @param {Object} metadata - Additional metadata (title, date, etc.)
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateReportPDF(reportType, reportData, metadata = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      // Collect PDF data into buffers
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Generate PDF based on report type
      switch (reportType) {
        case 'driver-applications':
          generateDriverApplicationsPDF(doc, reportData, metadata);
          break;
        case 'point-transactions':
          generatePointTransactionsPDF(doc, reportData, metadata);
          break;
        case 'orders':
          generateOrdersPDF(doc, reportData, metadata);
          break;
        default:
          doc.text(`Report type "${reportType}" not supported for PDF export.`);
      }

      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Driver Applications Report PDF
 */
function generateDriverApplicationsPDF(doc, reportData, metadata) {
  // Header
  doc.fontSize(20).text('Driver Applications Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Filter information
  if (reportData.dateRangeStart || reportData.dateRangeEnd) {
    doc.fontSize(12).text('Filters:', { underline: true });
    if (reportData.dateRangeStart) {
      doc.fontSize(10).text(`Start Date: ${new Date(reportData.dateRangeStart).toLocaleDateString()}`);
    }
    if (reportData.dateRangeEnd) {
      doc.fontSize(10).text(`End Date: ${new Date(reportData.dateRangeEnd).toLocaleDateString()}`);
    }
    doc.moveDown();
  }

  // Summary statistics
  doc.fontSize(14).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Applications: ${reportData.totalApplications}`);
  doc.text(`Pending: ${reportData.pendingCount}`, { indent: 20 });
  doc.text(`Accepted: ${reportData.acceptedCount}`, { indent: 20 });
  doc.text(`Rejected: ${reportData.rejectedCount}`, { indent: 20 });
  doc.moveDown(2);

  // Detailed records table
  if (reportData.detailedRecords && reportData.detailedRecords.length > 0) {
    doc.fontSize(14).text('Detailed Records', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    // Table header
    const tableTop = doc.y;
    const colWidths = { id: 80, driver: 80, sponsor: 80, status: 70, submitted: 100 };
    let x = 50;

    doc.text('Application ID', x, tableTop);
    x += colWidths.id;
    doc.text('Driver ID', x, tableTop);
    x += colWidths.driver;
    doc.text('Sponsor ID', x, tableTop);
    x += colWidths.sponsor;
    doc.text('Status', x, tableTop);
    x += colWidths.status;
    doc.text('Submitted', x, tableTop);

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    reportData.detailedRecords.forEach((record, i) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9);
      }

      x = 50;
      const y = doc.y;
      doc.text(record.ApplicationID || 'N/A', x, y, { width: colWidths.id - 5 });
      x += colWidths.id;
      doc.text(record.DriverID || 'N/A', x, y, { width: colWidths.driver - 5 });
      x += colWidths.driver;
      doc.text(record.SponsorCompanyID || 'N/A', x, y, { width: colWidths.sponsor - 5 });
      x += colWidths.sponsor;
      doc.text(record.ApplicationStatus || 'N/A', x, y, { width: colWidths.status - 5 });
      x += colWidths.status;
      doc.text(
        record.TimeSubmitted ? new Date(record.TimeSubmitted).toLocaleDateString() : 'N/A',
        x,
        y,
        { width: colWidths.submitted - 5 }
      );
      doc.moveDown();
    });
  }

  // Footer
  doc.fontSize(8).text('End of Report', { align: 'center' });
}

/**
 * Generate Point Transactions Report PDF
 */
function generatePointTransactionsPDF(doc, reportData, metadata) {
  // Header
  doc.fontSize(20).text('Point Transactions Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Filter information
  if (reportData.dateRangeStart || reportData.dateRangeEnd) {
    doc.fontSize(12).text('Filters:', { underline: true });
    if (reportData.dateRangeStart) {
      doc.fontSize(10).text(`Start Date: ${new Date(reportData.dateRangeStart).toLocaleDateString()}`);
    }
    if (reportData.dateRangeEnd) {
      doc.fontSize(10).text(`End Date: ${new Date(reportData.dateRangeEnd).toLocaleDateString()}`);
    }
    if (reportData.reasonForChange) {
      doc.fontSize(10).text(`Reason: ${reportData.reasonForChange}`);
    }
    doc.moveDown();
  }

  // Summary statistics
  doc.fontSize(14).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Transactions: ${reportData.totalTransactions}`);
  doc.text(`Total Points Added: ${reportData.totalPointsAdded}`, { indent: 20 });
  doc.text(`Total Points Deducted: ${reportData.totalPointsDeducted}`, { indent: 20 });
  doc.text(`Net Point Change: ${reportData.netPointChange}`, { indent: 20 });
  doc.moveDown(2);

  // Detailed records table
  if (reportData.detailedRecords && reportData.detailedRecords.length > 0) {
    doc.fontSize(14).text('Detailed Records', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    // Table header
    const tableTop = doc.y;
    const colWidths = { id: 70, driver: 80, change: 60, reason: 120, date: 100 };
    let x = 50;

    doc.text('Transaction ID', x, tableTop);
    x += colWidths.id;
    doc.text('Driver ID', x, tableTop);
    x += colWidths.driver;
    doc.text('Points', x, tableTop);
    x += colWidths.change;
    doc.text('Reason', x, tableTop);
    x += colWidths.reason;
    doc.text('Date', x, tableTop);

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    reportData.detailedRecords.forEach((record, i) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9);
      }

      x = 50;
      const y = doc.y;
      doc.text(record.TransactionID || 'N/A', x, y, { width: colWidths.id - 5 });
      x += colWidths.id;
      doc.text(record.DriverID || 'N/A', x, y, { width: colWidths.driver - 5 });
      x += colWidths.driver;
      doc.text(record.PointChange?.toString() || '0', x, y, { width: colWidths.change - 5 });
      x += colWidths.change;
      doc.text(record.ReasonForChange || 'N/A', x, y, { width: colWidths.reason - 5 });
      x += colWidths.reason;
      doc.text(
        record.TimeChanged ? new Date(record.TimeChanged).toLocaleDateString() : 'N/A',
        x,
        y,
        { width: colWidths.date - 5 }
      );
      doc.moveDown();
    });
  }

  // Footer
  doc.fontSize(8).text('End of Report', { align: 'center' });
}

/**
 * Generate Orders Report PDF
 */
function generateOrdersPDF(doc, reportData, metadata) {
  // Header
  doc.fontSize(20).text('Orders Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Filter information
  if (reportData.dateRangeStart || reportData.dateRangeEnd) {
    doc.fontSize(12).text('Filters:', { underline: true });
    if (reportData.dateRangeStart) {
      doc.fontSize(10).text(`Start Date: ${new Date(reportData.dateRangeStart).toLocaleDateString()}`);
    }
    if (reportData.dateRangeEnd) {
      doc.fontSize(10).text(`End Date: ${new Date(reportData.dateRangeEnd).toLocaleDateString()}`);
    }
    if (reportData.orderStatus) {
      doc.fontSize(10).text(`Status: ${reportData.orderStatus}`);
    }
    doc.moveDown();
  }

  // Summary statistics
  doc.fontSize(14).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Orders: ${reportData.totalOrders}`);
  doc.text(`Total Points Spent: ${reportData.totalPointsSpent}`, { indent: 20 });
  doc.text(`Total Dollars Spent: $${reportData.totalDollarsSpent.toFixed(2)}`, { indent: 20 });
  doc.text(`Confirmed: ${reportData.confirmedCount}`, { indent: 20 });
  doc.text(`Shipped: ${reportData.shippedCount}`, { indent: 20 });
  doc.text(`Delivered: ${reportData.deliveredCount}`, { indent: 20 });
  doc.text(`Cancelled: ${reportData.cancelledCount}`, { indent: 20 });
  doc.moveDown(2);

  // Detailed records table
  if (reportData.detailedRecords && reportData.detailedRecords.length > 0) {
    doc.fontSize(14).text('Detailed Records', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    // Table header
    const tableTop = doc.y;
    const colWidths = { id: 60, driver: 75, points: 50, dollars: 50, status: 60, date: 85 };
    let x = 50;

    doc.text('Order ID', x, tableTop);
    x += colWidths.id;
    doc.text('Driver ID', x, tableTop);
    x += colWidths.driver;
    doc.text('Points', x, tableTop);
    x += colWidths.points;
    doc.text('Dollars', x, tableTop);
    x += colWidths.dollars;
    doc.text('Status', x, tableTop);
    x += colWidths.status;
    doc.text('Order Date', x, tableTop);

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    reportData.detailedRecords.forEach((record, i) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9);
      }

      x = 50;
      const y = doc.y;
      doc.text(record.OrderID || 'N/A', x, y, { width: colWidths.id - 5 });
      x += colWidths.id;
      doc.text(record.DriverID || 'N/A', x, y, { width: colWidths.driver - 5 });
      x += colWidths.driver;
      doc.text(record.OrderPointsSpent?.toString() || '0', x, y, { width: colWidths.points - 5 });
      x += colWidths.points;
      doc.text(`$${parseFloat(record.OrderDollarsSpent || 0).toFixed(2)}`, x, y, { width: colWidths.dollars - 5 });
      x += colWidths.dollars;
      doc.text(record.OrderStatus || 'N/A', x, y, { width: colWidths.status - 5 });
      x += colWidths.status;
      doc.text(
        record.OrderDate ? new Date(record.OrderDate).toLocaleDateString() : 'N/A',
        x,
        y,
        { width: colWidths.date - 5 }
      );
      doc.moveDown();
    });
  }

  // Footer
  doc.fontSize(8).text('End of Report', { align: 'center' });
}
