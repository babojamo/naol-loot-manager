import {requireAccountUser} from '../../lib/account-auth';
import {AccountSettings} from '../components/account-settings';
export const dynamic='force-dynamic';
export const metadata={title:'Account Settings',robots:{index:false,follow:false}};
export default async function Account(){await requireAccountUser('/account');return <AccountSettings/>;}
