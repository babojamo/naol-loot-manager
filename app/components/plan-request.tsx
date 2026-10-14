"use client";
import {useState} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowUpDown,ArrowRight,X} from 'lucide-react';
import {StyledSelect} from './styled-select';
import {requestedPlans,type RequestedPlan} from '../../lib/plan-request';
import {planLabel} from '../../lib/support';
export function PlanRequest({currentPlan,sidebar=false}:{currentPlan?:string;sidebar?:boolean}) {
  const [plan,setPlan]=useState<RequestedPlan>(currentPlan==='Elite'?'Legend':'Elite');
  return <Dialog.Root><Dialog.Trigger asChild><button type="button" className={sidebar?'sidebar-plan-request':'lm-button secondary-lm'}><ArrowUpDown size={17}/><span>Subscribe</span></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay"/><Dialog.Content className="plan-request-dialog"><div className="plan-request-heading"><Dialog.Title>Support the next adventure</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="Close subscription request"><X size={18}/></button></Dialog.Close></div><Dialog.Description>Choose optional Elite, Legend or Custom support. Review and send a prepared contact message to arrange your contribution with the NAOL team. Opening this form does not subscribe or charge you.</Dialog.Description>{currentPlan&&<p>Current tier: <strong>{planLabel(currentPlan)}</strong></p>}<label>Supporter tier<StyledSelect aria-label="Supporter tier" value={plan} onChange={e=>setPlan(e.target.value as RequestedPlan)}>{requestedPlans.map(p=><option value={p} key={p}>{p==='Custom'?'Custom support':`${p} Supporter`}</option>)}</StyledSelect></label><p><a href="/support">View supporter benefits</a> · <a href="/contact?request=donation">Make a one-time donation</a></p><div className="plan-request-actions"><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><a className="lm-button" href={`/contact?request=plan&plan=${encodeURIComponent(plan)}`}>Continue to contact <ArrowRight size={17}/></a></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
