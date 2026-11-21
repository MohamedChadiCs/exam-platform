import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, ShieldAlert, CheckCircle, ChevronLeft, ChevronRight, Send, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';

export default function TakeExam() {
  const { sessionId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [securityWarnings, setSecurityWarnings] = useState(0);

  const seqRef = useRef(1);

  // Load session & questions
  async function loadSession() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/student/sessions/${sessionId}`);
      setSession(res.session);
      setQuestions(res.questions);
      setRemainingSeconds(res.session.remainingSeconds);

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

  function handleTextAnswer(qvId, text) {
    saveAnswer(qvId, { text });
  }

  function handleNumericAnswer(qvId, value) {
    saveAnswer(qvId, { value: parseFloat(value) });
  }

  async function handleAutoSubmit() {
    try {
      await api.post(`/student/sessions/${sessionId}/submit`);
      navigate('/app/results');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post(`/student/sessions/${sessionId}/submit`);
      navigate('/app/results');
    } catch (err) {
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

  const currentQ = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isLast = currentIndex === questions.length - 1;

  // Format timer
  const minutes = Math.floor((remainingSeconds || 0) / 60);
  const seconds = (remainingSeconds || 0) % 60;
  const timerWarning = (remainingSeconds || 0) < 300; // < 5 mins
  const timerCritical = (remainingSeconds || 0) < 60; // < 1 min

  return (
    <div className="mx-auto max-w-4xl py-4">
      {/* Top Header / Timer Bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white px-5 py-3 shadow-sm">
        <div>
          <span className="font-semibold text-ink text-sm sm:text-base">{session?.examTitle}</span>
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span>•</span>
            <span className={saveStatus === 'saving' ? 'text-amber-600' : 'text-ok'}>
              {saveStatus === 'saving' ? 'Saving…' : 'Answer saved ✓'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {securityWarnings > 0 && (
            <span className="flex items-center gap-1 rounded bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <ShieldAlert size={14} /> Focus warning ({securityWarnings})
            </span>
          )}

          <div className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-sm font-bold ${
            timerCritical ? 'bg-pen-tint text-pen animate-pulse' :
            timerWarning ? 'bg-amber-100 text-amber-800' : 'bg-paper text-ink'
          }`}>
            <Clock size={16} />
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>

          <button onClick={() => setShowSubmitModal(true)} className="btn-primary text-xs py-1.5 px-3">
            <Send size={14} /> Submit
          </button>
        </div>
      </div>

      {/* Main Question Card & Navigation */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_16rem]">
        {/* Question Area */}
        <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
          {currentQ ? (
            <div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">
                  Question {currentIndex + 1} ({currentQ.typeCode})
                </span>
                <span className="text-xs font-bold text-ink-soft">{currentQ.points} points</span>
              </div>

              {/* Question Text */}
              <div className="mt-4 text-base font-medium text-ink whitespace-pre-wrap leading-relaxed">
                {currentQ.bodyMd}
              </div>

              {/* Options */}
              <div className="mt-6 space-y-3">
                {currentQ.options && currentQ.options.length > 0 ? (
                  currentQ.options.map((opt) => {
                    const isMulti = currentQ.typeCode === 'MCQ_MULTI';
                    const ans = answers[currentQ.questionVersionId];
                    const isSelected = isMulti
                      ? Array.isArray(ans?.selectedOptionIds) && ans.selectedOptionIds.includes(opt.id)
                      : ans?.selectedOptionId === opt.id;

                    return (
                      <label
                        key={opt.id}
                        onClick={() => handleSelectOption(currentQ.questionVersionId, opt.id, isMulti)}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-sm transition-colors ${
                          isSelected
                            ? 'border-mark bg-mark-tint font-medium text-mark'
                            : 'border-line bg-white hover:bg-paper'
                        }`}
                      >
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={`q-${currentQ.questionVersionId}`}
                          checked={isSelected}
                          readOnly
                          className="h-4 w-4 text-mark focus:ring-mark"
                        />
                        <span>{opt.body_md}</span>
                      </label>
                    );
                  })
                ) : currentQ.typeCode === 'NUMERIC' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Enter your numeric answer:</label>
                    <input
                      type="number"
                      step="any"
                      value={answers[currentQ.questionVersionId]?.value ?? ''}
                      onChange={(e) => handleNumericAnswer(currentQ.questionVersionId, e.target.value)}
                      placeholder="e.g. 42.5"
                      className="input w-48 font-mono text-base"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Type your answer below:</label>
                    <textarea
                      rows={5}
                      value={answers[currentQ.questionVersionId]?.text ?? ''}
                      onChange={(e) => handleTextAnswer(currentQ.questionVersionId, e.target.value)}
                      placeholder="Write your explanation or answer here..."
                      className="input"
                    />
                  </div>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  className="btn-quiet text-xs"
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                {isLast ? (
                  <button onClick={() => setShowSubmitModal(true)} className="btn-primary text-xs">
                    Finish & Submit <Send size={14} />
                  </button>
                ) : (
                  <button onClick={() => setCurrentIndex((i) => i + 1)} className="btn-primary text-xs">
                    Next Question <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>No questions in this examination.</div>
          )}
        </div>

        {/* Question Palette / Bubble Navigator */}
        <div className="h-fit rounded-lg border border-line bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Questions Overview
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.questionVersionId];
              const isCurrent = idx === currentIndex;

              return (
                <button
                  key={q.questionVersionId}
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-medium transition-all ${
                    isCurrent
                      ? 'ring-2 ring-mark ring-offset-2 bg-mark text-white'
                      : isAnswered
                      ? 'bg-ok-tint text-ok font-semibold'
                      : 'bg-paper text-ink-soft hover:bg-line'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-line pt-3 space-y-1 text-[11px] text-ink-soft">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-ok-tint border border-ok/40"></span>
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-paper border border-line"></span>
              <span>Unanswered ({questions.length - answeredCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Submit Examination?</h2>
            <p className="mt-2 text-sm text-ink-soft">
              You have answered <span className="font-bold text-ink">{answeredCount}</span> of <span className="font-bold text-ink">{questions.length}</span> questions.
            </p>

            {answeredCount < questions.length && (
              <div className="mt-3 flex items-center gap-2 rounded bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle size={16} className="shrink-0" />
                <span>You still have {questions.length - answeredCount} unanswered questions!</span>
              </div>
            )}

            <p className="mt-3 text-xs text-ink-faint">
              Once submitted, your answers will be locked and automatically evaluated.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitModal(false)}
                className="btn-quiet"
              >
                Continue Exam
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="btn-primary"
              >
                {submitting ? t('common.loading') : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
