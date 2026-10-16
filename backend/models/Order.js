const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true
    },
    orderType: {
      type: String,
      enum: ['pickup_delivery', 'rider_assisted_purchase'],
      default: 'pickup_delivery'
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderItem'
      }
    ],
    pickup: {
      address: { type: String, required: true },
      landmark: String,
      contactName: String,
      contactPhone: String,
      coordinates: {
        lat: Number,
        lng: Number
      },
      instructions: String
    },
    delivery: {
      address: { type: String, required: true },
      landmark: String,
      contactName: { type: String, required: true },
      contactPhone: { type: String, required: true },
      coordinates: {
        lat: Number,
        lng: Number
      },
      instructions: String
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider'
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'assigned', 'purchasing', 'picked_up', 'in_transit', 'delivered', 'cancelled'],
      default: 'pending'
    },
    purchaseDetails: {
      instructions: String,
      estimatedItemCost: Number,
      actualItemCost: Number,
      billImage: String
    },
    deliveryFee: {
      type: Number,
      required: true
    },
    totalAmount: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'online', 'wallet'],
      default: 'cod'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending'
    },
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    cancellation: {
      reason: String,
      cancelledBy: {
        type: String,
        enum: ['customer', 'rider', 'admin']
      },
      cancelledAt: Date,
      refundStatus: {
        type: String,
        enum: ['pending', 'processed', 'na'],
        default: 'na'
      }
    },
    deliveryPin: { type: String, select: false },
    trackingUpdates: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        location: String,
        note: String
      }
    ]
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for item count
orderSchema.virtual('itemCount').get(function () {
  return this.items ? this.items.length : 0;
});

// Pre-save hook to generate order number
orderSchema.pre('save', function (next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.orderNumber = `VD-${timestamp}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
