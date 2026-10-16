import mongoose from 'mongoose'

/**
 * @returns {Promise<import('mongoose').Mongoose>}
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not configured')
  }

  mongoose.set('strictQuery', true)
  const conn = await mongoose.connect(uri)
  console.log('MongoDB Connected')
  return conn
}

export default connectDB
