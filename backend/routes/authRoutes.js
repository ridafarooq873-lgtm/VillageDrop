import express from 'express'
import jwt from 'jsonwebtoken'
import { asyncHandler } from '../utils/asyncHandler.js'
import User from '../models/User.js'
import Rider from '../models/Rider.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = express.Router()

function generateToken(user) {
  const secret = process.env.JWT_SECRET
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  if (!secret) throw new Error('JWT_SECRET not configured')
  return jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn })
}

/**
 * @route POST /api/auth/register/customer
 * @desc Register a customer
 */
router.post(
  '/register/customer',
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, address } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' })
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      password,
      role: 'customer',
      address,
    })

    const token = generateToken(user)

    res.status(201).json({
      message: 'Customer registered successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
      },
    })
  })
)

/**
 * @route POST /api/auth/register/rider
 * @desc Register a rider (creates User + Rider, approvalStatus pending)
 */
router.post(
  '/register/rider',
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      phone,
      password,
      vehicleType,
      licenseNumber,
      nicNumber,
      bankDetails,
      address,
    } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' })
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      password,
      role: 'rider',
      address,
    })

    const rider = await Rider.create({
      user: user._id,
      vehicleType: vehicleType || 'bike',
      licenseNumber: licenseNumber?.trim(),
      nicNumber: nicNumber?.trim(),
      bankDetails,
      approvalStatus: 'pending',
      isApproved: false,
      isOnline: false,
      availabilityStatus: 'offline',
    })

    const token = generateToken(user)

    res.status(201).json({
      message: 'Rider registered successfully. Awaiting admin approval.',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
      },
      rider: {
        _id: rider._id,
        user: rider.user,
        riderId: rider.riderId,
        approvalStatus: rider.approvalStatus,
        isApproved: rider.isApproved,
        vehicleType: rider.vehicleType,
      },
    })
  })
)

/**
 * @route POST /api/auth/login
 * @desc Login with email/password
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password')
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' })
    }

    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = generateToken(user)

    // Include rider profile if user is rider
    let riderProfile = null
    if (user.role === 'rider') {
      riderProfile = await Rider.findOne({ user: user._id })
    }

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
      },
      rider: riderProfile,
    })
  })
)

/**
 * @route GET /api/auth/me
 * @desc Get current authenticated user + rider profile
 */
router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean()
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    let rider = null
    if (user.role === 'rider') {
      rider = await Rider.findOne({ user: user._id }).lean()
    }

    res.json({ user, rider })
  })
)

/**
 * @route POST /api/auth/register/admin
 * @desc Register admin (protected - typically only existing admins)
 */
router.post(
  '/register/admin',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' })
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      password,
      role: 'admin',
    })

    res.status(201).json({
      message: 'Admin created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  })
)

export default router
