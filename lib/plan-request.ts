export const requestedPlans=['Elite','Legend','Custom'] as const;
export type RequestedPlan=typeof requestedPlans[number];
export function isRequestedPlan(value?:string):value is RequestedPlan {
  return requestedPlans.some(plan=>plan===value);
}
export function planRequestDraft(target:RequestedPlan,account:{name:string;username:string;plan:string}) {
  const label=account.plan==='Free'?'Community':`${account.plan} Supporter`;
  const subject=target==='Custom'?'Custom support inquiry':'Subscribe: '+target+' Supporter';
  const amount=target==='Elite'?'500M Penya per month':target==='Legend'?'1B Penya per month':'';
  const message=`Hello NAOL team,\n\nI would like to ${target==='Custom'?'discuss a Custom support arrangement':`subscribe as ${target==='Elite'?'an':'a'} ${target} Supporter`}.\n\nName: ${account.name||'[Your name]'}\nUsername: ${account.username?'@'+account.username:'[Your username, if registered]'}\nCurrent tier: ${label}\nRequested support: ${target}${amount?'\nSuggested contribution: '+amount:''}\n\n${target==='Custom'?'My playground, manager and feature requirements:\n[Please describe your needs here.]':'Please let me know how to arrange my in-game contribution and activate my supporter benefits.'}\n\nShowcase playground (optional): [A playground you own or manage]\n\nThank you for keeping NAOL available to the community.`;
  return {subject,message};
}
