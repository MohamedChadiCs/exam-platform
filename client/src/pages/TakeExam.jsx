import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock, ShieldAlert, Send, AlertTriangle,
  ArrowUp, ArrowDown, FileText, BookOpen, Award, CheckCircle2, Maximize2, Lock
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import Alert from '../components/Alert';
import CodeMorph from '../components/CodeMorph';

export default function TakeExam() {
  const { sessionId } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activeExerciseIdx, setActiveExerciseIdx] = useState(0);
  const [paperViewMode, setPaperViewMode] = useState('single'); // 'single' | 'double'
  const [answers, setAnswers] = useState({});
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [securityWarnings, setSecurityWarnings] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [terminatedReason, setTerminatedReason] = useState(null);

  const seqRef = useRef(1);
  const enteredFullscreenRef = useRef(!!document.fullscreenElement);
  const terminatingRef = useRef(false);

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      enteredFullscreenRef.current = true;
      setIsFullscreen(true);
    } catch {
      // Browser may block if not triggered by direct user gesture
    }
  }

  // Load session & questions
  async function loadSession() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/student/sessions/${sessionId}`);
      setSession(res.session);
      setQuestions(res.questions);
      setRemainingSeconds(res.session.remainingSeconds);
      if (res.session.status !== 'IN_PROGRESS') {
        setTerminatedReason('ALREADY_SUBMITTED');
      }

      // Pre-fill answers from saved state
      const initialAnswers = {};
      res.questions.forEach((q) => {
        if (q.savedAnswer) {
          initialAnswers[q.questionVersionId] = q.savedAnswer;
        }
      });
      setAnswers(initialAnswers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  // Countdown timer
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds]);

  // Strict Fullscreen Enforcement: auto-submit & lock if student exits fullscreen
  useEffect(() => {
    if (!session || session.status !== 'IN_PROGRESS' || terminatedReason) return;

    function onFullscreenChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        enteredFullscreenRef.current = true;
      } else if (enteredFullscreenRef.current && !terminatingRef.current) {
        terminatingRef.current = true;
        setTerminatedReason('FULLSCREEN_EXIT');
        setSession((prev) => (prev ? { ...prev, status: 'AUTO_SUBMITTED' } : prev));
        api.post(`/student/sessions/${sessionId}/security-event`, {
          eventType: 'FULLSCREEN_EXIT',
          severity: 'WARNING',
          details: { message: 'Student exited fullscreen mode; exam auto-submitted and locked.' },
          clientTs: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [session, sessionId, terminatedReason]);

  // Focus & Integrity Monitoring
  useEffect(() => {
    if (!session || !session.monitorFocus || session.status !== 'IN_PROGRESS') return;

    function handleSecurityEvent(eventType, details) {
      setSecurityWarnings((w) => w + 1);
      api.post(`/student/sessions/${sessionId}/security-event`, {
        eventType,
        severity: 'WARNING',
        details,
        clientTs: new Date().toISOString(),
      }).catch(() => {});
    }

    function onVisibilityChange() {
      if (document.hidden) {
        handleSecurityEvent('VISIBILITY_HIDDEN', { message: 'Student switched away from examination tab' });
      }
    }

    function onBlur() {
      handleSecurityEvent('WINDOW_BLUR', { message: 'Window lost focus' });
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [session, sessionId]);

  // Auto-save answer
  async function saveAnswer(qvId, answerPayload) {
    const updated = { ...answers, [qvId]: answerPayload };
    setAnswers(updated);
    setSaveStatus('saving');
    seqRef.current += 1;
    try {
      await api.post(`/student/sessions/${sessionId}/save`, {
        questionVersionId: qvId,
        answer: answerPayload,
        seq: seqRef.current,
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  // Answer selection handlers
  function handleSelectOption(qvId, optId, isMulti = false) {
    const current = answers[qvId] || {};
    let newPayload;

    if (isMulti) {
      const selected = Array.isArray(current.selectedOptionIds) ? [...current.selectedOptionIds] : [];
      const idx = selected.indexOf(optId);
      if (idx > -1) {
        selected.splice(idx, 1);
      } else {
        selected.push(optId);
      }
      newPayload = { selectedOptionIds: selected };
    } else {
      newPayload = { selectedOptionId: optId };
    }

    saveAnswer(qvId, newPayload);
  }

  function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function handleTextAnswer(qvId, text) {
    saveAnswer(qvId, { text });
  }

  function handleNumericAnswer(qvId, value) {
    saveAnswer(qvId, { value: parseFloat(value) });
  }

  function handleMatchingAnswer(qvId, leftId, chosenRight) {
    const current = answers[qvId]?.matches || {};
    const updated = { ...current, [leftId]: chosenRight };
    saveAnswer(qvId, { matches: updated });
  }

  function handleOrderChange(qvId, newOrder) {
    saveAnswer(qvId, { order: newOrder });
  }

  function handleBlankAnswer(qvId, blankId, val) {
    const current = answers[qvId]?.blanks || {};
    const updated = { ...current, [blankId]: val };
    saveAnswer(qvId, { blanks: updated });
  }

  function handleCodeAnswer(qvId, code, language) {
    saveAnswer(qvId, { code, language });
  }

  async function handleAutoSubmit() {
    terminatingRef.current = true;
    try {
      await api.post(`/student/sessions/${sessionId}/submit`);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      navigate('/app/results');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit() {
    terminatingRef.current = true;
    setSubmitting(true);
    try {
      await api.post(`/student/sessions/${sessionId}/submit`);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      navigate('/app/results');
    } catch (err) {
      terminatingRef.current = false;
      setError(err.message);
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-ink-soft">{t('common.loading')}</div>;
  }

  if (error && !session) {
    return <div className="mx-auto max-w-lg py-8"><Alert variant="danger">{error}</Alert></div>;
  }

  // Locked / Auto-Submitted screen (cannot do anything else)
  if (terminatedReason || (session && session.status !== 'IN_PROGRESS')) {
    const isViolation = terminatedReason === 'FULLSCREEN_EXIT';
    return (
      <div className="mx-auto max-w-lg py-16 px-4">
        <div className={`rounded-xl border-2 p-8 text-center shadow-lg bg-white ${isViolation ? 'border-red-300' : 'border-slate-300'}`}>
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${isViolation ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {isViolation ? <ShieldAlert size={28} /> : <Lock size={28} />}
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            {isViolation ? 'Examination Auto-Submitted & Locked' : 'Examination Session Closed'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {isViolation
              ? 'You exited fullscreen mode during the examination. Your current answers have been automatically submitted, your session is permanently locked, and this violation has been reported to your teacher.'
              : 'This examination session has already been submitted and is locked. You can no longer view or modify answers.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
                navigate('/app/exams/take');
              }}
              className="btn-primary text-xs"
            >
              Return to My Examinations
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fullscreen Gate before viewing/answering exam paper
  if (!isFullscreen) {
    return (
      <div className="mx-auto max-w-lg py-16 px-4">
        <div className="rounded-xl border border-slate-300 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mark-tint text-mark">
            <Maximize2 size={26} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900 font-serif">
            {session?.examTitle || 'Examination Fullscreen Mode'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This examination must be taken in <strong>fullscreen mode</strong>.
          </p>
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-left text-xs leading-relaxed text-amber-900">
            <strong>Important Rule:</strong> Once you enter fullscreen mode, exiting it (e.g. pressing <kbd className="rounded border border-amber-400 bg-white px-1 py-0.5 font-mono text-[10px]">Esc</kbd> or leaving fullscreen) will <strong>immediately auto-submit your exam</strong>, lock your session, and report the incident to your teacher.
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={enterFullscreen}
              className="btn-primary w-full justify-center py-3 text-sm font-semibold shadow-sm"
            >
              <Maximize2 size={16} /> Enter Fullscreen &amp; View Exam Paper
            </button>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalPoints = questions.reduce((sum, q) => sum + (parseFloat(q.points) || 0), 0);
  const candidateName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || 'Student Candidate';

  const TYPE_LABELS = {
    MCQ_SINGLE: 'Single Choice (MCQ)',
    MCQ_MULTI: 'Multiple Choice',
    TRUE_FALSE: 'True / False',
    SHORT_TEXT: 'Short Answer',
    LONG_TEXT: 'Long Answer',
    ESSAY: 'Essay',
    NUMERIC: 'Numeric',
    MATCHING: 'Matching',
    ORDERING: 'Ordering',
    FILL_BLANK: 'Fill in the Blank',
    CODE: 'Code',
  };

  // Format timer
  const minutes = Math.floor((remainingSeconds || 0) / 60);
  const seconds = (remainingSeconds || 0) % 60;
  const timerWarning = (remainingSeconds || 0) < 300; // < 5 mins
  const timerCritical = (remainingSeconds || 0) < 60; // < 1 min

  // Helper to jump to exercise on paper
  function jumpToExercise(idx) {
    setActiveExerciseIdx(idx);
    const el = document.getElementById(`student-exercise-${idx + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Helper to render individual student exercise item
  function renderStudentExercise(q, idx) {
    const isAnswered = !!answers[q.questionVersionId];

    return (
      <div
        key={q.questionVersionId || idx}
        id={`student-exercise-${idx + 1}`}
        className="group relative py-3 first:pt-1.5 border-b border-slate-200 last:border-b-0"
      >
        {/* Exercise Header on Paper */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif text-sm sm:text-base font-bold text-slate-900">
              Exercise {idx + 1}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {TYPE_LABELS[q.typeCode] || q.typeCode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAnswered && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 size={13} />
              </span>
            )}
            <span className="font-mono text-xs font-bold text-slate-700">
              [ {q.points} {q.points === 1 ? 'pt' : 'pts'} ]
            </span>
          </div>
        </div>

        {/* Question Text / Prompt */}
        <div className="mt-2 text-xs sm:text-[13px] leading-relaxed font-medium text-slate-800 whitespace-pre-wrap">
          {q.bodyMd}
        </div>

        {/* Question Answering Area on Paper */}
        <div className="mt-3">
          {/* MCQ / True-False: Formal Academic Radio/Checkbox options */}
          {(q.typeCode === 'MCQ_SINGLE' || q.typeCode === 'MCQ_MULTI' || q.typeCode === 'TRUE_FALSE') ? (
            <div className="space-y-1.5">
              {(q.options || []).map((opt, oIdx) => {
                const isMulti = q.typeCode === 'MCQ_MULTI';
                const ans = answers[q.questionVersionId];
                const isSelected = isMulti
                  ? Array.isArray(ans?.selectedOptionIds) && ans.selectedOptionIds.includes(opt.id)
                  : ans?.selectedOptionId === opt.id;

                const letter = String.fromCharCode(65 + oIdx);

                return (
                  <label
                    key={opt.id || oIdx}
                    onClick={() => handleSelectOption(q.questionVersionId, opt.id, isMulti)}
                    className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-xs transition-colors ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/80 text-slate-900 font-medium shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-500'
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="flex-1 leading-snug">{opt.body_md || opt.bodyMd}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider shrink-0">
                        Selected
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : q.typeCode === 'NUMERIC' ? (
            <div className="flex items-center gap-2 p-2.5 rounded border border-slate-200 bg-slate-50/70">
              <label className="text-xs font-semibold text-slate-700">Answer Value:</label>
              <input
                type="number"
                step="any"
                value={answers[q.questionVersionId]?.value ?? ''}
                onChange={(e) => handleNumericAnswer(q.questionVersionId, e.target.value)}
                placeholder="Enter numerical answer..."
                className="input w-44 py-1 text-xs font-mono font-bold bg-white"
              />
            </div>
          ) : q.typeCode === 'MATCHING' ? (
            <div className="space-y-2 p-2.5 rounded border border-slate-200 bg-slate-50/60">
              <p className="text-[11px] font-medium text-slate-500 italic">Pair each prompt on the left with its match on the right:</p>
              <div className="space-y-1.5">
                {(q.config?.leftItems || []).map((leftItem, lIdx) => {
                  const currentMatch = answers[q.questionVersionId]?.matches?.[leftItem.id] || '';
                  return (
                    <div
                      key={leftItem.id || lIdx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2"
                    >
                      <span className="text-xs font-medium text-slate-800 flex-1">{leftItem.text}</span>
                      <div className="flex items-center gap-1.5 sm:w-1/2">
                        <span className="text-slate-400 font-bold text-xs">⇄</span>
                        <select
                          value={currentMatch}
                          onChange={(e) => handleMatchingAnswer(q.questionVersionId, leftItem.id, e.target.value)}
                          className="input py-1 text-xs bg-slate-50 flex-1 font-medium"
                        >
                          <option value="">-- Choose match --</option>
                          {(q.config?.rightItems || []).map((r, rIdx) => (
                            <option key={r.id || rIdx} value={r.text}>
                              {r.text}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : q.typeCode === 'ORDERING' ? (
            <div className="space-y-2 p-2.5 rounded border border-slate-200 bg-slate-50/60">
              <p className="text-[11px] font-medium text-slate-500 italic">Arrange items in the correct sequential order:</p>
              {(() => {
                const currentOrder = answers[q.questionVersionId]?.order || q.config?.items || [];
                return (
                  <div className="space-y-1.5">
                    {currentOrder.map((item, oIdx) => (
                      <div
                        key={oIdx}
                        className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-700">
                            {oIdx + 1}
                          </span>
                          <span className="text-xs font-medium text-slate-800">{item}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={oIdx === 0}
                            onClick={() => {
                              const next = [...currentOrder];
                              [next[oIdx - 1], next[oIdx]] = [next[oIdx], next[oIdx - 1]];
                              handleOrderChange(q.questionVersionId, next);
                            }}
                            className="rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={oIdx === currentOrder.length - 1}
                            onClick={() => {
                              const next = [...currentOrder];
                              [next[oIdx + 1], next[oIdx]] = [next[oIdx], next[oIdx + 1]];
                              handleOrderChange(q.questionVersionId, next);
                            }}
                            className="rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : q.typeCode === 'FILL_BLANK' ? (
            <div className="space-y-2 p-2.5 rounded border border-slate-200 bg-slate-50/60">
              <p className="text-[11px] font-medium text-slate-500 italic">Fill in your answer for each blank:</p>
              <div className="space-y-1.5">
                {(q.config?.blanks && q.config.blanks.length > 0
                  ? q.config.blanks
                  : [{ id: '1', placeholder: 'Blank 1' }]
                ).map((b, bIdx) => {
                  const currentVal = answers[q.questionVersionId]?.blanks?.[b.id] ?? '';
                  return (
                    <div key={b.id || bIdx} className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2">
                      <span className="text-[11px] font-semibold text-slate-600 w-20">Blank {b.id || bIdx + 1}:</span>
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => handleBlankAnswer(q.questionVersionId, b.id, e.target.value)}
                        placeholder={`Type answer for ${b.placeholder || `blank ${bIdx + 1}`}...`}
                        className="input flex-1 bg-slate-50 py-1 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : q.typeCode === 'CODE' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 italic">
                <span>Write your implementation directly in the code window below:</span>
                <span>Language: <strong>{q.config?.language || 'python'}</strong></span>
              </div>
              <CodeMorph
                language={q.config?.language || 'python'}
                editable={true}
                snippets={[
                  {
                    name: 'My Solution',
                    code: answers[q.questionVersionId]?.code ?? (q.config?.starterCode || ''),
                    language: q.config?.language || 'python',
                  },
                  ...(q.config?.starterCode ? [{
                    name: 'Starter Template',
                    code: q.config.starterCode,
                    language: q.config?.language || 'python',
                  }] : [])
                ]}
                onChange={(newCode) => handleCodeAnswer(q.questionVersionId, newCode, q.config?.language || 'python')}
                onReset={q.config?.starterCode ? () => handleCodeAnswer(q.questionVersionId, q.config.starterCode, q.config?.language || 'python') : undefined}
                className="min-h-[12rem]"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="italic font-medium">Candidate Written Response:</span>
                {(() => {
                  const text = answers[q.questionVersionId]?.text || '';
                  const words = countWords(text);
                  const minWords = q.config?.minWords;
                  const maxWords = q.config?.maxWords || q.config?.wordLimit;

                  return (
                    <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                      <span className={maxWords && words > maxWords ? 'font-bold text-pen' : 'text-slate-600'}>
                        Words: {words} {maxWords ? `/ ${maxWords} max` : ''}
                      </span>
                      {maxWords && words > maxWords && (
                        <span className="rounded bg-pen-tint px-1 py-0.2 text-[9.5px] font-bold text-pen">
                          Limit exceeded!
                        </span>
                      )}
                      {minWords && words < minWords && (
                        <span className="text-amber-600 text-[9.5px]">
                          (Min: {minWords})
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <textarea
                rows={q.typeCode === 'ESSAY' ? 8 : 4}
                value={answers[q.questionVersionId]?.text ?? ''}
                onChange={(e) => handleTextAnswer(q.questionVersionId, e.target.value)}
                placeholder={q.typeCode === 'ESSAY' ? 'Write your structured essay response here...' : 'Write your answer or explanation here...'}
                className="w-full rounded border border-slate-300 bg-slate-50/50 p-2 text-xs leading-relaxed text-slate-800 focus:bg-white focus:border-mark focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Academic Header Banner for Student Paper (matches ExamPaperEditor layout)
  function renderStudentAcademicHeader() {
    return (
      <div className="border-b border-slate-900 pb-3 text-center">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Department of {session?.departmentName || 'Academic Studies'}
        </div>
        {(session?.courseCode || session?.courseName) && (
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Course:</span>
            <span className="font-bold text-slate-800">
              {[session?.courseCode, session?.courseName].filter(Boolean).join(' — ')}
            </span>
          </div>
        )}
        <h1 className="mt-1 text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 font-serif">
          {session?.examTitle || 'Official Examination'}
        </h1>

        {/* Exam Meta Strip on Paper */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-4 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-slate-500" />
            <span>Duration: <strong>{session?.durationMinutes || 60} min</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <Award size={12} className="text-slate-500" />
            <span>Total Score: <strong>{totalPoints} Points</strong></span>
          </div>
          {session?.passingScore != null && (
            <div>
              <span>Pass: <strong>{session.passingScore} Pts</strong></span>
            </div>
          )}
          <div>
            <span>Candidate: <strong className="text-slate-800">{candidateName}</strong></span>
          </div>
        </div>
      </div>
    );
  }

  // Instructions to Candidates
  function renderStudentInstructions() {
    return (
      <div className="my-3 rounded border border-slate-300 bg-slate-50/70 p-2.5 text-xs leading-relaxed text-slate-700">
        <span className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Instructions to Candidates:</span>
        <p className="mt-0.5 italic text-slate-600">
          {session?.descriptionMd || 'Read each question carefully and provide your answer directly on this paper. Answers are saved automatically in real-time. Ensure you review all responses before final submission.'}
        </p>
      </div>
    );
  }

  // End of Examination & Submission Card
  function renderEndAndSubmitCard() {
    return (
      <div className="mt-6 border-t-2 border-slate-900 pt-4">
        <div className="text-center font-serif text-xs font-bold uppercase tracking-widest text-slate-600">
          — END OF EXAMINATION PAPER —
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs text-slate-600">
            You have answered <strong className="text-slate-900 font-bold">{answeredCount}</strong> of <strong className="text-slate-900 font-bold">{questions.length}</strong> exercises.
          </p>

          {answeredCount < questions.length && (
            <p className="mt-1 text-[11px] text-amber-700 font-medium">
              Note: You still have {questions.length - answeredCount} unanswered exercise(s). You can scroll back or click the question numbers above to review them.
            </p>
          )}

          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn-primary text-xs py-2 px-5 font-semibold shadow-sm"
            >
              <Send size={14} /> Submit Final Examination Paper
            </button>
          </div>
        </div>
      </div>
    );
  }

  const splitIdx = Math.max(1, Math.ceil(questions.length / 2));
  const sheet1Questions = questions.slice(0, splitIdx);
  const sheet2Questions = questions.slice(splitIdx);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-100 pb-16">
      {/* =========================================================================
          STICKY TOP EXAMINATION BAR (Always visible during exam)
         ========================================================================= */}
      <div className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-sm">
        <div className="mx-auto max-w-[1550px] flex flex-wrap items-center justify-between gap-3">
          {/* Left: Exam title & Save Status */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-ink text-sm sm:text-base">
                  {session?.examTitle}
                </span>
                <span className="hidden sm:inline text-xs text-ink-soft">
                  • {candidateName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={saveStatus === 'saving' ? 'text-amber-600' : 'text-ok font-medium'}>
                  {saveStatus === 'saving' ? 'Saving answers…' : 'Answer saved ✓'}
                </span>
                <span>•</span>
                <span className="text-ink-soft">
                  {answeredCount} of {questions.length} completed
                </span>
              </div>
            </div>
          </div>

          {/* Center: Live Timer */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-sm font-bold shadow-xs ${
                timerCritical
                  ? 'bg-pen-tint text-pen animate-pulse border border-pen/40'
                  : timerWarning
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-900 text-white'
              }`}
            >
              <Clock size={15} />
              <span>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>

            {securityWarnings > 0 && (
              <span className="flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <ShieldAlert size={13} /> {securityWarnings}
              </span>
            )}
          </div>

          {/* Right: View Mode Toggle & Submit Button */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-md border border-line bg-paper/60 p-0.5">
              <button
                type="button"
                onClick={() => setPaperViewMode('single')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
                  paperViewMode === 'single'
                    ? 'bg-white shadow-xs text-ink font-semibold'
                    : 'text-ink-soft hover:text-ink'
                }`}
                title="Continuous Paper Sheet"
              >
                <FileText size={13} />
                <span className="hidden sm:inline">1 Paper</span>
              </button>
              <button
                type="button"
                onClick={() => setPaperViewMode('double')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                  paperViewMode === 'double'
                    ? 'bg-white shadow-xs text-ink font-semibold'
                    : 'text-ink-soft hover:text-ink'
                }`}
                title="Two Papers Side-by-Side"
              >
                <BookOpen size={13} />
                <span className="hidden sm:inline">2 Papers</span>
              </button>
            </div>

            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn-primary text-xs py-1.5 px-3 font-semibold shadow-xs"
            >
              <Send size={13} /> Submit
            </button>
          </div>
        </div>

        {/* Quick Exercise Jump Strip */}
        <div className="mx-auto max-w-[1550px] mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Exercises:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.questionVersionId];
              const isCurrent = idx === activeExerciseIdx;

              return (
                <button
                  key={q.questionVersionId}
                  onClick={() => jumpToExercise(idx)}
                  className={`flex h-7 min-w-7 px-1.5 items-center justify-center rounded text-xs font-medium transition-all ${
                    isCurrent
                      ? 'ring-2 ring-mark ring-offset-1 bg-mark text-white'
                      : isAnswered
                      ? 'bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                  title={`Exercise ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}`}
                >
                  {idx + 1}
                  {isAnswered && <span className="ms-0.5 text-[9px]">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 shrink-0 font-mono hidden md:block">
            {answeredCount}/{questions.length} answered
          </div>
        </div>
      </div>

      {/* =========================================================================
          MAIN EXAMINATION PAPER DISPLAY
         ========================================================================= */}
      <div className="mt-4">
        {/* TWO PAPERS VIEW */}
        {paperViewMode === 'double' && (
          <div className="mx-auto max-w-[1550px] px-2 sm:px-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              {/* SHEET 1 */}
              <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-7 shadow-xl">
                {renderStudentAcademicHeader()}
                {renderStudentInstructions()}

                <div>
                  {sheet1Questions.map((q, subIdx) => renderStudentExercise(q, subIdx))}
                </div>

                <div className="mt-5 border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Page 1 of 2</span>
                  <span>(Turn Over — Continued on Sheet 2 →)</span>
                </div>
              </div>

              {/* SHEET 2 */}
              <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-7 shadow-xl">
                {/* Sheet 2 Continuation Header */}
                <div className="border-b border-slate-900 pb-2 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Department of Academic Studies
                  </div>
                  <div className="mt-0.5 text-base font-bold uppercase tracking-tight text-slate-800 font-serif">
                    {session?.examTitle || 'Examination'} — Continuation Sheet
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 font-mono flex items-center justify-center gap-3">
                    <span>Candidate: <strong>{candidateName}</strong></span>
                    <span>•</span>
                    <span>Page 2 of 2</span>
                  </div>
                </div>

                <div>
                  {sheet2Questions.map((q, subIdx) => renderStudentExercise(q, splitIdx + subIdx))}
                </div>

                {renderEndAndSubmitCard()}

                <div className="mt-4 border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Page 2 of 2</span>
                  <span>End of Paper</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SINGLE CONTINUOUS PAPER VIEW */}
        {paperViewMode === 'single' && (
          <div className="mx-auto max-w-4xl px-3 sm:px-4">
            <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-8 shadow-xl">
              {renderStudentAcademicHeader()}
              {renderStudentInstructions()}

              <div>
                {questions.map((q, idx) => renderStudentExercise(q, idx))}
              </div>

              {renderEndAndSubmitCard()}

              <div className="mt-4 border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Page 1 of 1</span>
                <span>Total Exercises: {questions.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Submit Examination Paper?</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              You have completed <strong className="font-bold text-ink">{answeredCount}</strong> of <strong className="font-bold text-ink">{questions.length}</strong> exercises.
            </p>

            {answeredCount < questions.length && (
              <div className="mt-3 flex items-center gap-2 rounded bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                <AlertTriangle size={15} className="shrink-0" />
                <span>You still have {questions.length - answeredCount} unanswered exercise(s)!</span>
              </div>
            )}

            <p className="mt-3 text-[11px] text-ink-faint italic">
              Once submitted, your answers will be locked and finalized for grading.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitModal(false)}
                className="btn-quiet text-xs"
              >
                Continue Answering
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="btn-primary text-xs font-semibold"
              >
                {submitting ? t('common.loading') : 'Yes, Submit Examination'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
