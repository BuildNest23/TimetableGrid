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
  } = {}
) {
  const printArea = document.getElementById('printArea');
  if (!printArea) return;

  const sizeKey = options.printSize || 'm';
  const mult = (PRINT_SIZES[sizeKey] || PRINT_SIZES.m).mult;
  const portrait = options.orientation === 'portrait';
  const pageH = portrait ? '281mm' : '194mm';

  // Configure @page orientation + height
  const styleId = 'dynamicPrintPage';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @media print {
      @page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: 8mm; }
      #printArea { --page-h: ${pageH}; }
    }
  `;

  // Set --mult on the print area so the CSS can use it
  printArea.style.setProperty('--mult', String(mult));
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