import type { AnchorHTMLAttributes } from 'react';
import { pageUrl } from './client';
export default function Link({href = '/', ...props}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={pageUrl(href)} />;
}
