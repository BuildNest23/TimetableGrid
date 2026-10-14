import { PRINT_SIZES } from '../types/timetable';

declare global {
  interface Window {
    AndroidPrint?: {
      printPage?: () => void;
    };
  }
}

export function triggerPrint(
  htmlContent: string,
  options: {
    printSize?: 'xs' | 's' | 'm' | 'l' | 'xl';
    orientation?: 'landscape' | 'portrait';
    margin?: string;
    pageSize?: string;
  } = {}
) {
  const printArea = document.getElementById('printArea');
  if (!printArea) return;

  const sizeKey = options.printSize;
  const mult = sizeKey ? (PRINT_SIZES[sizeKey] || PRINT_SIZES.m).mult : 1;
  const portrait = options.orientation === 'portrait';
  const pageH = portrait ? '281mm' : '194mm';
  const marginStr = options.margin !== undefined ? options.margin : '8mm';
  const pageSize = options.pageSize || 'A4';

  // Configure @page orientation, size, margin + height
  const styleId = 'dynamicPrintPage';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @media print {
      @page { size: ${pageSize} ${portrait ? 'portrait' : 'landscape'}; margin: ${marginStr}; }
      html, body { background: #fff !important; color: #000 !important; }
      #root > div > :not(#printArea) { display: none !important; }
      #root > div { min-height: 0 !important; display: block !important; }
      #printArea { display: block !important; width: 100% !important; background: #fff !important; --page-h: ${pageH}; }
    }
  `;

  if (sizeKey) {
    printArea.style.setProperty('--mult', String(mult));
  } else {
    printArea.style.removeProperty('--mult');
  }
  printArea.innerHTML = htmlContent;
  printArea.style.display = 'block';

  const cleanup = () => {
    printArea.innerHTML = '';
    printArea.style.display = 'none';
    window.removeEventListener('afterprint', cleanup);
    clearTimeout(fallbackTimer);
  };

  // Android bridge has no afterprint → long fallback
  const isAndroid = !!(window.AndroidPrint && typeof window.AndroidPrint.printPage === 'function');
  const fallbackMs = isAndroid ? 60000 : 5000;
  const fallbackTimer = window.setTimeout(cleanup, fallbackMs);
  window.addEventListener('afterprint', cleanup);

  // Give the browser 2 frames to lay out, then print
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        if (isAndroid) {
          window.AndroidPrint!.printPage!();
        } else {
          window.print();
        }
      } catch (err) {
        console.error('Print error:', err);
      }
    });
  });
}