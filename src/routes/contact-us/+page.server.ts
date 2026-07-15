// Contact form: relays the message to the platform inbox via sendEmail
// (Postmark when POSTMARK_TOKEN is set, console stub in dev).
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/server/email';
import type { Actions } from './$types';

export const actions: Actions = {
	send: async (event) => {
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const topic = String(form.get('topic') ?? '').trim();
		const message = String(form.get('message') ?? '').trim();
		// Honeypot: hidden field humans never fill — bots that do get a silent "ok".
		if (String(form.get('website') ?? '')) return { sent: true };

		if (!name || !email || !message) {
			return fail(400, { error: 'Your name, email, and a message are required.', name, email, topic, message });
		}
		if (!email.includes('@')) {
			return fail(400, { error: 'Enter a valid email address.', name, email, topic, message });
		}
		if (message.length > 5000) {
			return fail(400, { error: 'Keep the message under 5000 characters.', name, email, topic, message });
		}

		try {
			await sendEmail({
				to: env.SUPPORT_EMAIL || 'hello@leaders.ke',
				subject: `[contact-us] ${topic || 'General'}: ${name}`,
				text: `From: ${name} <${email}>\nTopic: ${topic || 'General'}\n\n${message}`
			});
		} catch {
			return fail(500, { error: 'Could not send your message right now. Please try again shortly.', name, email, topic, message });
		}

		return { sent: true };
	}
};
