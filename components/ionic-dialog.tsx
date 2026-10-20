import { IonModal } from '@ionic/react';
import type { ReactNode } from 'react';
import '../app/ionic-dialog.css';

type IonicDialogProps = {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
  variant?: 'store' | 'admin';
  wide?: boolean;
  busy?: boolean;
  isOpen?: boolean;
};

/** Ionic owns overlay focus, Escape, backdrop and Android back-button dismissal. */
export default function IonicDialog({children,label,onClose,className='',variant='admin',wide=false,busy=false,isOpen=true}:IonicDialogProps) {
  return <IonModal
    className={`bh3-dialog bh3-dialog-${variant} ${wide?'bh3-dialog-wide':''}`}
    isOpen={isOpen}
    aria-label={label}
    backdropDismiss={!busy}
    canDismiss={!busy}
    focusTrap
    onDidDismiss={()=>{if(!busy)onClose();}}
  ><div className={`bh3-dialog-body ${className}`}>{children}</div></IonModal>;
}
