/** All amounts are integer paise. */
export const rupees = (r: number) => Math.round(r * 100);
export const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
