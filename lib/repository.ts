import type { StoreState } from './domain';
import { CommerceError } from './commerce';

export type StoreDocument = {
  state: StoreState;
  ownerUserId: string | null;
  idempotencies: Record<string, { fingerprint: string; orderId: string }>;
};
type Row = { document: string; version: number };

/** Demo repository: one aggregate per commerce. A versioned D1 CAS commits orders,
 * inventory, ledger and idempotency together. Replace with normalized tables when
 * volume warrants it; callers depend only on read/update, not the storage shape. */
export class StoreRepository {
  private db: D1Database;
  private seed: () => StoreState;
  private storeId: string;
  constructor(db: D1Database, seed: () => StoreState, storeId = 'burger-house-3') { this.db = db; this.seed = seed; this.storeId = storeId; }

  async read(): Promise<StoreDocument> { return (await this.snapshot()).document; }

  private async snapshot(): Promise<{ document: StoreDocument; version: number }> {
    let row = await this.db.prepare('SELECT document, version FROM commerce_stores WHERE id = ?').bind(this.storeId).first<Row>();
    if (!row) {
      const initial: StoreDocument = { state: this.seed(), ownerUserId: null, idempotencies: {} };
      await this.db.prepare('INSERT OR IGNORE INTO commerce_stores (id, document, version) VALUES (?, ?, 0)').bind(this.storeId, JSON.stringify(initial)).run();
      row = await this.db.prepare('SELECT document, version FROM commerce_stores WHERE id = ?').bind(this.storeId).first<Row>();
    }
    if (!row) throw new CommerceError('No se pudo inicializar el comercio.', 503);
    return { document: JSON.parse(row.document) as StoreDocument, version: row.version };
  }

  async update<T>(mutate: (document: StoreDocument) => T): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { document, version } = await this.snapshot();
      const result = mutate(document);
      const saved = await this.db.prepare('UPDATE commerce_stores SET document = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(document), this.storeId, version).run();
      if (saved.meta.changes === 1) return result;
      // Another request changed inventory. Re-read and re-run all validations.
    }
    throw new CommerceError('Hubo varios cambios simultáneos. Volvé a intentarlo.', 409);
  }

  async requireOwner(userId: string): Promise<void> {
    const current = await this.read();
    if (current.ownerUserId === userId) return;
    if (current.ownerUserId !== null) throw new CommerceError('Esta cuenta no tiene acceso a la administración.', 403);
    await this.update(document => {
      if (document.ownerUserId === null) document.ownerUserId = userId;
      if (document.ownerUserId !== userId) throw new CommerceError('Esta cuenta no tiene acceso a la administración.', 403);
    });
  }
}
