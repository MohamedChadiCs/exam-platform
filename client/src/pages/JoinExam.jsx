import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useAuth } from '../lib/AuthContext';

export default function JoinExam() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const notApproved = user?.role === 'STUDENT' && !user?.isApproved;

  async function handleJoin(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setSuccess(null);
    try {
      const res = await api.post('/student/exams/join', { code: code.trim().toUpperCase() });
      setSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mark-tint text-mark">
          <KeyRound size={24} />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">{t('join.title', 'Join an Examination')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t('join.subtitle', 'Enter the 8-character access code provided by your professor to enroll.')}
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-line bg-white p-6 shadow-sm">
        {notApproved && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              {t('approval.notApproved', 'Your account has not been approved yet. Please wait for administrator approval.')}
            </p>
          </div>
        )}
        {error && <div className="mb-4"><Alert variant="danger">{error}</Alert></div>}

        {success ? (
          <div className="text-center py-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ok-tint text-ok">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-ink">
              {success.alreadyEnrolled ? 'Already Enrolled' : 'Successfully Enrolled!'}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              You are enrolled in <span className="font-semibold text-ink">{success.examTitle}</span>.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => navigate('/app/exams/take')} className="btn-primary">
                View in My Exams <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="mb-2 block text-center text-xs font-medium uppercase tracking-wider text-ink-soft">
                {t('join.codeLabel', '8-Character Access Code')}
              </label>
              <input
                type="text"
                required
                maxLength={10}
                placeholder="e.g. 7K2M9X4P"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input py-3 text-center font-mono text-2xl font-bold tracking-widest uppercase text-mark"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.trim().length < 6 || notApproved}
              className="btn-primary w-full py-3"
            >
              {loading ? t('common.loading') : t('join.submit', 'Enroll in Exam')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
