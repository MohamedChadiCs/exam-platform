import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Send, Eye, ShieldAlert, FileSpreadsheet, FileDown } from 'lucide-react';
import { api } from '../lib/api';
import { exportGradesToExcel, exportGradesToPdf, sanitizeFilename } from '../lib/exportUtils';
import ExportModal from '../components/ExportModal';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';
import CodeMorph from '../components/CodeMorph';

export default function ExamSubmissions() {
  const { id } = useParams();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [submissions, setSubmissions] = useState([]);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected session for grading/review
  const [activeSession, setActiveSession] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [gradingState, setGradingState] = useState({});
  const [exportFormat, setExportFormat] = useState(null); // 'xlsx' | 'pdf' | null

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
    const ok = await confirm({
      title: t('submissions.publishTitle', 'Publish Results'),
      message: t('submissions.publishConfirm', 'Publish results to all students for this examination?'),
      confirmLabel: t('submissions.publishAll', 'Publish Results'),
      variant: 'primary',
    });
    if (!ok) return;
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

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            disabled={submissions.length === 0}
            onClick={() => setExportFormat('xlsx')}
            className="btn-quiet text-xs"
          >
            <FileSpreadsheet size={14} /> {t('submissions.exportExcel', 'Export Excel')}
          </button>
          <button
            type="button"
            disabled={submissions.length === 0}
            onClick={() => setExportFormat('pdf')}
            className="btn-quiet text-xs"
          >
            <FileDown size={14} /> {t('submissions.exportPdf', 'Export PDF')}
          </button>
          <button onClick={handlePublishResults} className="btn-primary text-xs">
            <Send size={14} /> {t('submissions.publishAll', 'Publish Results to Students')}
          </button>
        </div>
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
                    {s.fullscreen_exits_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-semibold text-red-800">
                        <ShieldAlert size={12} /> Fullscreen Exit (Auto-Submitted)
                      </span>
                    ) : s.security_events_count > 0 ? (
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
            {sessionDetail.securityEvents.length > 0 && (() => {
              const hasFsExit = sessionDetail.securityEvents.some((e) => e.event_type === 'FULLSCREEN_EXIT');
              return (
                <div className={`mt-4 rounded-md border p-3 ${hasFsExit ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className={`flex items-center gap-1.5 font-semibold text-xs ${hasFsExit ? 'text-red-800' : 'text-amber-800'}`}>
                    <ShieldAlert size={14} />
                    {hasFsExit
                      ? `Fullscreen Exit Violation — Examination Auto-Submitted (${sessionDetail.securityEvents.length} events)`
                      : `Integrity Events Recorded (${sessionDetail.securityEvents.length})`}
                  </div>
                  <div className={`mt-2 space-y-1 text-xs ${hasFsExit ? 'text-red-700' : 'text-amber-700'}`}>
                    {sessionDetail.securityEvents.map((e) => (
                      <div key={e.id} className={e.event_type === 'FULLSCREEN_EXIT' ? 'font-semibold text-red-900' : ''}>
                        • {new Date(e.received_at).toLocaleTimeString()}: {e.event_type === 'FULLSCREEN_EXIT' ? 'FULLSCREEN_EXIT — Student quit fullscreen (Auto-submitted & locked)' : `${e.event_type} (${e.severity})`}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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

                  {/* Student Answer for text/numeric/essay */}
                  {(q.type_code === 'SHORT_TEXT' || q.type_code === 'LONG_TEXT' || q.type_code === 'ESSAY' || q.type_code === 'NUMERIC') && (
                    <div className="mt-3 rounded border border-line bg-paper p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink-soft">Student Answer:</span>
                        {/* Word counter for text/essay */}
                        {q.student_answer?.text && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-ink-soft">
                              Words: {q.student_answer.text.trim().split(/\s+/).filter(Boolean).length}
                            </span>
                            {q.config?.maxWords && q.student_answer.text.trim().split(/\s+/).filter(Boolean).length > q.config.maxWords && (
                              <span className="rounded bg-pen-tint px-1.5 py-0.5 text-[10px] font-bold text-pen">
                                Exceeds limit ({q.config.maxWords} max)
                              </span>
                            )}
                            {q.config?.minWords && q.student_answer.text.trim().split(/\s+/).filter(Boolean).length < q.config.minWords && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                Below minimum ({q.config.minWords} min)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink leading-relaxed">
                        {q.student_answer?.value !== undefined ? String(q.student_answer.value) :
                         q.student_answer?.text ? String(q.student_answer.text) : <span className="italic text-ink-faint">(No answer provided)</span>}
                      </div>
                      {q.config?.rubric && (
                        <div className="mt-2 border-t border-line/60 pt-2 text-[11px] text-ink-soft">
                          <span className="font-semibold">Grading Rubric:</span> {q.config.rubric}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Matching Evaluation Display */}
                  {q.type_code === 'MATCHING' && (
                    <div className="mt-3 space-y-2 rounded border border-line bg-paper p-3 text-xs">
                      <span className="font-semibold text-ink-soft">Matching Evaluation:</span>
                      <div className="space-y-1.5 mt-1">
                        {(q.config?.pairs || []).map((pair, pIdx) => {
                          const pairKey = pair.id || String(pIdx);
                          const studentMatch = q.student_answer?.matches?.[pairKey] || q.student_answer?.matches?.[pair.left];
                          const isCorrect = studentMatch && String(studentMatch).trim().toLowerCase() === String(pair.right).trim().toLowerCase();

                          return (
                            <div key={pIdx} className="flex items-center justify-between rounded bg-white p-2 border border-line">
                              <span className="font-medium text-ink">{pair.left}</span>
                              <div className="flex items-center gap-2">
                                <span className={isCorrect ? 'text-ok font-semibold' : 'text-pen line-through'}>
                                  Student: {studentMatch || '(No match)'}
                                </span>
                                {!isCorrect && (
                                  <span className="rounded bg-ok-tint px-1.5 py-0.5 text-[10px] font-bold text-ok">
                                    Expected: {pair.right}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ordering Evaluation Display */}
                  {q.type_code === 'ORDERING' && (
                    <div className="mt-3 space-y-2 rounded border border-line bg-paper p-3 text-xs">
                      <span className="font-semibold text-ink-soft">Ordering Evaluation:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                        <div className="rounded bg-white p-2 border border-line">
                          <span className="text-[11px] font-bold uppercase text-ink-soft block mb-1">Student Order:</span>
                          <ol className="list-decimal list-inside space-y-1">
                            {((q.student_answer?.order || q.student_answer?.items) || []).map((item, i) => {
                              const isCorrectPos = q.config?.items?.[i] && String(item).trim() === String(q.config.items[i]).trim();
                              return (
                                <li key={i} className={isCorrectPos ? 'text-ok font-medium' : 'text-pen'}>
                                  {item} {isCorrectPos ? '✓' : '✗'}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                        <div className="rounded bg-white p-2 border border-line">
                          <span className="text-[11px] font-bold uppercase text-ok block mb-1">Correct Key Order:</span>
                          <ol className="list-decimal list-inside space-y-1">
                            {(q.config?.items || []).map((item, i) => (
                              <li key={i} className="text-ink font-medium">{item}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fill in the Blanks Evaluation Display */}
                  {q.type_code === 'FILL_BLANK' && (
                    <div className="mt-3 space-y-2 rounded border border-line bg-paper p-3 text-xs">
                      <span className="font-semibold text-ink-soft">Blanks Evaluation:</span>
                      <div className="space-y-1.5 mt-1">
                        {(q.config?.blanks || []).map((b, bIdx) => {
                          const blankKey = b.id ?? String(bIdx + 1);
                          const studentVal = q.student_answer?.blanks?.[blankKey] || q.student_answer?.blanks?.[bIdx] || '';
                          const rawAcceptable = b.acceptableAnswers || b.acceptable || (b.answer ? [b.answer] : []);
                          const acceptable = (Array.isArray(rawAcceptable) ? rawAcceptable : [rawAcceptable]).map((s) => String(s).trim().toLowerCase());
                          const isCorrect = studentVal && acceptable.includes(String(studentVal).trim().toLowerCase());

                          return (
                            <div key={bIdx} className="flex items-center justify-between rounded bg-white p-2 border border-line">
                              <span className="font-medium text-ink">Blank {b.id || bIdx + 1}:</span>
                              <div className="flex items-center gap-2">
                                <span className={isCorrect ? 'text-ok font-semibold' : 'text-pen'}>
                                  "{studentVal || '(blank)'}" {isCorrect ? '✓' : '✗'}
                                </span>
                                <span className="text-ink-soft text-[10px]">
                                  (Accepted: {Array.isArray(rawAcceptable) ? rawAcceptable.join(', ') : rawAcceptable})
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Programming / Code Submission Display with Code Morph */}
                  {q.type_code === 'CODE' && (
                    <div className="mt-3">
                      <CodeMorph
                        language={q.student_answer?.language || q.config?.language || 'python'}
                        snippets={[
                          {
                            name: 'Student Submission',
                            code: q.student_answer?.code || '// No code submitted',
                            language: q.student_answer?.language || q.config?.language || 'python',
                          },
                          ...(q.config?.starterCode ? [{
                            name: 'Starter Template',
                            code: q.config.starterCode,
                            language: q.config?.language || 'python',
                          }] : []),
                          ...(q.config?.expectedOutput ? [{
                            name: 'Expected / Solution',
                            code: q.config.expectedOutput,
                            language: q.config?.language || 'python',
                          }] : [])
                        ]}
                      />
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

      <ExportModal
        open={Boolean(exportFormat)}
        title={exportFormat === 'xlsx' ? 'Export Grade List (Excel)' : 'Export Grade List (PDF)'}
        defaultFilename={`${sanitizeFilename(exam?.title || 'exam')}_grades`}
        extension={exportFormat || 'pdf'}
        showVariant
        onClose={() => setExportFormat(null)}
        onConfirm={({ filename, variant }) => {
          if (exportFormat === 'xlsx') {
            exportGradesToExcel(exam, submissions, { filename, variant });
          } else {
            exportGradesToPdf(exam, submissions, { filename, variant });
          }
          setExportFormat(null);
        }}
      />
    </div>
  );
}
