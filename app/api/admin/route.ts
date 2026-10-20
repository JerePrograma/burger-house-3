import { applyAdminAction, parseAdminAction } from '../../../lib/commerce';
import { apiError, json, readJson, repository, requireOwner } from '../_shared';

export async function GET() {
  try {
    const store = repository();
    await requireOwner(store);
    return json((await store.read()).state);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const store = repository();
    await requireOwner(store);
    const action = parseAdminAction(body);
    const state = await store.update(document => {
      applyAdminAction(document.state, action);
      return document.state;
    });
    return json({ state });
  } catch (error) { return apiError(error); }
}
