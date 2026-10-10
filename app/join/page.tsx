import { requireChatGPTUser } from '../chatgpt-auth';
import { JoinClient } from '../components/guild-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Join a guild',robots:{index:false,follow:false}};
export default async function Join({searchParams}:{searchParams:Promise<{token?:string}>}){
  const {token}=await searchParams;await requireChatGPTUser(`/join?token=${encodeURIComponent(token??'')}`);return <JoinClient token={token??''}/>;
}
