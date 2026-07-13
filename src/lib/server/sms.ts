import { env } from '$env/dynamic/private';

/**
 * Sends an SMS via Africa's Talking. With AFRICASTALKING_API_KEY set it posts to
 * their REST API; otherwise (dev) it logs the message to the console so SMS flows
 * stay testable without a provider — copy the code from the terminal.
 */
export async function sendSms(to: string, message: string): Promise<void> {
	const apiKey = env.AFRICASTALKING_API_KEY;
	const username = env.AFRICASTALKING_USERNAME;

	if (!apiKey || !username) {
		console.log(`\n──── sms (stub) ────\nto: +${to}\n\n${message}\n─────────────────────\n`);
		return;
	}

	const res = await fetch('https://api.africastalking.com/version1/messaging', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
			apiKey
		},
		body: new URLSearchParams({ username, to: `+${to}`, message })
	});

	if (!res.ok) {
		throw new Error(`Africa's Talking send failed (${res.status}): ${await res.text()}`);
	}
}
