import { createRoot } from 'react-dom/client';
import Store from '../app/page';
import AdminPage from '../app/admin/page';
import { acceptAdminSession } from '../lib/client';
import '../app/globals.css';

acceptAdminSession();
const admin = /\/admin\/?$/.test(location.pathname);
createRoot(document.getElementById('root')!).render(admin ? <AdminPage /> : <Store />);
