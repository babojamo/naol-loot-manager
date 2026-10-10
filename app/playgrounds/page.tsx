import {requireAccountUser} from '../../lib/account-auth';
import {GuildsClient} from '../components/guild-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Your playgrounds',robots:{index:false,follow:false}};
export default async function Playgrounds(){await requireAccountUser();return <GuildsClient/>;}
