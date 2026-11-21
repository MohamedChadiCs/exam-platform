import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Send, Eye, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';

export default function ExamSubmissions() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [submissions, setSubmissions] = useState([]);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected session for grading/review
  const [activeSession, setActiveSession] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [gradingState, setGradingState] = useState({});

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [subRes, exRes] = await Promise.all([
        api.get(`/exams/${id}/submissions`),
        api.get(`/exams/${id}`),
      ]);
      setSubmissions(subRes);
      setExam(exRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleOpenDetail(sessionId) {
    setActiveSession(sessionId);
    try {
      const res = await api.get(`/exams/${id}/submissions/${sessionId}`);
      setSessionDetail(res);
      const initial = {};
      res.questions.forEach((q) => {
        initial[q.question_version_id] = {
          score: q.final_score !== null ? q.final_score : (q.auto_score ?? 0),
          comment: '',
        };
      });
      setGradingState(initial);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveGrade(qvId) {
    try {
      const item = gradingState[qvId];
      await api.post(`/exams/${id}/submissions/${activeSession}/grade`, {
        questionVersionId: qvId,
        manualScore: parseFloat(item.score) || 0,
        comment: item.comment || null,
      });
      // Refresh detail
      const res = await api.get(`/exams/${id}/submissions/${activeSession}`);
      setSessionDetail(res);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePublishResults() {
    if (!confirm(t('submissions.publishConfirm', 'Publish results to all students for this examination?'))) return;
    try {
      await api.post(`/exams/${id}/publish-results`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link to="/app/exams" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Back to Exams
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {exam ? exam.title : 'Submissions & Grading'}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review student attempts, evaluate open questions, and publish exam results.
          </p>
        </div>

        <button onClick={handlePublishResults} className="btn-primary self-start text-xs">
          <Send size={14} /> {t('submissions.publishAll', 'Publish Results to Students')}
        </button>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      {/* Submissions table */}
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : submissions.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-faint">No submissions yet for this exam.</div>
        ) : (
          <table className="w-full text-start text-sm">
            <thead className="border-b border-line bg-paper text-ink-soft">
              <tr>
                <th className="px-4 py-3 text-start font-medium">Student</th>
                <th className="px-4 py-3 text-start font-medium">Matricule</th>
                <th className="px-4 py-3 text-start font-medium">Score</th>
                <th className="px-4 py-3 text-start font-medium">Result</th>
                <th className="px-4 py-3 text-start font-medium">Integrity</th>
                <th className="px-4 py-3 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {submissions.map((s) => (
                <tr key={s.session_id} className="hover:bg-paper/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{s.first_name} {s.last_name}</div>
                    <div className="text-xs text-ink-faint">{s.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{s.matricule}</td>
                  <td className="px-4 py-3 font-semibold">
                    {s.total_score !== null ? `${s.total_score} pts (${s.percentage}%)` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {s.passed !== null ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.passed ? 'bg-ok-tint text-ok' : 'bg-pen-tint text-pen'
                      }`}>
                        {s.passed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {s.passed ? 'Passed' : 'Failed'}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-soft">In Progress</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.security_events_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <ShieldAlert size={12} /> {s.security_events_count} events
                      </span>
                    ) : (
                      <span className="text-xs text-ok">Clean</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => handleOpenDetail(s.session_id)}
                      className="btn-quiet text-xs py-1 px-2.5"
                    >
                      <Eye size={14} /> Review & Grade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review & Grading Drawer / Modal */}
      {sessionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {sessionDetail.session.first_name} {sessionDetail.session.last_name} ({sessionDetail.session.matricule})
                </h2>
                <div className="mt-1 text-xs text-ink-soft">
                  Total Score: <span className="font-bold text-ink">{sessionDetail.session.total_score}</span> / {exam?.max_score} pts • {sessionDetail.session.percentage}%
                </div>
              </div>
              <button onClick={() => setSessionDetail(null)} className="btn-quiet text-xs">
                Close
              </button>
            </div>

            {/* Security events if any */}
            {sessionDetail.securityEvents.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-1.5 font-medium text-xs text-amber-800">
                  <ShieldAlert size={14} /> Integrity Events Recorded ({sessionDetail.securityEvents.length})
                </div>
                <div className="mt-2 space-y-1 text-xs text-amber-700">
                  {sessionDetail.securityEvents.map((e) => (
                    <div key={e.id}>
                      • {new Date(e.received_at).toLocaleTimeString()}: {e.event_type} ({e.severity})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions & Grading */}
            <div className="mt-6 space-y-6">
              {sessionDetail.questions.map((q, idx) => (
                <div key={q.question_version_id} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold text-mark">Question {idx + 1} ({q.type_code})</span>
                      <div className="mt-1 font-medium text-ink">{q.body_md}</div>
                    </div>
                    <span className="text-xs font-bold text-ink-soft">Max: {q.max_points} pts</span>
                  </div>

                  {/* Options */}
                  {q.options && q.options.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {q.options.map((opt) => {
                        const isStudentChoice =
                          q.student_answer?.selectedOptionId === opt.id ||
                          (Array.isArray(q.student_answer?.selectedOptionIds) && q.student_answer.selectedOptionIds.includes(opt.id));
                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between rounded px-3 py-1.5 text-xs ${
                              opt.is_correct ? 'bg-ok-tint text-ok font-medium' :
                              isStudentChoice && !opt.is_correct ? 'bg-pen-tint text-pen line-through' : 'bg-paper text-ink-soft'
                            }`}
                          >
                            <span>{opt.body_md} {opt.is_correct && '✓ (Correct)'}</span>
                            {isStudentChoice && (
                              <span className="text-[10px] font-semibold uppercase">Student selected</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Student Answer for text/numeric */}
                  {(q.type_code === 'SHORT_TEXT' || q.type_code === 'LONG_TEXT' || q.type_code === 'NUMERIC') && (
                    <div className="mt-3 rounded border border-line bg-paper p-2.5 text-xs">
                      <span className="font-semibold text-ink-soft">Student Answer:</span>
                      <div className="mt-1 font-mono text-ink">
                        {q.student_answer?.value !== undefined ? String(q.student_answer.value) :
                         q.student_answer?.text ? String(q.student_answer.text) : '(No answer provided)'}
                      </div>
                    </div>
                  )}

                  {/* Grading Override Form */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="text-xs text-ink-soft">
                      Auto Score: <span className="font-medium">{q.auto_score ?? 'Manual required'}</span>
                      {q.manual_score !== null && <span className="text-mark font-medium"> (Manual override: {q.manual_score})</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Grade:</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        max={q.max_points}
                        value={gradingState[q.question_version_id]?.score ?? ''}
                        onChange={(e) => setGradingState({
                          ...gradingState,
                          [q.question_version_id]: {
                            ...gradingState[q.question_version_id],
                            score: e.target.value,
                          },
                        })}
                        className="input w-20 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveGrade(q.question_version_id)}
                        className="btn-primary text-xs py-1 px-2.5"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
