import type {SupporterBadge} from '../../lib/support';
const badges:Record<SupporterBadge,string>={'Supporter':'supporter','Elite Supporter':'elite','Legend Supporter':'legend'};
export function SupporterEmblem({badge,className=''}:{badge:SupporterBadge;className?:string}){
  return <img className={`supporter-emblem ${className}`} src={`/brand/badges/${badges[badge]}.webp`} width={80} height={80} alt={`${badge} badge`} title={badge}/>;
}
