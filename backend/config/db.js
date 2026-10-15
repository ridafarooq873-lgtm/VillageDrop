import mongoose from 'mongoose'

/**
 * Connect to MongoDB.
 * @param {string} uri MongoDB connection string.
 * @returns {Promise<import('mongoose').Mongoose>}
 */
export async function connectDB(uri) {
  mongoose.set('strictQuery', true)
  const conn = await mongoose.connect(uri)
  console.log(`[db] MongoDB connected -> ${conn.connection.host}/${conn.connection.name}`)
  return conn
}

export default connectDB
