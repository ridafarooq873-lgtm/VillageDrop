const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(protect);
router.use(authorize('rider'));

// @route   GET /api/rider
// @desc    Rider Health Check
// @access  Private (Rider)
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Rider API is running' });
});

module.exports = router;
