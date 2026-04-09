// lib/utils/numberToWords.js
export const numberToWords = (num) => {
    const ones = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"
    ];
    const tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];
    const thousands = [
        "", "Thousand", "Million", "Billion", "Trillion"
    ];

    if (num === 0) return "Zero";

    let words = "";

    function helper(n) {
        if (n === 0) return "";
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + helper(n % 100) : "");
        for (let i = 0; i < thousands.length; i++) {
            const unit = Math.pow(1000, i + 1);
            if (n < unit * 1000) {
                return helper(Math.floor(n / unit)) + " " + thousands[i + 1] + (n % unit !== 0 ? " " + helper(n % unit) : "");
            }
        }
    }

    words = helper(num).trim();

    return words;
}