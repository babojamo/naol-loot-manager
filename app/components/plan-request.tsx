"use client";
import {useState} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowUpDown,ArrowRight,X} from 'lucide-react';
import {StyledSelect} from './styled-select';
import {requestedPlans,type RequestedPlan} from '../../lib/plan-request';
export function PlanRequest({currentPlan,sidebar=false}:{currentPlan?:string;sidebar?:boolean}) {
  const [plan,setPlan]=useState<RequestedPlan>(currentPlan==='Elite'?'Legend':'Elite');
  return <Dialog.Root><Dialog.Trigger asChild><button type="button" className={sidebar?'sidebar-plan-request':'lm-button secondary-lm'}><ArrowUpDown size={17}/><span>Request upgrade/downgrade</span></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay"/><Dialog.Content className="plan-request-dialog"><div className="plan-request-heading"><Dialog.Title>Request a plan change</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="Close plan request"><X size={18}/></button></Dialog.Close></div><Dialog.Description>Choose Elite, Legend or Custom. We’ll open a contact draft for you to review and send. Your plan changes only after the administrator processes your request.</Dialog.Description>{currentPlan&&<p>Current assigned plan: <strong>{currentPlan}</strong></p>}<label>Requested plan<StyledSelect aria-label="Requested plan" value={plan} onChange={e=>setPlan(e.target.value as RequestedPlan)}>{requestedPlans.map(p=><option value={p} key={p}>{p}</option>)}</StyledSelect></label><div className="plan-request-actions"><Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close><a className="lm-button" href={`/contact?request=plan&plan=${encodeURIComponent(plan)}`}>Continue to contact <ArrowRight size={17}/></a></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
