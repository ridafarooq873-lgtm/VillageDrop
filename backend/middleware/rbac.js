/**
 * Role-based access control.
 * @param {string[]|string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat()
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' })
    }

    next()
  }
}

export default requireRole
