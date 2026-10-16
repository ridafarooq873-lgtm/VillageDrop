import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'accepted_by_shop',
        'ready_for_pickup',
        'assigned_to_rider',
        'picked_up',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'rejected',
      ],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'card', 'wallet'],
      default: 'cod',
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    pickupPin: { type: String, select: false },
    deliveryPin: { type: String, select: false },
    notes: String,
    deliveryAddress: {
      name: String,
      phone: String,
      street: String,
      landmark: String,
      instructions: String,
      city: String,
      district: String,
      province: String,
      lat: Number,
      lng: Number,
    },
    shopAddress: {
      street: String,
      contactName: String,
      phone: String,
      landmark: String,
      instructions: String,
      city: String,
      district: String,
      province: String,
      lat: Number,
      lng: Number,
    },
    estimatedDeliveryTime: Date,
    deliveredAt: Date,
    pickedUpAt: Date,
    acceptedAt: Date,
    outForDeliveryAt: Date,

    // ---- Rider-assisted purchase workflow ----
    orderType: {
      type: String,
      enum: ['standard', 'assisted_purchase'],
      default: 'standard',
    },
    requiresPurchase: { type: Boolean, default: false },
    purchaseStatus: {
      type: String,
      enum: ['not_required', 'pending', 'items_confirmed', 'completed'],
      default: 'not_required',
    },
    purchaseAmount: { type: Number, default: 0 }, // actual amount spent by rider
    receiptUrl: { type: String },
    receiptUploadedAt: Date,
    itemsConfirmedAt: Date,
    purchaseCompletedAt: Date,
    purchaseNotes: { type: String, default: '' },
    purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },

    // ---- Rider earnings (locked at delivery time so later fee-config
    //      changes never rewrite history for settled orders) ----
    riderEarning: {
      gross: { type: Number, default: 0 },
      commission: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
      rate: { type: Number, default: 0 },
      computedAt: Date,
    },

    // ---- Delivery confirmation ----
    deliveryConfirmed: { type: Boolean, default: false },
    deliveryConfirmedAt: Date,
    deliveryRecipientName: { type: String, default: '' },
    deliveryProofUrl: { type: String },
    deliveryNotes: { type: String, default: '' },

    // Riders who rejected/declined this request (so they are not shown it again)
    rejections: [
      {
        rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
        reason: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
    // Audit trail of status changes
    statusHistory: [
      {
        status: { type: String },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
)

// Index to quickly find orders rejecting riders excluded
orderSchema.index({ status: 1, rider: 1 })
orderSchema.index({ 'rejections.rider': 1 })

orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    this.orderNumber = `OD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`
  }
  if (!this.total && (this.subtotal || this.deliveryFee)) {
    this.total = (this.subtotal || 0) + (this.deliveryFee || 0)
  }
  next()
})

export default mongoose.model('Order', orderSchema)
