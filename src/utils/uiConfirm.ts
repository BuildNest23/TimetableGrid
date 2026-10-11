export function uiConfirm(
  message: string,
  opts: { title?: string; yesText?: string; noText?: string; danger?: boolean; icon?: string } = {}
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const confirmed = window.confirm(
      `${opts.icon ? opts.icon + ' ' : ''}${opts.title ? opts.title + '\n\n' : ''}${message}`
    );
    resolve(confirmed);
  });
}