// Only invitation paths may be carried through authentication.
export function authContinuation(next?:string):string {
  return next && /^\/join\?token=[a-f0-9]{64}$/i.test(next) ? next : '/playgrounds';
}
export function authLink(path:'/login'|'/register',next:string):string {
  const safe=authContinuation(next);
  return safe==='/playgrounds'?path:`${path}?next=${encodeURIComponent(safe)}`;
}
