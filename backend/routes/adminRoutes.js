const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin
// @desc    Admin Health Check
// @access  Private (Admin)
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Admin API is running' });
});

module.exports = router;
