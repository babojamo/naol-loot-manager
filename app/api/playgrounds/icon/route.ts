import {api,guildContext,requireAdmin,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function PUT(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const text=await request.text();if(text.length>91000)throw new ApiError(413,'Choose a smaller icon.');
  const {icon}=JSON.parse(text) as {icon:unknown};
  if(icon!==null){
    if(typeof icon!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(icon))throw new ApiError(400,'Upload a valid image.');
    let bytes:string;try{bytes=atob(icon.slice(23));}catch{throw new ApiError(400,'Upload a valid image.');}
    if(bytes.length>65536||bytes.slice(0,4)!=='RIFF'||bytes.slice(8,12)!=='WEBP')throw new ApiError(400,'Upload a valid icon under 64 KB.');
  }
  await database('guild_icon_update',user,guild.id,{icon});return json({ok:true});
},request);}
