import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, CheckCircle, XCircle, Eye, Clock, FileText } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import CodeMorph from '../components/CodeMorph';

export default function StudentResults() {
  const { t } = useTranslation();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detail / Review Modal
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadResults() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/student/results');
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadResults();
  }, []);

  async function handleOpenReview(sessionId) {
    setDetailLoading(true);
    try {
      const res = await api.get(`/student/results/${sessionId}`);
      setSelectedResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('results.title', 'Examination Results')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('results.subtitle', 'View your scores, passing status, and teacher feedback.')}
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : results.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 text-center text-sm text-ink-soft">
            No exam results available yet. Once you complete an exam, your grades will appear here.
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((r) => {
              const isPublished = !!r.results_published_at;

              return (
                <div key={r.session_id} className="rounded-lg border border-line bg-white p-5 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-base">{r.exam_title}</span>
                        <span className="rounded bg-paper px-2 py-0.5 text-xs text-ink-soft">
                          {r.course_code} - {r.course_name}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft">
                        <span className="flex items-center gap-1">
                          <Clock size={14} /> Attempt {r.attempt_no}
                        </span>
                        <span>
                          Submitted: {new Date(r.submitted_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {isPublished ? (
                        <div className="text-end">
                          <div className="text-lg font-bold text-ink">
                            {r.total_score} / {r.max_score} pts
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            r.passed ? 'bg-ok-tint text-ok' : 'bg-pen-tint text-pen'
                          }`}>
                            {r.passed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {r.passed ? 'Passed' : 'Failed'} ({r.percentage}%)
                          </span>
                        </div>
                      ) : (
                        <span className="rounded-full bg-paper px-3 py-1 text-xs text-ink-soft">
                          Grading pending / results unpublished
                        </span>
                      )}

                      {isPublished && (
                        <button
                          onClick={() => handleOpenReview(r.session_id)}
                          className="btn-quiet text-xs py-1.5 px-3"
                        >
                          <Eye size={14} /> Review Answers
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

      {/* Review Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedResult.exam_title}</h2>
                <div className="mt-1 text-xs text-ink-soft">
                  Final Score: <span className="font-bold text-ink">{selectedResult.total_score}</span> / {selectedResult.max_score} pts ({selectedResult.percentage}%)
                </div>
              </div>
              <button onClick={() => setSelectedResult(null)} className="btn-quiet text-xs">
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {selectedResult.questions?.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-line p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-mark">Question {idx + 1}</span>
                    <span className="text-xs font-bold text-ink">
                      Score: {q.final_score ?? 0} / {q.max_points} pts
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-medium text-ink whitespace-pre-wrap">{q.body_md}</div>

                  {/* Student Answer */}
                  <div className="mt-2 rounded bg-paper p-2.5 text-xs text-ink-soft">
                    <span className="font-semibold text-ink">Your answer:</span>{' '}
                    {q.type_code === 'MATCHING' && q.student_answer?.matches ? (
                      <div className="mt-1 space-y-1">
                        {Object.entries(q.student_answer.matches).map(([k, v], i) => (
                          <div key={i} className="font-mono text-ink">
                            • {k} ⇄ {v}
                          </div>
                        ))}
                      </div>
                    ) : q.type_code === 'ORDERING' && (q.student_answer?.order || q.student_answer?.items) ? (
                      <div className="mt-1">
                        <ol className="list-decimal list-inside space-y-0.5 text-ink font-medium">
                          {((q.student_answer.order || q.student_answer.items) || []).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    ) : q.type_code === 'FILL_BLANK' && q.student_answer?.blanks ? (
                      <div className="mt-1 space-y-1 text-ink font-mono">
                        {Object.entries(q.student_answer.blanks).map(([k, v], i) => (
                          <span key={i} className="me-3">Blank {k}: "{v}"</span>
                        ))}
                      </div>
                    ) : q.type_code === 'CODE' && q.student_answer?.code ? (
                      <div className="mt-2">
                        <CodeMorph
                          language={q.student_answer?.language || 'python'}
                          snippets={[
                            {
                              name: 'Your Submission',
                              code: q.student_answer.code,
                              language: q.student_answer?.language || 'python',
                            },
                            ...(q.explanation_md ? [{
                              name: 'Solution Feedback',
                              code: q.explanation_md,
                              language: q.student_answer?.language || 'python',
                            }] : [])
                          ]}
                        />
                      </div>
                    ) : q.student_answer?.selectedOptionId ? (
                      '(Selected option)'
                    ) : q.student_answer?.value !== undefined ? (
                      String(q.student_answer.value)
                    ) : q.student_answer?.text ? (
                      <span className="text-ink">{String(q.student_answer.text)}</span>
                    ) : (
                      '(No answer)'
                    )}
                  </div>

                  {q.explanation_md && (
                    <div className="mt-2 text-xs text-ok italic">
                      💡 Solution / Feedback: {q.explanation_md}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
