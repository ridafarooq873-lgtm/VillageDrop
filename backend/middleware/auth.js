import jwt from 'jsonwebtoken'
import User from '../models/User.js'

/**
 * Verify JSON Web Token and attach user info to request.
 * Expects header: Authorization: Bearer <token>
 *
 * Role and account status are re-read from the DB so admin actions
 * (deactivation, role changes) take effect immediately, not at token expiry.
 */
export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' })
    }

    const token = header.split(' ')[1]
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, token missing' })
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      console.error('[auth] JWT_SECRET is not set')
      return res.status(500).json({ message: 'Server configuration error' })
    }

    const decoded = jwt.verify(token, secret) // { id, role, ... }

    const user = await User.findById(decoded.id).select('role isActive name email').lean()
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, account no longer exists' })
    }
    if (!user.isActive) {
      return res
        .status(403)
        .json({ message: 'Account is deactivated. Contact an administrator.' })
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
    }
    next()
  } catch (err) {
    console.warn('[auth] Token verification failed:', err.name || 'error')
    return res.status(401).json({ message: 'Not authorized, token invalid' })
  }
}

export default protect
