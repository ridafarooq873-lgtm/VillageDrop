import 'dotenv/config'
import mongoose from 'mongoose'
import User from './models/User.js'
import Rider from './models/Rider.js'
import Shop from './models/Shop.js'
import Order from './models/Order.js'
import OrderItem from './models/OrderItem.js'
import Complaint from './models/Complaint.js'
import Payout from './models/Payout.js'
import Transaction from './models/Transaction.js'
import Setting from './models/Setting.js'
import { connectDB } from './config/db.js'

const seed = async () => {
  try {
    await connectDB(process.env.MONGO_URI)

    // Deterministic dev seed - clear the collections we populate
    await Promise.all([
      User.deleteMany({}),
      Rider.deleteMany({}),
      Shop.deleteMany({}),
      Order.deleteMany({}),
      OrderItem.deleteMany({}),
      Complaint.deleteMany({}),
      Payout.deleteMany({}),
      Transaction.deleteMany({}),
      // Reset platform fee/commission configuration to defaults
      Setting.deleteMany({ key: 'fee_config' }),
    ])

    // Admin
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@villagedrop.com',
      password: 'admin123',
      role: 'admin',
      phone: '03000000000',
    })

    // Customer
    const customer = await User.create({
      name: 'Test Customer',
      email: 'cust1@villagedrop.com',
      password: 'cust123',
      role: 'customer',
      phone: '03000000001',
      address: {
        street: 'Main Street',
        city: 'Lahore',
        district: 'Lahore',
        province: 'Punjab',
        lat: 31.5204,
        lng: 74.3587,
      },
    })

    // Shop owner
    const shopOwner = await User.create({
      name: 'Shop Owner',
      email: 'shop1@villagedrop.com',
      password: 'shop123',
      role: 'shop',
      phone: '03000000002',
    })

    const shop = await Shop.create({
      name: 'Village Mart',
      owner: shopOwner._id,
      phone: '03000000002',
      address: {
        street: 'Market Road',
        city: 'Lahore',
        district: 'Lahore',
        province: 'Punjab',
        lat: 31.521,
        lng: 74.359,
      },
      isActive: true,
      isApproved: true,
    })

    // Rider (pending approval by default)
    const riderUser = await User.create({
      name: 'Test Rider',
      email: 'rider1@villagedrop.com',
      password: 'rider123',
      role: 'rider',
      phone: '03000000003',
      address: {
        street: 'Canal Road',
        city: 'Lahore',
        district: 'Lahore',
        province: 'Punjab',
      },
    })

    const rider = await Rider.create({
      user: riderUser._id,
      vehicleType: 'bike',
      licenseNumber: 'LIC123456',
      nicNumber: '35202-1234567-1',
      approvalStatus: 'pending',
      isApproved: false,
      isOnline: false,
      availabilityStatus: 'offline',
    })

    // Create sample standard order
    const order = await Order.create({
      customer: customer._id,
      shop: shop._id,
      subtotal: 500,
      deliveryFee: 60,
      total: 560,
      status: 'ready_for_pickup',
      pickupPin: '1234',
      deliveryPin: '5678',
      deliveryAddress: {
        name: customer.name,
        phone: customer.phone,
        street: customer.address.street,
        city: customer.address.city,
        lat: customer.address.lat,
        lng: customer.address.lng,
      },
      shopAddress: {
        street: shop.address.street,
        city: shop.address.city,
        lat: shop.address.lat,
        lng: shop.address.lng,
      },
    })

    await OrderItem.create({
      order: order._id,
      productName: 'Grocery Pack',
      quantity: 2,
      price: 250,
    })

    // Create sample rider-assisted purchase order (rider buys on the customer's behalf)
    const purchaseOrder = await Order.create({
      customer: customer._id,
      shop: shop._id,
      orderType: 'assisted_purchase',
      requiresPurchase: true,
      purchaseStatus: 'pending',
      subtotal: 0,
      deliveryFee: 80,
      total: 80,
      status: 'ready_for_pickup',
      pickupPin: '2468',
      deliveryPin: '1357',
      deliveryAddress: {
        name: customer.name,
        phone: customer.phone,
        street: customer.address.street,
        city: customer.address.city,
        lat: customer.address.lat,
        lng: customer.address.lng,
      },
      shopAddress: {
        street: shop.address.street,
        city: shop.address.city,
        lat: shop.address.lat,
        lng: shop.address.lng,
      },
    })

    await OrderItem.insertMany([
      { order: purchaseOrder._id, productName: 'Rice 5kg', quantity: 1, price: 1800 },
      { order: purchaseOrder._id, productName: 'Cooking Oil 1L', quantity: 2, price: 600 },
      { order: purchaseOrder._id, productName: 'Sugar 1kg', quantity: 3, price: 150 },
    ])

    // Demo disputes for the admin dispute queue
    await Complaint.create([
      {
        order: order._id,
        raisedBy: customer._id,
        against: rider.user,
        subject: 'Items arrived damaged',
        description: 'Two of the grocery items were crushed and leaking. Requesting a partial refund.',
        status: 'open',
      },
      {
        order: purchaseOrder._id,
        raisedBy: customer._id,
        against: rider.user,
        subject: 'Rider substituted items without asking',
        description: 'The requested brand of cooking oil was replaced with a different one.',
        status: 'in_progress',
        resolution: 'Asked the rider team to confirm the substitution and refund the difference.',
      },
    ])

    console.log('Seed completed successfully')
    console.log({
      admin: { email: 'admin@villagedrop.com', password: 'admin123', role: 'admin' },
      customer: { email: 'cust1@villagedrop.com', password: 'cust123', role: 'customer' },
      shopOwner: { email: 'shop1@villagedrop.com', password: 'shop123', role: 'shop' },
      rider: { email: 'rider1@villagedrop.com', password: 'rider123', role: 'rider', approvalStatus: rider.approvalStatus },
      order: { orderNumber: order.orderNumber, status: order.status },
      purchaseOrder: { orderNumber: purchaseOrder.orderNumber, status: purchaseOrder.status, requiresPurchase: true },
      disputes: { open: 1, in_progress: 1 },
    })

    process.exit(0)
  } catch (error) {
    console.error('Seed error:', error)
    process.exit(1)
  }
}

seed()
