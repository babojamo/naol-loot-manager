import {z} from 'zod';
import {emptyReportFilters,type ReportFilters,type ReportType} from './reports';
const date=z.string().refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),'Choose a valid date.');
export const reportFilterSchema=z.object({search:z.string().trim().max(120),from:date,to:date,dungeon:z.string().max(120),member:z.string().max(120),status:z.enum(['','available','sold-out','partial','unsold'])}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,'The start date must be before the end date.');
export const reportTypeSchema=z.enum(['inventory','sales','runs','drops']);
export type ReportShare={id:string;report_type:ReportType;filters:ReportFilters;token:string;enabled:boolean;created_at:string};
export function reportScope(filters:ReportFilters,memberName?:string){return [filters.from&&`From ${filters.from}`,filters.to&&`Through ${filters.to}`,filters.dungeon&&`Dungeon: ${filters.dungeon}`,filters.member&&`Member: ${memberName||'Selected member'}`,filters.status&&`Status: ${filters.status.replace('-',' ')}`,filters.search&&`Search: ${filters.search}`].filter(Boolean) as string[];}
export {emptyReportFilters};
