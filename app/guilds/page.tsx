import { requireChatGPTUser } from '../chatgpt-auth';
import { GuildsClient } from '../components/guild-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Your guilds',robots:{index:false,follow:false}};
export default async function Guilds(){await requireChatGPTUser('/guilds');return <GuildsClient/>;}
