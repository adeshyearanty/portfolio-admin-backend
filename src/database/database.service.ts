import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  MongoClient,
  Db,
  Collection,
  Document,
  ServerApiVersion,
} from 'mongodb';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private client!: MongoClient;
  private db!: Db;

  async onModuleInit() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('MONGODB_URI is not configured');
    }

    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await this.client.connect();

    const dbName = process.env.MONGODB_DATABASE || 'portfolio_admin';
    this.db = this.client.db(dbName);

    await this.db.command({ ping: 1 });

    this.logger.log(`MongoDB connected successfully to database "${dbName}"`);
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB has not been initialized');
    }

    return this.db;
  }

  collection<T extends Document = Document>(name: string): Collection<T> {
    return this.getDb().collection<T>(name);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.logger.log('MongoDB connection closed');
    }
  }
}
