export const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const titleCase = (s: string) =>
  s.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
