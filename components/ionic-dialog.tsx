import { IonModal } from '@ionic/react';
import { useEffect, useRef, type ReactNode } from 'react';
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
  const modal=useRef<HTMLIonModalElement>(null);
  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!viewport||!isOpen)return;
    let frame=0;
    const resize=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        // Follow the keyboard's visible area, while preserving pinch-to-zoom.
        if(viewport.scale!==1||!modal.current)return;
        modal.current.style.setProperty('--bh3-visible-height',`${viewport.height}px`);
        modal.current.style.setProperty('--bh3-visible-top',`${viewport.offsetTop}px`);
      });
    };
    resize();
    viewport.addEventListener('resize',resize);
    viewport.addEventListener('scroll',resize);
    return()=>{cancelAnimationFrame(frame);viewport.removeEventListener('resize',resize);viewport.removeEventListener('scroll',resize);};
  },[isOpen]);
  return <IonModal
    ref={modal}
    className={`bh3-dialog bh3-dialog-${variant} ${wide?'bh3-dialog-wide':''}`}
    isOpen={isOpen}
    aria-label={label}
    backdropDismiss={!busy}
    canDismiss={!busy}
    focusTrap
    onDidDismiss={()=>{if(!busy)onClose();}}
  ><div className={`bh3-dialog-body ${className}`}>{children}</div></IonModal>;
}
