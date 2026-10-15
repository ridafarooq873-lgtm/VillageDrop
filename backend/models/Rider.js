import mongoose from 'mongoose'

const riderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    riderId: {
      type: String,
      unique: true,
      sparse: true,
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'scooter', 'car', 'van'],
      default: 'bike',
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
    nicNumber: {
      type: String,
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    rejectionReason: String,
    isOnline: {
      type: Boolean,
      default: false,
    },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      lastUpdated: { type: Date, default: null },
    },
    availabilityStatus: {
      type: String,
      enum: ['available', 'busy', 'offline'],
      default: 'offline',
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalDeliveries: {
      type: Number,
      default: 0,
    },
    completedDeliveries: {
      type: Number,
      default: 0,
    },
    bankDetails: {
      bankName: String,
      accountNumber: String,
      ifsc: String,
    },
    documents: [
      {
        type: String,
        url: String,
        verified: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
)

riderSchema.pre('save', async function (next) {
  // Auto-generate riderId if not set
  if (!this.riderId && this.user) {
    try {
      const short = this.user.toString().slice(-6).toUpperCase()
      this.riderId = `R-${short}-${Date.now().toString().slice(-4)}`
    } catch (e) {
      this.riderId = `R-${Date.now().toString().slice(-6)}`
    }
  }
  next()
})

const Rider = mongoose.model('Rider', riderSchema)
export default Rider
