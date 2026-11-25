import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, QrCode, BookOpen, Clock, Users, CheckCircle, FileText, Share2, Play, Lock, Edit3, Search, X, Archive, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';

export default function Exams() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [courseFilter, setCourseFilter] = useState('');

  // Exam creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [examForm, setExamForm] = useState({
    courseId: '',
    title: '',
    descriptionMd: '',
    locale: 'fr',
    opensAt: '',
    closesAt: '',
    durationMinutes: 60,
    maxScore: 20,
    passingScore: 10,
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarking: false,
    maxAttempts: 1,
    resultsPolicy: 'MANUAL',
    showFeedback: false,
    monitorFocus: true,
  });

  // Access code modal
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [activeExam, setActiveExam] = useState(null);
  const [codes, setCodes] = useState([]);
  const [codeForm, setCodeForm] = useState({ expiresHours: 24, maxUses: 50 });
  const [copiedCode, setCopiedCode] = useState('');

  // Questions assignment modal
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [exRes, coRes] = await Promise.all([
        api.get('/exams?status=ALL'),
        api.get('/academic/courses'),
      ]);
      setExams(exRes);
      setCourses(coRes);
      if (coRes.length > 0 && !examForm.courseId) {
        setExamForm((f) => ({ ...f, courseId: coRes[0].id }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleOpenCreate() {
    const now = new Date();
    const defaultOpens = new Date(now.getTime() + 5 * 60000).toISOString().slice(0, 16);
    const defaultCloses = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 16);

    setExamForm({
      courseId: courses[0]?.id ?? '',
      title: '',
      descriptionMd: '',
      locale: 'fr',
      opensAt: defaultOpens,
      closesAt: defaultCloses,
      durationMinutes: 60,
      maxScore: 20,
      passingScore: 10,
      shuffleQuestions: true,
      shuffleOptions: true,
      negativeMarking: false,
      maxAttempts: 1,
      resultsPolicy: 'MANUAL',
      showFeedback: false,
      monitorFocus: true,
    });
    setShowCreateModal(true);
  }

  async function handleCreateExam(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/exams', {
        ...examForm,
        opensAt: new Date(examForm.opensAt).toISOString(),
        closesAt: new Date(examForm.closesAt).toISOString(),
      });
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePublish(id) {
    const ok = await confirm({
      title: t('exams.publishTitle', 'Publish Exam'),
      message: t('exams.publishConfirm', 'Publish this exam? Students will be able to join and take it once it opens.'),
      confirmLabel: t('exams.publish', 'Publish'),
      variant: 'primary',
    });
    if (!ok) return;
    try {
      await api.post(`/exams/${id}/publish`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClose(id) {
    const ok = await confirm({
      title: t('exams.closeTitle', 'Close Exam'),
      message: t('exams.closeConfirm', 'Close this exam? No further submissions will be accepted.'),
      confirmLabel: t('exams.close', 'Close'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/exams/${id}/close`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchive(id) {
    const ok = await confirm({
      title: t('exams.archiveTitle', 'Archive Exam'),
      message: t('exams.archiveConfirm', 'Archive this exam? It will be moved out of your active exams list and can be restored anytime from the Archived tab.'),
      confirmLabel: t('exams.archive', 'Archive'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/exams/${id}/archive`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUnarchive(id) {
    try {
      await api.post(`/exams/${id}/unarchive`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  // Codes management
  async function handleOpenCodes(exam) {
    setActiveExam(exam);
    setError('');
    try {
      const full = await api.get(`/exams/${exam.id}`);
      setCodes(full.codes || []);
      setShowCodeModal(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerateCode(e) {
    e.preventDefault();
    try {
      const expiresAt = new Date(Date.now() + codeForm.expiresHours * 3600000).toISOString();
      const res = await api.post(`/exams/${activeExam.id}/codes`, {
        expiresAt,
        maxUses: codeForm.maxUses ? parseInt(codeForm.maxUses, 10) : null,
      });
      setCodes([res, ...codes]);
      setCopiedCode(res.code);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevokeCode(codeId) {
    try {
      await api.post(`/exams/${activeExam.id}/codes/${codeId}/revoke`);
      setCodes(codes.map((c) => (c.id === codeId ? { ...c, status: 'REVOKED' } : c)));
    } catch (err) {
      setError(err.message);
    }
  }

  // Question Assignment
  async function handleOpenQuestions(exam) {
    setActiveExam(exam);
    setError('');
    try {
      const [full, allQ] = await Promise.all([
        api.get(`/exams/${exam.id}`),
        api.get('/questions'),
      ]);
      setAvailableQuestions(allQ);
      setSelectedQuestions(full.questions.map((q) => ({
        questionVersionId: q.question_version_id,
        points: q.points,
      })));
      setShowQuestionsModal(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleQuestion(qvId, defaultPoints) {
    const exists = selectedQuestions.find((q) => q.questionVersionId === qvId);
    if (exists) {
      setSelectedQuestions(selectedQuestions.filter((q) => q.questionVersionId !== qvId));
    } else {
      setSelectedQuestions([...selectedQuestions, { questionVersionId: qvId, points: defaultPoints }]);
    }
  }

  function updateQuestionPoints(qvId, points) {
    setSelectedQuestions(selectedQuestions.map((q) => (
      q.questionVersionId === qvId ? { ...q, points: parseFloat(points) || 0 } : q
    )));
  }

  async function handleSaveQuestions() {
    try {
      await api.post(`/exams/${activeExam.id}/questions`, {
        questions: selectedQuestions.map((q, idx) => ({
          questionVersionId: q.questionVersionId,
          position: idx + 1,
          points: q.points,
        })),
      });
      setShowQuestionsModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredExams = exams.filter((ex) => {
    if (statusFilter === 'ALL' && ex.status === 'ARCHIVED') return false;
    if (statusFilter !== 'ALL' && ex.status !== statusFilter) return false;
    if (courseFilter && ex.course_id !== courseFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchTitle = ex.title?.toLowerCase().includes(q);
      const matchCourseCode = ex.course_code?.toLowerCase().includes(q);
      const matchCourseName = ex.course_name?.toLowerCase().includes(q);
      if (!matchTitle && !matchCourseCode && !matchCourseName) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('exams.title', 'Exams Management')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('exams.subtitle', 'Configure examinations, assign questions, issue access codes and review submissions.')}</p>
        </div>
        <Link to="/app/exams/new" className="btn-primary self-start">
          <Plus size={16} />
          {t('exams.newExam', 'Create Exam Paper')}
        </Link>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      {/* Filters Toolbar */}
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
            <input
              type="text"
              placeholder={t('exams.searchPlaceholder', 'Search exams by title, course code or name...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full pl-9 pr-9 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-3 text-ink-soft hover:text-ink"
                title={t('common.clear', 'Clear')}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {courses.length > 0 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="input text-sm sm:w-56"
            >
              <option value="">{t('exams.allCourses', 'All Courses')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status Tabs and Result Counter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/60">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'ALL', label: t('exams.statusAll', 'All Statuses') },
              { id: 'DRAFT', label: t('exams.statusDraft', 'Draft') },
              { id: 'PUBLISHED', label: t('exams.statusPublished', 'Published') },
              { id: 'CLOSED', label: t('exams.statusClosed', 'Closed') },
              { id: 'ARCHIVED', label: t('exams.statusArchived', 'Archived') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  statusFilter === tab.id
                    ? 'bg-mark text-white shadow-sm'
                    : 'bg-paper text-ink-soft hover:text-ink hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span>
              {t('exams.showingCount', 'Showing {{count}} of {{total}} exams', {
                count: filteredExams.length,
                total: exams.length,
              })}
            </span>
            {(search || courseFilter || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCourseFilter('');
                  setStatusFilter('ALL');
                }}
                className="text-mark hover:underline font-medium"
              >
                {t('common.clear', 'Clear filters')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Exams list */}
      <div className="mt-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : filteredExams.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 text-center text-sm text-ink-soft">
            {exams.length === 0
              ? t('exams.empty', 'No exams created yet. Click "New Exam" to get started.')
              : t('exams.noMatching', 'No exams match your selected filters.')}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredExams.map((ex) => (
              <div key={ex.id} className="rounded-lg border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink text-lg">{ex.title}</span>
                      <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">
                        {ex.course_code} - {ex.course_name}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ex.status === 'PUBLISHED' ? 'bg-ok-tint text-ok' :
                        ex.status === 'DRAFT' ? 'bg-paper text-ink-soft' :
                        ex.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 'bg-pen-tint text-pen'
                      }`}>
                        {ex.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft">
                      <span className="flex items-center gap-1">
                        <Clock size={14} /> {ex.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={14} /> {ex.question_count} {t('exams.questions', 'questions')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={14} /> {ex.enrolled_count} {t('exams.enrolled', 'enrolled')}
                      </span>
                      <span>
                        Max: {ex.max_score} pts (Pass: {ex.passing_score} pts)
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-ink-faint">
                      {new Date(ex.opens_at).toLocaleString()} → {new Date(ex.closes_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {ex.status === 'DRAFT' && (
                      <>
                        <Link to={`/app/exams/${ex.id}/edit`} className="btn-quiet text-xs py-1.5 px-3 text-mark font-medium">
                          <Edit3 size={14} /> Edit Paper
                        </Link>
                        <button onClick={() => handlePublish(ex.id)} className="btn-primary text-xs py-1.5 px-3">
                          <Play size={14} /> {t('exams.publish', 'Publish')}
                        </button>
                      </>
                    )}

                    {ex.status === 'PUBLISHED' && (
                      <>
                        <button onClick={() => handleOpenCodes(ex)} className="btn-quiet text-xs py-1.5 px-3">
                          <QrCode size={14} /> {t('exams.codes', 'Codes & QR')}
                        </button>
                        <button onClick={() => handleClose(ex.id)} className="btn-quiet text-xs py-1.5 px-3 text-pen">
                          <Lock size={14} /> {t('exams.close', 'Close')}
                        </button>
                      </>
                    )}

                    <Link to={`/app/exams/${ex.id}/submissions`} className="btn-quiet text-xs py-1.5 px-3">
                      <Users size={14} /> {t('exams.submissions', 'Submissions')} ({ex.session_count ?? 0})
                    </Link>

                    {ex.status !== 'ARCHIVED' ? (
                      <button
                        onClick={() => handleArchive(ex.id)}
                        className="btn-quiet text-xs py-1.5 px-3 text-ink-soft hover:text-pen"
                        title={t('exams.archive', 'Archive')}
                      >
                        <Archive size={14} /> {t('exams.archive', 'Archive')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnarchive(ex.id)}
                        className="btn-quiet text-xs py-1.5 px-3 text-mark"
                        title={t('exams.restore', 'Restore')}
                      >
                        <RotateCcw size={14} /> {t('exams.restore', 'Restore')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('exams.createTitle', 'Create Examination')}</h2>
            <form onSubmit={handleCreateExam} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.course', 'Course')}</label>
                <select
                  required
                  value={examForm.courseId}
                  onChange={(e) => setExamForm({ ...examForm, courseId: e.target.value })}
                  className="input"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.name', 'Exam Title')}</label>
                <input
                  required
                  placeholder="e.g. Final Examination 2026"
                  value={examForm.title}
                  onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.opensAt', 'Opens At')}</label>
                  <input
                    type="datetime-local"
                    required
                    value={examForm.opensAt}
                    onChange={(e) => setExamForm({ ...examForm, opensAt: e.target.value })}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.closesAt', 'Closes At')}</label>
                  <input
                    type="datetime-local"
                    required
                    value={examForm.closesAt}
                    onChange={(e) => setExamForm({ ...examForm, closesAt: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.duration', 'Duration (mins)')}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={examForm.durationMinutes}
                    onChange={(e) => setExamForm({ ...examForm, durationMinutes: parseInt(e.target.value, 10) || 1 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.maxScore', 'Max Score')}</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={examForm.maxScore}
                    onChange={(e) => setExamForm({ ...examForm, maxScore: parseFloat(e.target.value) || 1 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('exams.passingScore', 'Passing Score')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={examForm.passingScore}
                    onChange={(e) => setExamForm({ ...examForm, passingScore: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>

              {/* Exam Options */}
              <div className="space-y-2 rounded-md border border-line bg-paper p-3 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={examForm.shuffleQuestions}
                    onChange={(e) => setExamForm({ ...examForm, shuffleQuestions: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>{t('exams.shuffleQuestions', 'Shuffle questions order for each student')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={examForm.shuffleOptions}
                    onChange={(e) => setExamForm({ ...examForm, shuffleOptions: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>{t('exams.shuffleOptions', 'Shuffle answer choices order for each student')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={examForm.monitorFocus}
                    onChange={(e) => setExamForm({ ...examForm, monitorFocus: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>{t('exams.monitorFocus', 'Track tab switching and window blur (Integrity monitoring)')}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-quiet">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary">
                  {t('common.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Code & QR Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('exams.codesTitle', 'Access Codes & QR Sharing')}</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Generate 8-character codes or QR tokens for students to enter this exam.
            </p>

            <form onSubmit={handleGenerateCode} className="mt-4 flex gap-2">
              <input
                type="number"
                min="1"
                placeholder="Expires in hours (e.g. 24)"
                value={codeForm.expiresHours}
                onChange={(e) => setCodeForm({ ...codeForm, expiresHours: parseInt(e.target.value, 10) || 1 })}
                className="input w-40 text-xs"
              />
              <input
                type="number"
                min="1"
                placeholder="Max uses (e.g. 50)"
                value={codeForm.maxUses}
                onChange={(e) => setCodeForm({ ...codeForm, maxUses: e.target.value })}
                className="input w-36 text-xs"
              />
              <button type="submit" className="btn-primary text-xs shrink-0">
                Generate Code
              </button>
            </form>

            <div className="mt-4 divide-y divide-line max-h-60 overflow-y-auto">
              {codes.length === 0 ? (
                <div className="py-4 text-center text-xs text-ink-faint">No codes generated yet.</div>
              ) : (
                codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-mono font-bold tracking-widest text-mark text-base">{c.code}</div>
                      <div className="text-xs text-ink-soft">
                        Uses: {c.used_count ?? c.usedCount ?? 0} / {c.max_uses ?? c.maxUses ?? '∞'} • Status: {c.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(c.code);
                          setCopiedCode(c.code);
                        }}
                        className="btn-quiet text-xs py-1 px-2.5"
                      >
                        {copiedCode === c.code ? 'Copied!' : 'Copy'}
                      </button>
                      {c.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleRevokeCode(c.id)}
                          className="text-xs text-pen hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button type="button" onClick={() => setShowCodeModal(false)} className="btn-quiet">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Selector Modal */}
      {showQuestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('exams.selectQuestions', 'Assign Questions to Exam')}</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Select questions from your question bank and adjust point weights.
            </p>

            <div className="mt-4 divide-y divide-line max-h-96 overflow-y-auto">
              {availableQuestions.length === 0 ? (
                <div className="py-6 text-center text-sm text-ink-faint">No questions available in question bank.</div>
              ) : (
                availableQuestions.map((q) => {
                  const selected = selectedQuestions.find((sq) => sq.questionVersionId === q.version_id);
                  return (
                    <div key={q.id} className="flex items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={() => toggleQuestion(q.version_id, q.default_points)}
                        className="mt-1 h-4 w-4 rounded text-mark"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-ink">{q.body_md}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
                          <span className="rounded bg-paper px-1.5 py-0.5">{q.type_code}</span>
                          {q.category_name && <span>{q.category_name}</span>}
                        </div>
                      </div>
                      {selected && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-ink-soft">Pts:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={selected.points}
                            onChange={(e) => updateQuestionPoints(q.version_id, e.target.value)}
                            className="input w-16 py-1 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-line">
              <span className="text-xs text-ink-soft font-medium">
                {selectedQuestions.length} questions selected • Total: {selectedQuestions.reduce((s, q) => s + (parseFloat(q.points) || 0), 0)} pts
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowQuestionsModal(false)} className="btn-quiet">
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={handleSaveQuestions} className="btn-primary">
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
