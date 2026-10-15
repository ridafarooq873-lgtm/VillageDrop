const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  type: { type: String, enum: ['order', 'system', 'promo'], default: 'system' },
  relatedId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
