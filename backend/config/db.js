const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

let memoryServer = null;
let retryTimer = null;

// Use the embedded MongoDB in development unless explicitly disabled.
const useEmbeddedDb = () =>
  process.env.USE_MEMORY_DB === 'true' ||
  (process.env.USE_MEMORY_DB !== 'false' && process.env.NODE_ENV !== 'production');

const startEmbeddedDb = async () => {
  if (memoryServer) return memoryServer.getUri();

  // Lazy require so the package is only needed for local development.
  const { MongoMemoryServer } = require('mongodb-memory-server');

  const dbPath = path.join(__dirname, '..', '.mongo-data');
  const baseOptions = { instance: { dbName: 'village_drop', storageEngine: 'wiredTiger' } };

  try {
    fs.mkdirSync(dbPath, { recursive: true });
    memoryServer = await MongoMemoryServer.create({
      instance: { ...baseOptions.instance, dbPath }
    });
    console.log(`Embedded MongoDB started (persistent, data: ${dbPath})`);
  } catch (error) {
    console.warn(
      `Embedded MongoDB persistence unavailable (${error.message}); starting in-memory instead.`
    );
    memoryServer = await MongoMemoryServer.create(baseOptions);
    console.log('Embedded MongoDB started (in-memory, data resets on restart)');
  }

  return memoryServer.getUri();
};

const connectDB = async () => {
  let uri = process.env.MONGO_URI;

  if (useEmbeddedDb()) {
    try {
      uri = await startEmbeddedDb();
    } catch (error) {
      console.error(`Could not start embedded MongoDB: ${error.message}`);
      console.log('Falling back to MONGO_URI...');
      uri = process.env.MONGO_URI;
    }
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    if (!retryTimer) {
      console.log('Retrying connection in 5 seconds...');
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectDB();
      }, 5000);
    }
  }
};

const stopEmbeddedDb = async () => {
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

const shutdown = async () => {
  await stopEmbeddedDb();
  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected!');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected!');
});

module.exports = connectDB;
module.exports.stopEmbeddedDb = stopEmbeddedDb;
