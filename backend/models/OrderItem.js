import mongoose from 'mongoose'

const orderItemSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    // ---- Rider-assisted purchase confirmation ----
    isAvailable: { type: Boolean, default: true },
    purchasedQuantity: { type: Number, default: 0, min: 0 },
    actualPrice: { type: Number, default: 0, min: 0 },
    purchaseNote: { type: String, default: '' },
    confirmed: { type: Boolean, default: false },
    confirmedAt: Date,
  },
  { timestamps: true }
)

orderItemSchema.pre('save', function (next) {
  this.total = (this.quantity || 0) * (this.price || 0)
  next()
})

export default mongoose.model('OrderItem', orderItemSchema)
