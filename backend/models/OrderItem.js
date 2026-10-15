const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    weight: Number, // in kg
    category: {
      type: String,
      enum: ['document', 'parcel', 'food', 'grocery', 'medicine', 'electronics', 'clothing', 'other'],
      default: 'parcel'
    },
    dimensions: {
      length: Number, // cm
      width: Number,  // cm
      height: Number  // cm
    },
    fragile: {
      type: Boolean,
      default: false
    },
    estimatedValue: {
      type: Number,
      default: 0
    },
    specialInstructions: String,
    image: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('OrderItem', orderItemSchema);
