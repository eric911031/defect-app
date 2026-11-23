import { useEffect, useState } from 'preact/hooks';

function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function useRoute() {
  const [r, setR] = useState(parse());
  useEffect(() => { const f = () => { setR(parse()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
export function go(path) { location.hash = path; }
export function back(fallback = '/') { if (history.length > 1) history.back(); else go(fallback); }
