import mongoose from 'mongoose'

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: String,
    phone: String,
    address: {
      street: String,
      city: String,
      district: String,
      province: String,
      lat: Number,
      lng: Number,
    },
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true }
)

export default mongoose.model('Shop', shopSchema)
