export class CommerceError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'CommerceError'; this.status = status; }
}
