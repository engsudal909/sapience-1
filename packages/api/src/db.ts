import { PrismaClient } from '../generated/prisma';
import { config } from './config';

const renderServiceName = process.env.RENDER_SERVICE_NAME;
const shouldLogInLive =
  renderServiceName === 'candle-cache-builder' ? false : true;

const isLive =
  config.NODE_ENV === 'production' || config.NODE_ENV === 'staging';

// Create Prisma client with appropriate logging
const prisma = new PrismaClient({
  log:
    isLive && shouldLogInLive
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
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
