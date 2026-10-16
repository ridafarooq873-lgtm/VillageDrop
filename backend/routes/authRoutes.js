const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Rider = require('../models/Rider');
const { protect } = require('../middleware/auth');

const router = express.Router();
let adminBootstrapInProgress = false;

// @route   POST /api/auth/register
// @desc    Register a user
// @access  Public
router.post(
  '/register',
  [
    body('name', 'Please add a name').trim().notEmpty(),
    body('email', 'Please include a valid email').isEmail().normalizeEmail(),
    body('phone', 'Please add a valid phone number').isMobilePhone('any'),
    body('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    body('role').optional().isIn(['customer', 'rider'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, password, role = 'customer', address, vehicleType, vehicleNumber, licenseNumber } = req.body || {};
    if (role === 'rider' && (
      !['bicycle', 'motorcycle', 'auto', 'van'].includes(vehicleType) ||
      !String(vehicleNumber || '').trim() ||
      !String(licenseNumber || '').trim()
    )) {
      return res.status(400).json({
        success: false,
        message: 'Rider registration requires a valid vehicle type, vehicle number, and license number'
      });
    }

    let user;
    try {
      // Check if user exists
      user = await User.findOne({ $or: [{ email }, { phone }] });

      if (user) {
        return res.status(400).json({ success: false, message: 'User already exists with that email or phone' });
      }

      user = await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        password,
        role,
        address
      });

      if (role === 'rider') {
        await Rider.create({
          user: user._id,
          vehicleType,
          vehicleNumber: vehicleNumber.trim(),
          licenseNumber: licenseNumber.trim(),
          isAvailable: false,
          isApproved: false,
          approvalStatus: 'pending'
        });
      }

      // Generate tokens
      const accessToken = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      // Save refresh token
      user.refreshToken = refreshToken;
      await user.save();

      res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          ...(role === 'rider' ? { approvalStatus: 'pending' } : {})
        }
      });
    } catch (err) {
      if (user?._id) await User.deleteOne({ _id: user._id });
      if (user?._id) await Rider.deleteOne({ user: user._id });
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

router.post('/bootstrap-admin', async (req, res) => {
  const bootstrapKey = process.env.ADMIN_BOOTSTRAP_KEY;
  if (!bootstrapKey || bootstrapKey.length < 32) {
    return res.status(503).json({ success: false, message: 'Admin bootstrap is not configured' });
  }

  const expected = Buffer.from(bootstrapKey);
  const supplied = Buffer.from(req.get('x-admin-bootstrap-key') || '');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ success: false, message: 'Invalid bootstrap key' });
  }
  if (adminBootstrapInProgress) {
    return res.status(409).json({ success: false, message: 'Admin bootstrap is already in progress' });
  }

  const { name, email, phone, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof phone !== 'string' || !/^\+?[\d\s()-]{10,20}$/.test(phone) ||
    typeof password !== 'string' || password.length < 12) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, phone, and a password of at least 12 characters are required'
    });
  }

  adminBootstrapInProgress = true;
  try {
    if (await User.exists({ role: 'admin' })) {
      return res.status(409).json({ success: false, message: 'An admin account already exists' });
    }

    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account already exists with that email or phone' });
    }

    await User.create({ name: name.trim(), email: email.toLowerCase(), phone, password, role: 'admin' });
    return res.status(201).json({
      success: true,
      message: 'Admin account created. Sign in using the regular login page.'
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not create admin account' });
  } finally {
    adminBootstrapInProgress = false;
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check for user
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
      }

      // Check if password matches
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
      }

      // Check if active
      if (!user.isActive) {
        return res.status(401).json({ success: false, message: 'Your account has been deactivated' });
      }

      // Generate tokens
      const accessToken = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      // Save refresh token
      user.refreshToken = refreshToken;
      await user.save();

      res.status(200).json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Public
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token is required' });
  }

  try {
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, refreshSecret);
    
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const accessToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error(err.message);
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear refresh token
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.refreshToken = null;
    await user.save();
    
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/auth/me
// @desc    Update user profile
// @access  Private
router.put('/me', protect, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, address },
      { new: true, runValidators: true }
    );
    
    res.status(200).json({ success: true, data: updatedUser });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
