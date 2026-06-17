// lib/utils/numberToWords.js — Indian numbering system (Thousands, Lakhs, Crores)
export const numberToWords = (num) => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  if (!Number.isFinite(num) || num < 0) return "Zero";
  num = Math.round(num);
  if (num === 0) return "Zero";

  // Converts numbers up to 999
  function belowThousand(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + belowThousand(n % 100) : "");
  }

  // Converts numbers up to 99 (for lakh/crore groups)
  function belowHundred(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
  }

  const crore    = Math.floor(num / 10000000);
  const lakh     = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest     = num % 1000;

  let words = "";

  if (crore > 0)    words += belowHundred(crore) + " Crore ";
  if (lakh > 0)     words += belowHundred(lakh) + " Lakh ";
  if (thousand > 0) words += belowHundred(thousand) + " Thousand ";
  if (rest > 0)     words += belowThousand(rest);

  return words.trim();
};
