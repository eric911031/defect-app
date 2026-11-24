import { useEffect, useState } from 'preact/hooks';
import { useStore, setState, getState, toast } from './store.js';
import { useRoute, go } from './router.js';
import { auth } from './auth.js';
import { kv } from './db.js';
import { loadMe, loadCodes } from './data.js';
import { startAutoSync, flush } from './queue.js';
import { errText } from './api.js';
import { isReadOnly } from './util.js';
import { Toast, TabBar, Spinner } from './components.jsx';
import { Login } from './pages/Login.jsx';
import { Sites, selectSite } from './pages/Sites.jsx';
import { Register } from './pages/Register.jsx';
import { List } from './pages/List.jsx';
import { Detail, Fix } from './pages/Detail.jsx';
import { Review } from './pages/Review.jsx';
import { Stats } from './pages/Stats.jsx';
import { Report } from './pages/Report.jsx';
import { Manage } from './pages/Manage.jsx';
import { Queue } from './pages/Queue.jsx';
import { More, Help, Settings } from './pages/More.jsx';

let syncStarted = false;

export function App() {
  const route = useRoute();
  const { user, site, needLogin } = useStore();
  const [boot, setBoot] = useState('loading'); // loading | login | ready | error
  const [bootErr, setBootErr] = useState('');

  async function start() {
    setBoot('loading');
    const a = auth.current();
    if (!a || a.expired) { setBoot('login'); return; }
    // 有快取時先直接顯示畫面，背景再向後端更新（Apps Script 冷啟動要 1–3 秒）
    const cachedMe = await kv.get('me').catch(() => null);
    if (cachedMe && !needLogin) {
      await enter(cachedMe);
      loadMe().then(me => { if (me.sessionToken) auth.setSession(me.sessionToken, me.sessionExp); setState({ user: me }); const s = getState().site; if (s) { const ns = me.工地?.find(x => x.工地ID === s.工地ID); if (ns) setState({ site: ns }); } }).catch(e => { if (e.code === 'UNAUTHENTICATED' || e.code === 'FORBIDDEN') handleErr(e); });
      return;
    }
    try {
      const me = await loadMe();
      if (me.sessionToken) auth.setSession(me.sessionToken, me.sessionExp);
      await enter(me);
    } catch (e) { handleErr(e); }
  }
  async function enter(me) {
    setState({ user: me, needLogin: false });
    loadCodes();
    const sid = await kv.get('siteId');
    const s = me.工地?.find(x => x.工地ID === sid) || (me.工地?.length === 1 ? me.工地[0] : null);
    if (s) selectSite(s);
    setBoot('ready');
    if (!syncStarted) { syncStarted = true; startAutoSync(); } else flush();
  }
  function handleErr(e) {
    {
      if (e.code === 'UNAUTHENTICATED' || e.code === 'FORBIDDEN') {
        kv.del('me').catch(() => {});
        setState({ user: null });
        auth.logout();
        setBootErr(e.code === 'FORBIDDEN' ? '這個帳號沒有使用權限，請聯絡管理者把你加入「使用者」名單。' : '');
        setBoot('login');
      } else { setBootErr(errText(e)); setBoot('error'); }
    }
  }
  useEffect(() => { start(); }, []);

  if (route.path === '/settings') return <><Settings /><Toast /></>;
  if (boot === 'loading') return <div class="boot"><Spinner label="啟動中…" /></div>;
  if (boot === 'login' || needLogin || (boot === 'ready' && !user)) return <><Login expired={needLogin || auth.current()?.expired} onLogin={start} />{bootErr && <p class="err center">{bootErr}</p>}<Toast /></>;
  if (boot === 'error') return <div class="boot"><p class="err">{bootErr}</p><button class="btn" onClick={start}>重試</button></div>;

  const [p0, p1] = route.parts;
  let page;
  if (!site || p0 === 'sites') page = <Sites />;
  else switch (p0) {
    case 'register': page = user.角色 === '改善者' || isReadOnly(site) ? <List /> : <Register />; break;
    case 'list': page = <List />; break;
    case 'defect': page = <Detail id={decodeURIComponent(p1)} />; break;
    case 'fix': page = <Fix id={decodeURIComponent(p1)} />; break;
    case 'review': page = user.角色 === '管理者' ? <Review /> : null; break;
    case 'stats': page = user.角色 === '管理者' ? <Stats /> : null; break;
    case 'report': page = user.角色 === '管理者' ? <Report /> : null; break;
    case 'manage': page = user.角色 === '管理者' ? <Manage /> : null; break;
    case 'queue': page = <Queue />; break;
    case 'more': page = <More />; break;
    case 'help': page = <Help />; break;
    default: page = null;
  }
  if (!page) { setTimeout(() => go(user.角色 === '改善者' ? '/list' : '/register')); return null; }
  return (
    <div class="app">
      {page}
      {site && p0 !== 'sites' && <TabBar path={route.path} />}
      <Toast />
    </div>
  );
}
