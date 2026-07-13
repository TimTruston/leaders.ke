/**
 * Normalise a Kenyan phone number to Safaricom's required `254XXXXXXXXX` form.
 *
 * Accepts the common ways Kenyans type their number:
 *   0712 345 678 · +254712345678 · 254712345678 · 712345678
 *
 * Returns the 12-digit `254…` string, or `null` if it isn't a valid KE mobile.
 */
export function normalizeKenyanPhone(input: string): string | null {
	if (!input) return null;

	// Strip everything except digits (drops +, spaces, dashes, parens).
	let digits = input.replace(/\D/g, '');

	if (digits.startsWith('254')) {
		// already in international form
	} else if (digits.startsWith('0')) {
		digits = '254' + digits.slice(1);
	} else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
		digits = '254' + digits;
	} else {
		return null;
	}

	return isValidKenyanPhone(digits) ? digits : null;
}

/** True for a 12-digit `254` mobile number (Safaricom/Airtel/Telkom ranges). */
export function isValidKenyanPhone(value: string): boolean {
	return /^254(7\d{8}|1\d{8})$/.test(value);
}

/** Pretty form for display: `0712 345 678`. */
export function formatKenyanPhoneDisplay(value: string): string {
	const normalized = normalizeKenyanPhone(value);
	if (!normalized) return value;
	const local = '0' + normalized.slice(3); // 0712345678
	return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
