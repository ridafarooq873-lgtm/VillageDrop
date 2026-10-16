import express from 'express'
import jwt from 'jsonwebtoken'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { asyncHandler } from '../utils/asyncHandler.js'
import User from '../models/User.js'
import Rider from '../models/Rider.js'
import Setting from '../models/Setting.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = express.Router()

function generateToken(user) {
  const secret = process.env.JWT_SECRET
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  if (!secret) throw new Error('JWT_SECRET not configured')
  return jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn })
}

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function issueTokens(user) {
  const refreshToken = randomBytes(48).toString('base64url')
  user.refreshTokens = user.refreshTokens || []
  user.refreshTokens.push({
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  await user.save()
  return { token: generateToken(user), refreshToken }
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

    const tokens = await issueTokens(user)

    res.status(201).json({
      message: 'Customer registered successfully',
      ...tokens,
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
      vehicleNumber,
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
      vehicleNumber: vehicleNumber?.trim(),
      bankDetails,
      approvalStatus: 'pending',
      isApproved: false,
      isOnline: false,
      availabilityStatus: 'offline',
    })

    const tokens = await issueTokens(user)

    res.status(201).json({
      message: 'Rider registered successfully. Awaiting admin approval.',
      ...tokens,
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

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +refreshTokens')
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

    const tokens = await issueTokens(user)

    // Include rider profile if user is rider
    let riderProfile = null
    if (user.role === 'rider') {
      riderProfile = await Rider.findOne({ user: user._id })
    }

    res.status(200).json({
      message: 'Login successful',
      ...tokens,
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

router.post(
  '/refresh-token',
  asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' })
    }
    const tokenHash = hashRefreshToken(refreshToken)
    const user = await User.findOne({
      'refreshTokens.tokenHash': tokenHash,
      isActive: true,
    }).select('+refreshTokens')
    if (!user) return res.status(401).json({ message: 'Refresh token is invalid or expired' })

    const storedToken = user.refreshTokens.find((item) => item.tokenHash === tokenHash)
    if (!storedToken || storedToken.expiresAt <= new Date()) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }
    const removed = await User.updateOne(
      { _id: user._id, 'refreshTokens.tokenHash': tokenHash },
      { $pull: { refreshTokens: { tokenHash } } }
    )
    if (removed.modifiedCount !== 1) {
      return res.status(401).json({ message: 'Refresh token has already been used' })
    }

    const nextRefreshToken = randomBytes(48).toString('base64url')
    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          refreshTokens: {
            tokenHash: hashRefreshToken(nextRefreshToken),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }
    )
    res.json({ accessToken: generateToken(user), refreshToken: nextRefreshToken })
  })
)

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken
    if (typeof refreshToken === 'string' && refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken)
      await User.updateOne(
        { 'refreshTokens.tokenHash': tokenHash },
        { $pull: { refreshTokens: { tokenHash } } }
      )
    }
    res.json({ message: 'Logged out' })
  })
)

router.post(
  '/bootstrap-admin',
  asyncHandler(async (req, res) => {
    const configuredKey = process.env.ADMIN_BOOTSTRAP_KEY
    if (!configuredKey || configuredKey.length < 32) {
      return res.status(503).json({ message: 'Admin bootstrap is not configured' })
    }
    const supplied = Buffer.from(req.get('x-admin-bootstrap-key') || '')
    const expected = Buffer.from(configuredKey)
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ message: 'Invalid bootstrap key' })
    }
    const { name, email, phone, password } = req.body
    if (!name?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({
        message: 'Name, email and a password of at least 12 characters are required',
      })
    }
    if (await User.exists({ role: 'admin' })) {
      return res.status(409).json({ message: 'An administrator already exists' })
    }
    if (await User.exists({ email: email.toLowerCase().trim() })) {
      return res.status(409).json({ message: 'Email already in use' })
    }

    const lockOwner = randomUUID()
    const lockValue = {
      owner: lockOwner,
      state: 'initializing',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }
    let lock
    try {
      lock = await Setting.create({ key: 'adminBootstrap', value: lockValue })
    } catch (error) {
      if (error.code === 11000) {
        lock = await Setting.findOneAndUpdate(
          { key: 'adminBootstrap', 'value.expiresAt': { $lte: new Date() } },
          { $set: { value: lockValue } },
          { new: true }
        )
        if (!lock) {
          return res.status(409).json({ message: 'Admin bootstrap has already been used or is in progress' })
        }
      } else {
        throw error
      }
    }
    try {
      if (await User.exists({ role: 'admin' })) {
        await Setting.deleteOne({ _id: lock._id })
        return res.status(409).json({ message: 'An administrator already exists' })
      }
      const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim(),
        password,
        role: 'admin',
      })
      await Setting.updateOne(
        { _id: lock._id, 'value.owner': lockOwner },
        { $set: { value: { owner: lockOwner, state: 'completed' } } }
      )
      const tokens = await issueTokens(user)
      res.status(201).json({
        message: 'Initial administrator created',
        ...tokens,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role },
      })
    } catch (error) {
      await Setting.deleteOne({
        _id: lock._id,
        'value.owner': lockOwner,
        'value.state': 'initializing',
      })
      throw error
    }
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
