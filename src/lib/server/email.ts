import { env } from '$env/dynamic/private';

interface Mail {
	to: string;
	subject: string;
	text: string;
}

/**
 * Sends a transactional email. With POSTMARK_TOKEN set it posts to Postmark;
 * otherwise (dev) it logs the message to the console so email flows stay testable
 * without a provider — copy the link from the terminal.
 */
export async function sendEmail({ to, subject, text }: Mail): Promise<void> {
	const token = env.POSTMARK_TOKEN;
	const from = env.EMAIL_FROM || 'noreply@leaders.ke';

	if (!token) {
		console.log(`\n──── email (stub) ────\nto:      ${to}\nsubject: ${subject}\n\n${text}\n──────────────────────\n`);
		return;
	}

	const res = await fetch('https://api.postmarkapp.com/email', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'X-Postmark-Server-Token': token
		},
		body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, MessageStream: 'outbound' })
	});

	if (!res.ok) {
		throw new Error(`Postmark send failed (${res.status}): ${await res.text()}`);
	}
}
