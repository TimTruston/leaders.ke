import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { platformSettings } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { getPlatformSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	return { settings: await getPlatformSettings() };
};

export const actions: Actions = {
	save: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();

		const otpCooldownSeconds = Number(form.get('otpCooldownSeconds'));
		const otpDailyCap = Number(form.get('otpDailyCap'));
		const aspirant = Number(form.get('aspirant'));
		const influencer = Number(form.get('influencer'));
		const mobilizer = Number(form.get('mobilizer'));

		for (const [label, value] of [
			['Cooldown', otpCooldownSeconds],
			['Daily cap', otpDailyCap],
			['Aspirant limit', aspirant],
			['Influencer limit', influencer],
			['Mobilizer limit', mobilizer]
		] as const) {
			if (!Number.isInteger(value) || value < 1) return fail(400, { error: `${label} must be a whole number of at least 1.` });
		}

		// Comma/whitespace-separated words, normalized to lowercase and deduped.
		// These block new leader slugs only — existing slugs are untouched.
		const blockedSlugs = [
			...new Set(
				String(form.get('blockedSlugs') ?? '')
					.split(/[\s,]+/)
					.map((s) => s.trim().toLowerCase())
					.filter(Boolean)
			)
		];

		await db
			.update(platformSettings)
			.set({
				otpCooldownSeconds,
				otpDailyCap,
				inviteLimits: { aspirant, influencer, mobilizer },
				blockedSlugs,
				updatedAt: new Date()
			})
			.where(eq(platformSettings.id, 1));

		return { saved: true };
	}
};
