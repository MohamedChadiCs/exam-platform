import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import Alert from '../components/Alert';
import Field from '../components/Field';

const STATUS_STYLE = {
  ACTIVE: 'bg-ok-tint text-ok', SUSPENDED: 'bg-pen-tint text-pen',
  PENDING_EMAIL: 'bg-mark-tint text-mark', ARCHIVED: 'bg-paper text-ink-faint',
};

export default function AdminUsers() {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState({ role: '', status: '', q: '' });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null); // user being suspended
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setRows(await api.get(`/admin/users?${qs}`)); setError(null); }
    catch (err) { setError(errorText(err)); }
  }, [filters]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);

  async function act(path, body) {
    try { await api.post(path, body); setTarget(null); setReason(''); setUntil(''); await load(); }
    catch (err) { setError(errorText(err)); }
  }
  const date = (d) => (d ? new Date(d).toLocaleDateString(i18n.language) : t('admin.never'));
  const sel = 'rounded-md border border-line bg-white px-2.5 py-2 text-sm';

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('admin.users')}</h1>
      <p className="mt-1 text-ink-soft">{t('admin.usersSubtitle')}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input className="input max-w-xs" type="search" placeholder={t('common.search')} aria-label={t('common.search')}
          value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={sel} aria-label={t('admin.role')} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">{t('admin.role')}: {t('common.all')}</option>
          {['STUDENT', 'PROFESSOR', 'ADMIN'].map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </select>
        <select className={sel} aria-label={t('admin.statusLabel')} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{t('admin.statusLabel')}: {t('common.all')}</option>
          {Object.keys(STATUS_STYLE).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </div>

      <div className="mt-4"><Alert>{error}</Alert></div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-line text-start text-ink-soft">
            <tr>{['', t('admin.role'), t('admin.statusLabel'), t('admin.created'), t('admin.lastLogin'), t('admin.actions')].map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 text-start font-medium">{h || t('common.email')}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows?.length === 0 && <tr><td colSpan="6" className="px-4 py-8 text-center text-ink-soft">{t('admin.empty')}</td></tr>}
            {rows?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.first_name} {u.last_name}
                    {u.verified_at && <BadgeCheck size={15} className="ms-1.5 inline text-mark" aria-label={t('admin.verified')} />}</div>
                  <div className="text-xs text-ink-soft" dir="ltr">{u.email}</div>
                  {u.status === 'SUSPENDED' && u.suspension_reason && <div className="mt-1 text-xs text-pen">{u.suspension_reason}</div>}
                </td>
                <td className="px-4 py-3">{t(`roles.${u.role}`)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[u.status]}`}>{t(`status.${u.status}`)}</span></td>
                <td className="px-4 py-3 text-ink-soft">{date(u.created_at)}</td>
                <td className="px-4 py-3 text-ink-soft">{date(u.last_login_at)}</td>
                <td className="px-4 py-3">
                  {u.role !== 'ADMIN' && (
                    <div className="flex flex-wrap gap-2">
                      {u.status === 'SUSPENDED'
                        ? <button className="btn-quiet !px-3 !py-1.5" onClick={() => act(`/admin/users/${u.id}/unsuspend`)}>{t('admin.unsuspend')}</button>
                        : u.status !== 'ARCHIVED' && <button className="btn-quiet !px-3 !py-1.5" onClick={() => setTarget(u)}>{t('admin.suspend')}</button>}
                      {u.role === 'PROFESSOR' && !u.verified_at && u.status === 'ACTIVE' &&
                        <button className="btn-quiet !px-3 !py-1.5" onClick={() => act(`/admin/professors/${u.id}/verify`)}>{t('admin.verify')}</button>}
                      {u.status !== 'ARCHIVED' &&
                        <button className="btn-quiet !px-3 !py-1.5 text-pen"
                          onClick={() => window.confirm(t('admin.archiveConfirm')) && act(`/admin/users/${u.id}/archive`)}>{t('admin.archive')}</button>}
                    </div>)}
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>

      {target && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sus-title">
          <form className="w-full max-w-md space-y-4 rounded-lg bg-white p-6"
            onSubmit={(e) => { e.preventDefault(); act(`/admin/users/${target.id}/suspend`, { reason, ...(until && { until: new Date(until).toISOString() }) }); }}>
            <h2 id="sus-title" className="text-lg font-semibold">{t('admin.suspendTitle')}</h2>
            <p className="text-sm text-ink-soft" dir="ltr">{target.email}</p>
            <Field label={t('admin.reason')}>{(id) => (
              <textarea id={id} required minLength={3} maxLength={500} rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />)}</Field>
            <Field label={t('admin.until')} hint={t('admin.suspendHint')}>{(id) => (
              <input id={id} type="datetime-local" className="input" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} />)}</Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-quiet" onClick={() => setTarget(null)}>{t('common.cancel')}</button>
              <button className="btn-danger">{t('admin.suspend')}</button>
            </div>
          </form>
        </div>)}
    </>
  );
}
