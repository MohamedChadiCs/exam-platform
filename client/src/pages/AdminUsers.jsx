import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Search, Filter, Shield, UserX, UserCheck, Archive } from 'lucide-react';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import Alert from '../components/Alert';
import Field from '../components/Field';
import { useConfirm } from '../lib/ConfirmContext';

const STATUS_STYLE = {
  ACTIVE: 'border-ok/30 bg-ok-tint text-ok',
  SUSPENDED: 'border-pen/30 bg-pen-tint text-pen',
  PENDING_EMAIL: 'border-mark/30 bg-mark-tint text-mark',
  ARCHIVED: 'border-line bg-paper text-ink-faint',
};

export default function AdminUsers() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ role: '', status: '', q: '' });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null); // user being suspended
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try {
      setRows(await api.get(`/admin/users?${qs}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [filters]);

  useEffect(() => {
    const h = setTimeout(load, 250);
    return () => clearTimeout(h);
  }, [load]);

  async function act(path, body) {
    try {
      await api.post(path, body);
      setTarget(null);
      setReason('');
      setUntil('');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const date = (d) => (d ? new Date(d).toLocaleDateString(i18n.language) : t('admin.never'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('admin.users')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('admin.usersSubtitle')}</p>
      </div>

      {/* Filter Toolbar */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-ink-faint" />
            <input
              className="input ps-10"
              type="search"
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <select
              className="select text-sm"
              aria-label={t('admin.role')}
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            >
              <option value="">{t('admin.role')}: {t('common.all')}</option>
              {['STUDENT', 'PROFESSOR', 'ADMIN'].map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
            <select
              className="select text-sm"
              aria-label={t('admin.statusLabel')}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">{t('admin.statusLabel')}: {t('common.all')}</option>
              {Object.keys(STATUS_STYLE).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Users Table */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr>
                {['', t('admin.role'), t('admin.statusLabel'), t('admin.created'), t('admin.lastLogin'), t('admin.actions')].map((h, i) => (
                  <th key={i} scope="col" className="table-header-cell">
                    {h || t('common.email')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows?.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-ink-soft">
                    {t('admin.empty')}
                  </td>
                </tr>
              )}
              {rows?.map((u) => {
                const initials = `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase() || 'U';
                return (
                  <tr key={u.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper font-semibold text-xs text-ink">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <span>{u.first_name} {u.last_name}</span>
                            {u.verified_at && (
                              <BadgeCheck size={16} className="text-mark shrink-0" aria-label={t('admin.verified')} />
                            )}
                          </div>
                          <div className="text-xs text-ink-soft font-mono" dir="ltr">{u.email}</div>
                          {u.status === 'SUSPENDED' && u.suspension_reason && (
                            <div className="mt-1 text-xs text-pen font-medium">{u.suspension_reason}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell font-medium">
                      <span className="inline-flex items-center rounded-md bg-paper px-2 py-0.5 text-xs text-ink">
                        {t(`roles.${u.role}`)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge border ${STATUS_STYLE[u.status]}`}>
                        {t(`status.${u.status}`)}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-ink-soft">{date(u.created_at)}</td>
                    <td className="table-cell text-xs text-ink-soft">{date(u.last_login_at)}</td>
                    <td className="table-cell">
                      {u.role !== 'ADMIN' && (
                        <div className="flex flex-wrap gap-1.5">
                          {u.status === 'SUSPENDED' ? (
                            <button
                              className="btn-quiet btn-sm text-ok hover:bg-ok-tint/40"
                              onClick={() => act(`/admin/users/${u.id}/unsuspend`)}
                            >
                              {t('admin.unsuspend')}
                            </button>
                          ) : (
                            u.status !== 'ARCHIVED' && (
                              <button
                                className="btn-quiet btn-sm hover:text-pen hover:bg-pen-tint/40"
                                onClick={() => setTarget(u)}
                              >
                                {t('admin.suspend')}
                              </button>
                            )
                          )}
                          {u.role === 'PROFESSOR' && !u.verified_at && u.status === 'ACTIVE' && (
                            <button
                              className="btn-quiet btn-sm text-mark hover:bg-mark-tint/40"
                              onClick={() => act(`/admin/professors/${u.id}/verify`)}
                            >
                              {t('admin.verify')}
                            </button>
                          )}
                          {u.status !== 'ARCHIVED' && (
                            <button
                              className="btn-quiet btn-sm text-pen hover:bg-pen-tint/40"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: t('admin.archiveTitle', 'Archive User'),
                                  message: t('admin.archiveConfirm'),
                                  confirmLabel: t('admin.archive', 'Archive'),
                                  variant: 'danger',
                                });
                                if (ok) act(`/admin/users/${u.id}/archive`);
                              }}
                            >
                              {t('admin.archive')}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspend User Modal Dialog */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sus-title"
        >
          <form
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-line"
            onSubmit={(e) => {
              e.preventDefault();
              act(`/admin/users/${target.id}/suspend`, {
                reason,
                ...(until && { until: new Date(until).toISOString() }),
              });
            }}
          >
            <div>
              <h2 id="sus-title" className="text-lg font-bold tracking-tight text-ink">
                {t('admin.suspendTitle')}
              </h2>
              <p className="mt-1 text-xs text-ink-soft font-mono" dir="ltr">
                {target.email}
              </p>
            </div>

            <Field label={t('admin.reason')}>
              {(id) => (
                <textarea
                  id={id}
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>

            <Field label={t('admin.until')} hint={t('admin.suspendHint')}>
              {(id) => (
                <input
                  id={id}
                  type="datetime-local"
                  className="input font-mono text-xs"
                  dir="ltr"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              )}
            </Field>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setTarget(null)}
              >
                {t('common.cancel')}
              </button>
              <button className="btn-danger">
                {t('admin.suspend')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
