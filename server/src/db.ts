import dns from 'node:dns';
import { MongoClient, Db } from 'mongodb';
import { seedBuiltinExercises, seedBuiltinPrograms } from './seed.js';

// Force Node to use Google DNS so that restrictive networks don't block MongoDB lookups
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

let mongoClient: MongoClient | null = null;
let db: Db;

export async function connectDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(uri);
  await client.connect();
  mongoClient = client;
  db = client.db();
  await db.collection('nutritionGoals').createIndex({ userId: 1 }, { unique: true });
  await db.collection('nutritionLogs').createIndex({ userId: 1, date: 1 }, { unique: true });
  await db.collection('exercises').createIndex({ seedKey: 1 }, { unique: true, sparse: true });
  await db.collection('exercisePreferences').createIndex({ userId: 1, exerciseId: 1 }, { unique: true });
  await db.collection('setLogs').createIndex({ userId: 1, exerciseId: 1 });
  await db.collection('setLogs').createIndex({ sessionId: 1 });
  await db.collection('programs').createIndex({ seedKey: 1 }, { unique: true, sparse: true });
  await db.collection('programs').createIndex({ createdBy: 1 });
  await db.collection('userPrograms').createIndex({ userId: 1, active: 1 });
  const idBySeed = await seedBuiltinExercises(db);
  await seedBuiltinPrograms(db, idBySeed);
  console.log('Connected to MongoDB');
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialized — call connectDb first');
  return db;
}

export async function closeDb(): Promise<void> {
  if (!mongoClient) return;
  await mongoClient.close();
  mongoClient = null;
}
