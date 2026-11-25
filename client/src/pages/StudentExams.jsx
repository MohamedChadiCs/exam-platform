import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Play, BookOpen, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';

export default function StudentExams() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState('');

  async function loadExams() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/student/exams');
      setExams(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExams();
  }, []);

  async function handleStart(examId) {
    setStartingId(examId);
    setError('');
    try {
      await document.documentElement.requestFullscreen?.().catch(() => {});
      const res = await api.post(`/student/exams/${examId}/start`, {});
      navigate(`/app/exam-session/${res.sessionId}`);
    } catch (err) {
      setError(err.message);
      setStartingId('');
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('studentExams.title', 'My Examinations')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('studentExams.subtitle', 'All examinations you are currently enrolled in.')}
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : exams.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 text-center">
            <p className="text-sm text-ink-soft">You are not enrolled in any examinations yet.</p>
            <button onClick={() => navigate('/app/exams/join')} className="btn-primary mt-4 text-xs">
              Join an Exam with Access Code
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((ex) => {
              const now = new Date();
              const opensAt = new Date(ex.opens_at);
              const closesAt = new Date(ex.closes_at);
              const isUpcoming = now < opensAt;
              const isClosed = now > closesAt;
              const hasActiveSession = !!ex.active_session_id;
              const hasCompleted = ex.submitted_count >= ex.max_attempts;

              return (
                <div key={ex.id} className="rounded-lg border border-line bg-white p-5 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-base">{ex.title}</span>
                        <span className="rounded bg-paper px-2 py-0.5 text-xs text-ink-soft">
                          {ex.course_code} - {ex.course_name}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft">
                        <span className="flex items-center gap-1">
                          <Clock size={14} /> {ex.duration_minutes} minutes
                        </span>
                        <span>
                          Attempts: {ex.attempts_made} / {ex.max_attempts}
                        </span>
                        <span>
                          Pass mark: {ex.passing_score} / {ex.max_score} pts
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-ink-faint">
                        Available: {opensAt.toLocaleString()} → {closesAt.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      {hasActiveSession ? (
                        <button
                          onClick={async () => {
                            await document.documentElement.requestFullscreen?.().catch(() => {});
                            navigate(`/app/exam-session/${ex.active_session_id}`);
                          }}
                          className="btn-primary"
                        >
                          <Play size={16} /> Resume Examination
                        </button>
                      ) : hasCompleted ? (
                        <span className="inline-flex items-center gap-1 rounded bg-ok-tint px-3 py-1.5 text-xs font-medium text-ok">
                          <CheckCircle size={14} /> Completed
                        </span>
                      ) : isUpcoming ? (
                        <span className="inline-flex items-center gap-1 rounded bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft">
                          <Clock size={14} /> Upcoming
                        </span>
                      ) : isClosed ? (
                        <span className="rounded bg-paper px-3 py-1.5 text-xs text-pen">
                          Closed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleStart(ex.id)}
                          disabled={startingId === ex.id}
                          className="btn-primary"
                        >
                          <Play size={16} /> {startingId === ex.id ? t('common.loading') : 'Start Examination'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
