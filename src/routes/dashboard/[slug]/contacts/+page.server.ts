// Contacts tab (campaign + apply families): the person's public contact info.
// Only reachable once a profile exists — the layout nav gates the tab on a saved
// profile, since contacts attach to the person created by that first save.
import { loadContactsTab, saveContactsTab } from '$lib/server/contactsTab';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => loadContactsTab(event);

export const actions: Actions = {
	save: async (event) => saveContactsTab(event)
};
