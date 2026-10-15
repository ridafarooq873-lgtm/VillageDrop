import mongoose from 'mongoose'

/**
 * Generic key/value settings store (e.g. fee configuration).
 */
const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Setting', settingSchema)
