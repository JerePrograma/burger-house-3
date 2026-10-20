import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Aggregate storage keeps payment verification and recipe stock deductions atomic.
export const commerceStores = sqliteTable('commerce_stores', {
  id: text('id').primaryKey(),
  document: text('document').notNull(),
  version: integer('version').notNull().default(0),
});
