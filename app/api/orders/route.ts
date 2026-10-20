import { createIdempotentOrder, parseOrderInput, publicOrder, trackedOrder } from '../../../lib/commerce';
import { apiError, fingerprint, json, readJson, repository, requireOwner } from '../_shared';

export async function POST(request: Request) {
  try {
    const input = parseOrderInput(await readJson(request));
    const store = repository();
    if (input.source !== 'web') await requireOwner(store);
    const hash = await fingerprint(input);
    const order = await store.update(document => createIdempotentOrder(document, input, hash));
    return json({ order: publicOrder(order) }, 201);
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const { state } = await repository().read();
    return json({ order: trackedOrder(state, orderId, token) });
  } catch (error) { return apiError(error); }
}
