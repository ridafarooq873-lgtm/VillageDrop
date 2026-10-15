import mongoose from 'mongoose'

const transactionSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['delivery_fee', 'tip', 'refund', 'payout', 'commission', 'adjustment'],
      default: 'delivery_fee',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    // Earnings breakdown
    grossAmount: { type: Number, default: 0 }, // total collected for this line (e.g. deliveryFee)
    commission: { type: Number, default: 0 }, // platform commission deducted
    netAmount: { type: Number, default: 0 }, // amount owed to rider
    payout: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payout',
    },
    settlementStatus: {
      type: String,
      enum: ['unsettled', 'pending_payout', 'paid', 'reversed'],
      default: 'unsettled',
    },
    settledAt: Date,
    paymentGateway: String,
    gatewayTxnId: String,
    reference: String,
    notes: String,
  },
  { timestamps: true }
)

export default mongoose.model('Transaction', transactionSchema)
