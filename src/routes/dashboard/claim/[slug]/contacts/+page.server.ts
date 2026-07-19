// Claim-family Contacts tab: same form as apply/campaign (ContactsTab), but
// saves stage into the pending claim's evidence — the public profile's real
// contacts are untouched until an admin approves the claim.
import { loadClaimContactsTab, saveClaimContactsTab } from '$lib/server/contactsTab';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => loadClaimContactsTab(event);

export const actions: Actions = {
	save: async (event) => saveClaimContactsTab(event)
};
