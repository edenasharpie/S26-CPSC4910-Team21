// Get drivers based off performance
router.get('/my-drivers/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const drivers = await dbQueries.getDriversByCompany(companyId);
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers for review' });
  }
}); 
