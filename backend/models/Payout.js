import mongoose from 'mongoose'

const payoutSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      required: true,
    },
    periodStart: Date,
    periodEnd: Date,
    amount: { type: Number, required: true }, // net amount to pay rider
    commission: { type: Number, default: 0 }, // total commission taken
    deliveryFees: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'],
      default: 'pending',
    },
    paidAt: Date,
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reference: String,
    notes: String,
    transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  },
  { timestamps: true }
)

export default mongoose.model('Payout', payoutSchema)
