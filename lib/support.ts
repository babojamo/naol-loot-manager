export function planLabel(plan?: string) {return !plan || plan === 'Free' ? 'Community' : `${plan} Supporter`;}
export type SupporterBadge = 'Supporter' | 'Elite Supporter' | 'Legend Supporter';
export type Supporter = {username: string; badge: SupporterBadge; playground: {name: string; slug: string; icon: string | null; shopEnabled: boolean; inquiriesEnabled: boolean}};
export type SupporterPage = {supporters: Supporter[]; total: number; page: number; pages: number};
export type SupporterSettings = {showcaseEnabled: boolean; sidebarBadgeEnabled: boolean; featured: boolean; featuredOrder: number; published: boolean; guildId: string | null; badge: SupporterBadge; playgrounds: Array<{id: string; name: string; icon: string | null; role: 'owner' | 'manager'}>};
