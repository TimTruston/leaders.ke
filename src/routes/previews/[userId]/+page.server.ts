import { error, redirect } from '@sveltejs/kit';
import { getDomainUser, leaderPath } from '$lib/server/leader';
import { loadPublicProfileData } from '$lib/server/publicProfile';
import type { PageServerLoad } from './$types';

// /previews/[userId]: the live profile of an application that has no public slug
// yet (a slug is only minted on approval — see reviewVerification). Keyed by the
// person's user id, and gated by loadPublicProfileData to an admin, the profile's
// own person, or one of its active managers; everyone else gets a 404.
export const load: PageServerLoad = async ({ params, locals }) => {
	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;
	const data = await loadPublicProfileData(Number(params.userId), {
		viewerId: viewer?.id,
		isAdmin: !!viewer?.adminAt
	});
	if (!data) error(404, 'Profile not found');
	// Once approved the profile is public at its slug — send the preview there so the
	// canonical URL takes over the moment verification mints the slug.
	if (data.leader.verified && data.leader.slug) redirect(302, leaderPath({ slug: data.leader.slug }));
	return { ...data, preview: true };
};
