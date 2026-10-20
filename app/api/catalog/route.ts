import { publicCatalog } from '../../../lib/commerce';
import { apiError, json, repository } from '../_shared';

export async function GET() {
  try { return json(publicCatalog((await repository().read()).state)); }
  catch (error) { return apiError(error); }
}
