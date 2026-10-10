"use client";
import {Dialog} from 'radix-ui';
import {MessageCircle,X} from 'lucide-react';
import type {ShopPlayground} from '../../lib/public-shop';
export function ContactVendor({playground,itemName}:{playground:ShopPlayground;itemName:string}){
  return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="contact-vendor-button" aria-label={`Contact ${playground.name} about ${itemName}`}><MessageCircle size={15}/>Contact Vendor</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay"/><Dialog.Content className="plan-request-dialog vendor-contact-dialog"><div className="plan-request-heading"><Dialog.Title>Contact Vendor</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="Close vendor message"><X size={18}/></button></Dialog.Close></div><Dialog.Description>Message from {playground.name} · {itemName}</Dialog.Description><div className="vendor-contact-message">{playground.vendor_contact_message?.trim()||'This vendor has not provided contact details yet.'}</div><div className="plan-request-actions"><Dialog.Close asChild><button type="button">Close</button></Dialog.Close></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
