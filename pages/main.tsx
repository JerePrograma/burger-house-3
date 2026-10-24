import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '../app/globals.css';
import './ionic-theme.css';
import { acceptAdminSession } from '../lib/client';
import App from '@app-layer';

setupIonicReact({mode:'md',animated:true});
if(import.meta.env.MODE==='management'||import.meta.env.MODE==='native')acceptAdminSession();
createRoot(document.getElementById('root')!).render(<App/>);
