import { PrismaClient } from '../generated/prisma';
import { config } from './config';

// Create Prisma client with appropriate logging
const prisma = new PrismaClient({
  log: config.isProd ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

// Initialize database connection
export const initializeDataSource = async () => {
  try {
    await prisma.$connect();
    console.log('Prisma has connected to the database!');
  } catch (err) {
    console.error('Error during Prisma connection', err);
    throw err;
  }
};

// Export the prisma client as default
export default prisma;
