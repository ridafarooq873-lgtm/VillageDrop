import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { protect } from '../middleware/auth.js'
import Notification from '../models/Notification.js'

const router = express.Router()

/**
 * @route GET /api/notifications
 * @desc List the current user's notifications (newest first) + unread count
 * @query { unread=true, limit, page }
 */
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const { unread, limit, page } = req.query
    const filter = { recipient: req.user.id }
    if (unread === 'true') filter.isRead = false

    const pageNum = Math.max(1, Number(page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 30))

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user.id, isRead: false }),
    ])

    res.json({ notifications, total, unreadCount, page: pageNum })
  })
)

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all of the current user's notifications as read
 */
router.put(
  '/read-all',
  protect,
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    )
    res.json({ message: 'All notifications marked as read', updated: result.modifiedCount })
  })
)

/**
 * @route PUT /api/notifications/:notificationId/read
 * @desc Mark a single notification as read
 */
router.put(
  '/:notificationId/read',
  protect,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipient: req.user.id },
      { $set: { isRead: true } },
      { new: true }
    )
    if (!notification) return res.status(404).json({ message: 'Notification not found' })
    res.json({ message: 'Notification marked as read', notification })
  })
)

/**
 * @route DELETE /api/notifications/:notificationId
 * @desc Delete a notification
 */
router.delete(
  '/:notificationId',
  protect,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      recipient: req.user.id,
    })
    if (!notification) return res.status(404).json({ message: 'Notification not found' })
    res.json({ message: 'Notification deleted' })
  })
)

export default router
