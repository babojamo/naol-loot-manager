// Carry only recognized invitation and shared-run paths through authentication.
export function authContinuation(next?:string):string {
  return next && (next==='/account' || /^\/join\?token=[a-f0-9]{64}$/i.test(next) || /^\/shared-runs\/[a-f0-9]{64}$/.test(next)) ? next : '/playgrounds';
}
export function authLink(path:'/login'|'/register',next:string):string {
  const safe=authContinuation(next);
  return safe==='/playgrounds'?path:`${path}?next=${encodeURIComponent(safe)}`;
}
