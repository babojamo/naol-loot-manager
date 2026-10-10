export const requestedPlans=['Elite','Legend','Custom'] as const;
export type RequestedPlan=typeof requestedPlans[number];
export function isRequestedPlan(value?:string):value is RequestedPlan {
  return requestedPlans.some(plan=>plan===value);
}
export function planRequestDraft(target:RequestedPlan,account:{name:string;username:string;plan:string}) {
  const direction=account.plan==='Legend'&&target==='Elite'?'downgrade':account.plan==='Free'&&target!=='Custom'||account.plan==='Elite'&&target==='Legend'?'upgrade':'change';
  const subject=target==='Custom'?'Custom plan request':`Plan ${direction} request: ${account.plan} to ${target}`;
  const message=`Hello NAOL team,\n\nI would like to request ${target==='Custom'?'a Custom plan':`a plan ${direction} to ${target}`}.\n\nName: ${account.name}\nUsername: @${account.username}\nCurrent assigned plan: ${account.plan}\nRequested plan: ${target}\n\n${target==='Custom'?'My preferred playground, run, manager limits and features:\n[Please describe your requirements here.]':'Please let me know the next steps and any payment or scheduling requirements.'}\n\nThank you.`;
  return {subject,message};
}
