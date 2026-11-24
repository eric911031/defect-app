import { useStore, setState } from '../store.js';
import { kv } from '../db.js';
import { go } from '../router.js';
import { Header, Empty } from '../components.jsx';
import { cls, isReadOnly } from '../util.js';

export function selectSite(site) {
  setState({ site });
  kv.set('siteId', site.工地ID);
}

export function Sites() {
  const { user, site } = useStore();
  const all = user?.工地 || [];
  const sites = all.filter(s => !isReadOnly(s));
  const old = all.filter(isReadOnly);
  const pick = s => { selectSite(s); go(user.角色 === '改善者' || isReadOnly(s) ? '/list' : '/register'); };
  return (
    <>
      <Header title="選擇工地" backTo={site ? -1 : null} />
      <main class="page">
        {sites.length === 0 && <Empty>你的帳號還沒有被指派工地，請聯絡管理者。</Empty>}
        <ul class="list">
          {sites.map(s => <SiteRow s={s} on={site?.工地ID === s.工地ID} pick={pick} />)}
        </ul>
        {old.length > 0 && user.角色 === '管理者' && <p class="muted small center">舊建案（{old.length} 個）在「統計 › 舊建案」查看。</p>}
      </main>
    </>
  );
}

function SiteRow({ s, on, pick }) {
  return (
    <li><button class={cls('row big', on && 'on')} onClick={() => pick(s)}>
      <b>{s.名稱}</b><small>{s.工地ID}{s.緯度 !== '' && s.緯度 != null ? '' : '・未設座標'}</small>
    </button></li>
  );
}
