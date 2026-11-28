import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Save, Send, Settings,
  CheckCircle2, Clock, Award, BookOpen, Library, HelpCircle, FileText, Tag, FolderPlus, FileDown,
  Paperclip, Image, Music, Video, Upload, AlignLeft, AlignCenter, AlignRight, GripVertical, Maximize2, Minimize2
} from 'lucide-react';
import { api } from '../lib/api';
import { exportExamPaperToPdf, sanitizeFilename } from '../lib/exportUtils';
import ExportModal from '../components/ExportModal';
import Alert from '../components/Alert';
import CodeMorph from '../components/CodeMorph';

function getMatchingCategoryIds(selectedId, catList) {
  if (!selectedId) return null;
  const ids = new Set([selectedId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of catList) {
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
}

export default function ExamPaperEditor() {
  const { id } = useParams(); // If id exists, edit mode; otherwise, new exam
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankCategoryFilter, setBankCategoryFilter] = useState('');
  const [inlineCatName, setInlineCatName] = useState('');
  const [showInlineCatFor, setShowInlineCatFor] = useState(null); // question index or null
  const [paperViewMode, setPaperViewMode] = useState('single'); // 'single' | 'double'
  const [showExportModal, setShowExportModal] = useState(false);

  // Exam Paper State
  const [exam, setExam] = useState({
    courseId: '',
    title: 'Midterm Examination',
    descriptionMd: 'Read all questions carefully before answering. Each exercise carries the stated points.',
    locale: 'fr',
    opensAt: '',
    closesAt: '',
    durationMinutes: 60,
    passingScore: 10,
    maxScore: 20,
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarking: false,
    maxAttempts: 1,
    resultsPolicy: 'MANUAL',
    showFeedback: false,
    monitorFocus: true,
    status: 'DRAFT',
  });

  // Questions on the Paper
  const [questions, setQuestions] = useState([
    {
      typeCode: 'MCQ_SINGLE',
      title: 'LIFO Data Structures',
      bodyMd: 'Which data structure operates on a Last-In, First-Out (LIFO) basis?',
      explanationMd: 'A Stack is a LIFO data structure, whereas a Queue is FIFO.',
      points: 5,
      config: {},
      attachments: [],
      options: [
        { bodyMd: 'Queue', isCorrect: false },
        { bodyMd: 'Stack', isCorrect: true },
        { bodyMd: 'Array', isCorrect: false },
        { bodyMd: 'Linked List', isCorrect: false },
      ],
    },
    {
      typeCode: 'TRUE_FALSE',
      title: 'Database Constraints',
      bodyMd: 'In relational databases, primary keys can contain NULL values.',
      explanationMd: 'Primary keys must contain UNIQUE and NOT NULL values.',
      points: 5,
      config: {},
      attachments: [],
      options: [
        { bodyMd: 'True', isCorrect: false },
        { bodyMd: 'False', isCorrect: true },
      ],
    },
  ]);

  // Load initial data
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError('');
      try {
        const [cList, bList, catList] = await Promise.all([
          api.get('/academic/courses'),
          api.get('/questions').catch(() => []),
          api.get('/questions/categories').catch(() => []),
        ]);
        setCourses(cList);
        setBankQuestions(bList);
        setCategories(catList);

        if (id) {
          // Editing existing exam
          const ex = await api.get(`/exams/${id}`);
          setExam({
            ...ex,
            opensAt: new Date(ex.opens_at).toISOString().slice(0, 16),
            closesAt: new Date(ex.closes_at).toISOString().slice(0, 16),
            durationMinutes: ex.duration_minutes,
            maxScore: ex.max_score,
            passingScore: ex.passing_score,
            courseId: ex.course_id,
            descriptionMd: ex.description_md ?? '',
          });

          // Set loaded questions
          if (ex.questions && ex.questions.length > 0) {
            setQuestions(
              ex.questions.map((q) => ({
                questionVersionId: q.question_version_id,
                inBank: !!q.in_bank,
                categoryId: q.category_id ?? '',
                typeCode: q.type_code,
                title: q.title || '',
                bodyMd: q.body_md,
                explanationMd: q.explanation_md ?? '',
                points: Number(q.points),
                config: q.config ?? {},
                options: q.options ? q.options.map((o) => ({ bodyMd: o.body_md, isCorrect: o.is_correct })) : [],
                attachments: q.attachments || q.config?.attachments || [],
              }))
            );
          }
        } else {
          // Default dates for new exam
          const now = new Date();
          const opens = new Date(now.getTime() + 10 * 60000).toISOString().slice(0, 16);
          const closes = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 16);
          setExam((prev) => ({
            ...prev,
            courseId: cList[0]?.id || '',
            opensAt: opens,
            closesAt: closes,
          }));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id]);

  // Calculate total points dynamically from questions
  const computedTotalPoints = questions.reduce((sum, q) => sum + (parseFloat(q.points) || 0), 0);

  // Question editing helpers
  function addQuestion(type = 'MCQ_SINGLE') {
    let defaultOptions = [];
    let config = {};

    if (type === 'MCQ_SINGLE' || type === 'MCQ_MULTI') {
      defaultOptions = [
        { bodyMd: 'Option A', isCorrect: true },
        { bodyMd: 'Option B', isCorrect: false },
        { bodyMd: 'Option C', isCorrect: false },
        { bodyMd: 'Option D', isCorrect: false },
      ];
    } else if (type === 'TRUE_FALSE') {
      defaultOptions = [
        { bodyMd: 'True', isCorrect: true },
        { bodyMd: 'False', isCorrect: false },
      ];
    } else if (type === 'NUMERIC') {
      config = { answer: 10, tolerance: 0.1 };
    } else if (type === 'SHORT_TEXT' || type === 'ESSAY') {
      config = { minWords: 0, maxWords: 300 };
    } else if (type === 'MATCHING') {
      config = {
        pairs: [
          { id: '1', left: 'Item 1', right: 'Match 1' },
          { id: '2', left: 'Item 2', right: 'Match 2' },
        ],
      };
    } else if (type === 'ORDERING') {
      config = { items: ['Step 1', 'Step 2', 'Step 3'] };
    } else if (type === 'FILL_BLANK') {
      config = { blanks: [{ id: '1', acceptableAnswers: ['answer'] }] };
    } else if (type === 'CODE') {
      config = { language: 'python', starterCode: '# Write your code here\n' };
    }

    const newQ = {
      typeCode: type,
      title: '',
      bodyMd: type === 'FILL_BLANK' ? 'The capital of France is [blank-1].' : 'Type your question statement here...',
      explanationMd: '',
      points: 5,
      categoryId: '',
      config,
      options: defaultOptions,
      attachments: [],
    };
    setQuestions([...questions, newQ]);
  }

  async function handleFileUpload(qIdx, fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setError(`File "${file.name}" is too large. Maximum size is 5 MB.`);
        continue;
      }
      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => {
            const res = reader.result;
            const base64 = typeof res === 'string' ? res.split(',')[1] : '';
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const dataBase64 = await base64Promise;

        let uploadRes = null;
        try {
          uploadRes = await api.post('/uploads/question-attachment', {
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataBase64,
            questionVersionId: questions[qIdx]?.questionVersionId || null,
          });
        } catch {
          // If network error, fallback to data url
          uploadRes = null;
        }

        const newAttachment = uploadRes
          ? {
              id: uploadRes.id,
              filename: uploadRes.filename,
              mime_type: uploadRes.mime_type,
              size_bytes: uploadRes.size_bytes,
              url: uploadRes.url,
            }
          : {
              id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
              filename: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              dataBase64,
              url: URL.createObjectURL(file),
            };

        const currentAtts = questions[qIdx].attachments || [];
        updateQuestion(qIdx, { attachments: [...currentAtts, newAttachment] });
      } catch (err) {
        setError(`Failed to read "${file.name}": ${err.message}`);
      }
    }
  }

  function removeAttachment(qIdx, aIdx) {
    const currentAtts = [...(questions[qIdx].attachments || [])];
    currentAtts.splice(aIdx, 1);
    updateQuestion(qIdx, { attachments: currentAtts });
  }

  function updateAttachment(qIdx, aIdx, fields) {
    const currentAtts = [...(questions[qIdx].attachments || [])];
    currentAtts[aIdx] = { ...currentAtts[aIdx], ...fields };
    updateQuestion(qIdx, { attachments: currentAtts });
  }

  function moveAttachment(qIdx, aIdx, dir) {
    const currentAtts = [...(questions[qIdx].attachments || [])];
    const target = aIdx + dir;
    if (target < 0 || target >= currentAtts.length) return;
    [currentAtts[aIdx], currentAtts[target]] = [currentAtts[target], currentAtts[aIdx]];
    updateQuestion(qIdx, { attachments: currentAtts });
  }

  function updateQuestion(index, fields) {
    const updated = [...questions];
    updated[index] = { ...updated[index], ...fields };
    setQuestions(updated);
  }

  function removeQuestion(index) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function moveQuestion(index, dir) {
    if ((dir === -1 && index === 0) || (dir === 1 && index === questions.length - 1)) return;
    const updated = [...questions];
    const target = index + dir;
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setQuestions(updated);
  }

  function handleOptionChange(qIdx, optIdx, field, val) {
    const updated = [...questions];
    const q = { ...updated[qIdx] };
    const opts = [...q.options];

    if (field === 'isCorrect' && q.typeCode === 'MCQ_SINGLE') {
      opts.forEach((o, i) => { o.isCorrect = i === optIdx; });
    } else {
      opts[optIdx] = { ...opts[optIdx], [field]: val };
    }

    q.options = opts;
    updated[qIdx] = q;
    setQuestions(updated);
  }

  function addOption(qIdx) {
    const updated = [...questions];
    const q = { ...updated[qIdx] };
    q.options = [...q.options, { bodyMd: `Choice ${q.options.length + 1}`, isCorrect: false }];
    updated[qIdx] = q;
    setQuestions(updated);
  }

  function removeOption(qIdx, optIdx) {
    const updated = [...questions];
    const q = { ...updated[qIdx] };
    q.options = q.options.filter((_, i) => i !== optIdx);
    updated[qIdx] = q;
    setQuestions(updated);
  }

  async function importBankQuestion(bankQ) {
    let rawOptions = bankQ.options;
    const needsOptions = ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(bankQ.type_code);
    if (needsOptions && (!rawOptions || rawOptions.length === 0)) {
      try {
        const full = await api.get(`/questions/${bankQ.id}`);
        if (full && Array.isArray(full.options)) {
          rawOptions = full.options;
        }
      } catch (err) {
        console.error('Failed to load question details:', err);
      }
    }

    const imported = {
      questionVersionId: bankQ.version_id,
      inBank: true,
      categoryId: bankQ.category_id ?? '',
      typeCode: bankQ.type_code,
      bodyMd: bankQ.body_md,
      explanationMd: bankQ.explanation_md ?? '',
      points: Number(bankQ.default_points) || 5,
      config: bankQ.config ?? {},
      options: Array.isArray(rawOptions)
        ? rawOptions.map((o) => ({
            bodyMd: o.bodyMd ?? o.body_md ?? '',
            isCorrect: o.isCorrect ?? o.is_correct ?? false,
          }))
        : [],
    };
    setQuestions([...questions, imported]);
    setShowBankModal(false);
  }

  async function openBankModal() {
    setShowBankModal(true);
    try {
      const [bList, catList] = await Promise.all([
        api.get('/questions').catch(() => []),
        api.get('/questions/categories').catch(() => []),
      ]);
      setBankQuestions(bList);
      setCategories(catList);
    } catch (e) {
      // ignore
    }
  }

  // Create a category on the fly from exam paper
  async function handleInlineCatCreate(qIdx) {
    if (!inlineCatName.trim()) return;
    try {
      const res = await api.post('/questions/categories', { name: inlineCatName.trim() });
      const catList = await api.get('/questions/categories');
      setCategories(catList);
      updateQuestion(qIdx, { categoryId: res.id });
      setInlineCatName('');
      setShowInlineCatFor(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // Save a single question to the Question Bank (only when explicitly requested)
  async function saveQuestionToBank(qIdx) {
    const q = questions[qIdx];
    if (!q || !q.bodyMd?.trim()) {
      setError('Please enter a question statement before saving to the Question Bank.');
      return;
    }
    try {
      if (q.questionVersionId) {
        await api.post(`/questions/versions/${q.questionVersionId}/add-to-bank`);
        updateQuestion(qIdx, { inBank: true });
      } else {
        const payload = {
          categoryId: q.categoryId || null,
          typeCode: q.typeCode,
          bodyMd: q.bodyMd,
          explanationMd: q.explanationMd || null,
          defaultPoints: q.points || 1,
          config: q.config || {},
          options: (q.options || []).map((o, idx) => ({
            position: idx,
            bodyMd: o.bodyMd,
            isCorrect: !!o.isCorrect,
            feedbackMd: o.feedbackMd || null,
          })),
        };
        const res = await api.post('/questions', payload);
        updateQuestion(qIdx, { questionVersionId: res.versionId, inBank: true });
      }
      const bList = await api.get('/questions').catch(() => []);
      setBankQuestions(bList);
      setSuccessMsg(`Exercise ${qIdx + 1} saved to Question Bank.`);
    } catch (err) {
      setError(err.message);
    }
  }

  // Save Exam & Questions
  async function handleSave(publish = false) {
    if (!exam.courseId) {
      setError('Please select a course for this examination.');
      return;
    }
    if (!exam.title.trim()) {
      setError('Please provide an exam title.');
      return;
    }
    if (questions.length === 0) {
      setError('Please add at least one question to the exam paper.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    const maxScore = computedTotalPoints > 0 ? computedTotalPoints : exam.maxScore;
    const passingScore = Math.min(exam.passingScore, maxScore);

    const payload = {
      courseId: exam.courseId,
      title: exam.title,
      descriptionMd: exam.descriptionMd,
      locale: exam.locale || 'fr',
      opensAt: new Date(exam.opensAt).toISOString(),
      closesAt: new Date(exam.closesAt).toISOString(),
      durationMinutes: parseInt(exam.durationMinutes, 10) || 60,
      maxScore,
      passingScore,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      negativeMarking: exam.negativeMarking,
      maxAttempts: exam.maxAttempts,
      resultsPolicy: exam.resultsPolicy,
      showFeedback: exam.showFeedback,
      monitorFocus: exam.monitorFocus,
      questions: questions.map((q) => ({
        questionVersionId: q.questionVersionId,
        categoryId: q.categoryId || null,
        typeCode: q.typeCode,
        title: q.title || null,
        bodyMd: q.bodyMd,
        explanationMd: q.explanationMd,
        points: q.points,
        config: q.config,
        options: q.options,
        attachments: q.attachments || [],
      })),
    };

    try {
      let savedExamId = id;
      if (id) {
        await api.put(`/exams/${id}`, payload);
      } else {
        const res = await api.post('/exams', payload);
        savedExamId = res.id;
      }

      if (publish) {
        await api.post(`/exams/${savedExamId}/publish`);
        navigate('/app/exams');
        return;
      }

      // Reload exam questions so newly created questions get their questionVersionId without adding to bank
      const refreshedExam = await api.get(`/exams/${savedExamId}`);
      if (refreshedExam?.questions) {
        setQuestions(
          refreshedExam.questions.map((q) => ({
            questionVersionId: q.question_version_id,
            inBank: !!q.in_bank,
            categoryId: q.category_id || '',
            typeCode: q.type_code,
            title: q.title || '',
            bodyMd: q.body_md,
            explanationMd: q.explanation_md ?? '',
            points: parseFloat(q.points),
            config: q.config || {},
            options: (q.options || []).map((o) => ({
              id: o.id,
              bodyMd: o.body_md,
              isCorrect: o.is_correct,
              feedbackMd: o.feedback_md,
            })),
            attachments: q.attachments || q.config?.attachments || [],
          }))
        );
      }

      setSuccessMsg('Exam paper saved successfully.');
      if (!id) {
        navigate(`/app/exams/${savedExamId}/edit`, { replace: true });
      }
    } catch (err) {
      const details = err.details?.length
        ? ` (${err.details.map((d) => `${d.path ? d.path + ': ' : ''}${d.message}`).join(', ')}`
        : '';
      setError(`${err.message}${details}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-ink-soft">{t('common.loading')}</div>;
  }

  const selectedCourse = courses.find((c) => c.id === exam.courseId);

  return (
    <div className="-mx-6 -my-8 min-h-screen bg-slate-100/80 pb-16 pt-4">
      {/* Top Floating Control Bar */}
      <div className="sticky top-0 z-30 mb-6 border-b border-line bg-white/95 px-6 py-3.5 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/app/exams" className="btn-quiet text-xs py-1.5 px-2.5">
              <ArrowLeft size={14} /> Back
            </Link>
            <div className="h-4 w-px bg-line" />
            <div>
              <span className="text-xs font-semibold text-mark">Exam Paper Creator</span>
              <div className="text-xs text-ink-soft">
                {questions.length} questions • Total: <span className="font-bold text-ink">{computedTotalPoints} pts</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: 1 Paper vs 2 Papers */}
            <div className="flex items-center rounded-md border border-line bg-paper/60 p-0.5">
              <button
                type="button"
                onClick={() => setPaperViewMode('single')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                  paperViewMode === 'single'
                    ? 'bg-white shadow-xs text-ink font-semibold'
                    : 'text-ink-soft hover:text-ink'
                }`}
                title="Single continuous paper sheet"
              >
                <FileText size={13} />
                <span>1 Paper</span>
              </button>
              <button
                type="button"
                onClick={() => setPaperViewMode('double')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                  paperViewMode === 'double'
                    ? 'bg-white shadow-xs text-ink font-semibold'
                    : 'text-ink-soft hover:text-ink'
                }`}
                title="Two papers side-by-side view"
              >
                <BookOpen size={13} />
                <span>2 Papers</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="btn-quiet text-xs py-1.5 px-3"
              title="Export exam paper as PDF"
            >
              <FileDown size={14} /> Export PDF
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="btn-quiet text-xs py-1.5 px-3"
            >
              <Settings size={14} /> Schedule & Rules
            </button>

            <button
              disabled={saving}
              onClick={() => handleSave(false)}
              className="btn-quiet text-xs py-1.5 px-3 font-medium"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save Draft'}
            </button>

            <button
              disabled={saving}
              onClick={() => handleSave(true)}
              className="btn-primary text-xs py-1.5 px-3 font-medium shadow-sm"
            >
              <Send size={14} /> Publish Exam
            </button>
          </div>
        </div>
      </div>

      {(() => {
        // Helper to render individual question item with compact spacing
        function renderQuestionItem(q, idx) {
          return (
            <div key={idx} id={`teacher-exercise-${idx + 1}`} className="group relative py-3 first:pt-1">
              {/* Question Header & Points in Margin */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-sm font-bold text-slate-900">
                    Exercise {idx + 1}
                  </span>
                  <select
                    value={q.typeCode}
                    onChange={(e) => {
                      const newType = e.target.value;
                      let opts = q.options;
                      let newConfig = { ...q.config };
                      if (newType === 'TRUE_FALSE') {
                        opts = [{ bodyMd: 'True', isCorrect: true }, { bodyMd: 'False', isCorrect: false }];
                      } else if (newType === 'NUMERIC') {
                        opts = [];
                        newConfig = { answer: 10, tolerance: 0.1 };
                      } else if (newType === 'SHORT_TEXT' || newType === 'ESSAY') {
                        opts = [];
                        newConfig = { minWords: 0, maxWords: 300 };
                      } else if (newType === 'MATCHING') {
                        opts = [];
                        newConfig = {
                          pairs: [
                            { id: '1', left: 'Item 1', right: 'Match 1' },
                            { id: '2', left: 'Item 2', right: 'Match 2' },
                          ],
                        };
                      } else if (newType === 'ORDERING') {
                        opts = [];
                        newConfig = { items: ['Step 1', 'Step 2', 'Step 3'] };
                      } else if (newType === 'FILL_BLANK') {
                        opts = [];
                        newConfig = { blanks: [{ id: '1', acceptableAnswers: ['answer'] }] };
                      } else if (newType === 'CODE') {
                        opts = [];
                        newConfig = { language: 'python', starterCode: '# Write your code here\n' };
                      } else if (opts.length === 0) {
                        opts = [{ bodyMd: 'Option A', isCorrect: true }, { bodyMd: 'Option B', isCorrect: false }];
                      }
                      updateQuestion(idx, { typeCode: newType, options: opts, config: newConfig });
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-300"
                  >
                    <option value="MCQ_SINGLE">Single Choice (MCQ)</option>
                    <option value="MCQ_MULTI">Multiple Choice (MCQ)</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="NUMERIC">Numeric Calculation</option>
                    <option value="SHORT_TEXT">Short Text / Open Ended</option>
                    <option value="ESSAY">Essay / Long Answer</option>
                    <option value="MATCHING">Matching (Pairs)</option>
                    <option value="ORDERING">Ordering (Sequence)</option>
                    <option value="FILL_BLANK">Fill in the Blanks</option>
                    <option value="CODE">Programming / Code</option>
                  </select>
                </div>

                {/* Points Box */}
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="text-slate-400">[</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={q.points}
                    onChange={(e) => updateQuestion(idx, { points: parseFloat(e.target.value) || 0 })}
                    className="w-12 text-center font-bold text-slate-900 border-b border-dashed border-slate-400 focus:border-mark focus:outline-none"
                  />
                  <span className="font-medium text-slate-500">pts</span>
                  <span className="text-slate-400">]</span>
                </div>
              </div>

              {/* Category Tag Row */}
              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                <Tag size={11} className="text-slate-400 shrink-0" />
                {showInlineCatFor === idx ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={inlineCatName}
                      onChange={(e) => setInlineCatName(e.target.value)}
                      placeholder="Category..."
                      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] focus:border-mark focus:outline-none w-32"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleInlineCatCreate(idx);
                        } else if (e.key === 'Escape') {
                          setShowInlineCatFor(null);
                          setInlineCatName('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleInlineCatCreate(idx)}
                      className="rounded bg-mark px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-mark/90"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowInlineCatFor(null); setInlineCatName(''); }}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      value={q.categoryId || ''}
                      onChange={(e) => updateQuestion(idx, { categoryId: e.target.value })}
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-slate-300"
                    >
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.depth > 0 ? `${'\u00A0\u00A0'.repeat(c.depth)}↳ ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setShowInlineCatFor(idx); setInlineCatName(''); }}
                      className="text-[10px] font-semibold text-mark hover:underline"
                    >
                      + New
                    </button>
                  </>
                )}
              </div>

              {/* Question Title & Prompt / Description */}
              <div className="mt-2 space-y-1.5">
                <input
                  type="text"
                  value={q.title || ''}
                  onChange={(e) => updateQuestion(idx, { title: e.target.value })}
                  placeholder="Question Title (optional, e.g. Data Structures & Analysis)"
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 placeholder-slate-400 hover:border-slate-300 focus:border-mark focus:outline-none"
                />
                <textarea
                  rows={2}
                  value={q.bodyMd}
                  onChange={(e) => updateQuestion(idx, { bodyMd: e.target.value })}
                  placeholder="Enter the question problem statement or description here..."
                  className="w-full rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 hover:border-slate-300 focus:border-mark focus:outline-none"
                />
              </div>

              {/* Inline Media Attachments (Images, Audio, Video) */}
              <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50/70 p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    <Paperclip size={13} className="text-slate-400" />
                    <span>Media Attachments</span>
                    <span className="text-[10px] text-slate-400 font-normal">(Images, Audio, Video)</span>
                    {q.attachments?.length > 0 && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {q.attachments.length}
                      </span>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-mark border border-slate-200 shadow-2xs hover:bg-slate-50">
                    <Upload size={12} />
                    <span>+ Attach File</span>
                    <input
                      type="file"
                      accept="image/*,audio/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileUpload(idx, e.target.files)}
                    />
                  </label>
                </div>

                {q.attachments && q.attachments.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {q.attachments.map((att, aIdx) => {
                      const mime = att.mime_type || att.mimeType || '';
                      const isImage = mime.startsWith('image/');
                      const isAudio = mime.startsWith('audio/');
                      const isVideo = mime.startsWith('video/');
                      const mediaSrc = att.url || (att.dataBase64 ? `data:${mime};base64,${att.dataBase64}` : '');
                      const displayWidth = att.displayWidth || '100%';
                      const displayAlign = att.displayAlign || 'center';
                      const alignClass = displayAlign === 'left' ? 'items-start' : displayAlign === 'right' ? 'items-end' : 'items-center';

                      return (
                        <div
                          key={att.id || aIdx}
                          className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden"
                        >
                          {/* Attachment toolbar */}
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {isImage ? <Image size={13} className="text-emerald-600 shrink-0" /> :
                               isAudio ? <Music size={13} className="text-amber-600 shrink-0" /> :
                               isVideo ? <Video size={13} className="text-blue-600 shrink-0" /> :
                               <Paperclip size={13} className="text-slate-500 shrink-0" />}
                              <span className="truncate text-[11px] font-medium text-slate-700" title={att.filename}>
                                {att.filename}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {att.size_bytes ? `${Math.round(att.size_bytes / 1024)} KB` : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Size control for images and videos */}
                              {(isImage || isVideo) && (
                                <select
                                  value={displayWidth}
                                  onChange={(e) => updateAttachment(idx, aIdx, { displayWidth: e.target.value })}
                                  className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 hover:border-slate-300 focus:outline-none focus:border-mark cursor-pointer"
                                  title="Display width"
                                >
                                  <option value="25%">25%</option>
                                  <option value="33%">33%</option>
                                  <option value="50%">50%</option>
                                  <option value="75%">75%</option>
                                  <option value="100%">100%</option>
                                </select>
                              )}

                              {/* Alignment controls */}
                              {(isImage || isVideo) && (
                                <div className="flex items-center rounded border border-slate-200 bg-white overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => updateAttachment(idx, aIdx, { displayAlign: 'left' })}
                                    className={`p-0.5 ${displayAlign === 'left' ? 'bg-mark/10 text-mark' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="Align left"
                                  ><AlignLeft size={11} /></button>
                                  <button
                                    type="button"
                                    onClick={() => updateAttachment(idx, aIdx, { displayAlign: 'center' })}
                                    className={`p-0.5 border-x border-slate-200 ${displayAlign === 'center' ? 'bg-mark/10 text-mark' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="Align center"
                                  ><AlignCenter size={11} /></button>
                                  <button
                                    type="button"
                                    onClick={() => updateAttachment(idx, aIdx, { displayAlign: 'right' })}
                                    className={`p-0.5 ${displayAlign === 'right' ? 'bg-mark/10 text-mark' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="Align right"
                                  ><AlignRight size={11} /></button>
                                </div>
                              )}

                              {/* Move up / down */}
                              <button
                                type="button"
                                onClick={() => moveAttachment(idx, aIdx, -1)}
                                disabled={aIdx === 0}
                                className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move up"
                              ><ArrowUp size={12} /></button>
                              <button
                                type="button"
                                onClick={() => moveAttachment(idx, aIdx, 1)}
                                disabled={aIdx === q.attachments.length - 1}
                                className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move down"
                              ><ArrowDown size={12} /></button>

                              {/* Remove */}
                              <button
                                type="button"
                                onClick={() => removeAttachment(idx, aIdx)}
                                className="p-0.5 text-slate-300 hover:text-red-500"
                                title="Remove attachment"
                              ><Trash2 size={12} /></button>
                            </div>
                          </div>

                          {/* Inline media preview */}
                          <div className={`flex flex-col ${alignClass} p-3`}>
                            {isImage && (
                              <img
                                src={mediaSrc}
                                alt={att.filename}
                                style={{ width: displayWidth, maxWidth: '100%' }}
                                className="rounded border border-slate-100 object-contain"
                              />
                            )}
                            {isAudio && (
                              <div className="w-full max-w-md">
                                <audio controls src={mediaSrc} className="w-full" />
                              </div>
                            )}
                            {isVideo && (
                              <video
                                controls
                                src={mediaSrc}
                                style={{ width: displayWidth, maxWidth: '100%' }}
                                className="rounded bg-black"
                              />
                            )}
                            {!isImage && !isAudio && !isVideo && (
                              <a
                                href={mediaSrc}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-medium text-mark hover:underline"
                              >
                                <Paperclip size={14} />
                                <span>{att.filename}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Answers / Options Area */}
              <div className="mt-2 ps-1">
                {(q.typeCode === 'MCQ_SINGLE' || q.typeCode === 'MCQ_MULTI' || q.typeCode === 'TRUE_FALSE') && (
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          title="Click to mark as the correct answer key"
                          onClick={() => handleOptionChange(idx, oIdx, 'isCorrect', !opt.isCorrect)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                            opt.isCorrect
                              ? 'border-ok bg-ok text-white shadow-xs'
                              : 'border-slate-300 bg-white text-slate-400 hover:border-slate-500 hover:text-slate-600'
                          }`}
                        >
                          {String.fromCharCode(65 + oIdx)}
                        </button>

                        <input
                          type="text"
                          value={opt.bodyMd}
                          onChange={(e) => handleOptionChange(idx, oIdx, 'bodyMd', e.target.value)}
                          placeholder={`Choice ${String.fromCharCode(65 + oIdx)}...`}
                          className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${
                            opt.isCorrect
                              ? 'border-ok/40 bg-ok-tint/30 text-slate-900 font-medium'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        />

                        {opt.isCorrect && (
                          <span className="text-[10.5px] font-semibold text-ok shrink-0">✓ Key</span>
                        )}

                        {q.typeCode !== 'TRUE_FALSE' && q.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(idx, oIdx)}
                            className="text-slate-300 hover:text-pen p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}

                    {q.typeCode !== 'TRUE_FALSE' && (
                      <button
                        type="button"
                        onClick={() => addOption(idx)}
                        className="mt-1 text-[11px] font-semibold text-mark hover:underline ps-7"
                      >
                        + Add Choice
                      </button>
                    )}
                  </div>
                )}

                {/* Numeric Answer Configuration */}
                {q.typeCode === 'NUMERIC' && (
                  <div className="flex flex-wrap items-center gap-3 rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-xs">
                    <span className="font-semibold text-slate-700">Answer Key:</span>
                    <div className="flex items-center gap-1.5">
                      <span>Expected:</span>
                      <input
                        type="number"
                        step="any"
                        value={q.config?.answer ?? ''}
                        onChange={(e) => updateQuestion(idx, { config: { ...q.config, answer: parseFloat(e.target.value) } })}
                        className="input w-20 py-0.5 text-xs font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Tolerance (±):</span>
                      <input
                        type="number"
                        step="any"
                        value={q.config?.tolerance ?? 0}
                        onChange={(e) => updateQuestion(idx, { config: { ...q.config, tolerance: parseFloat(e.target.value) } })}
                        className="input w-16 py-0.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Short Text / Essay Ruled Writing Lines */}
                {(q.typeCode === 'SHORT_TEXT' || q.typeCode === 'ESSAY') && (
                  <div className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50/50 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500">
                      <span className="italic">[Student response box]</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span>Word limits:</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="Min"
                            value={q.config?.minWords ?? ''}
                            onChange={(e) => updateQuestion(idx, { config: { ...q.config, minWords: parseInt(e.target.value, 10) || 0 } })}
                            className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-center"
                          />
                          <span>–</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="Max"
                            value={q.config?.maxWords ?? q.config?.wordLimit ?? ''}
                            onChange={(e) => updateQuestion(idx, {
                              config: {
                                ...q.config,
                                maxWords: parseInt(e.target.value, 10) || null,
                                wordLimit: parseInt(e.target.value, 10) || null,
                              },
                            })}
                            className="w-14 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-center font-bold text-slate-700"
                          />
                          <span>words</span>
                        </div>

                        <div className="flex items-center gap-1.5 border-s border-slate-200 ps-2.5">
                          <span className="font-medium text-slate-700">Answer lines (PDF):</span>
                          <input
                            type="number"
                            min="2"
                            max="60"
                            placeholder={q.typeCode === 'ESSAY' ? '14' : '5'}
                            value={q.config?.answerLines ?? ''}
                            onChange={(e) => updateQuestion(idx, {
                              config: {
                                ...q.config,
                                answerLines: parseInt(e.target.value, 10) || null,
                              },
                            })}
                            className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center font-bold text-mark"
                          />
                          <span>lines</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-b border-dashed border-slate-300 py-0.5"></div>
                    <div className="border-b border-dashed border-slate-300 py-0.5"></div>
                  </div>
                )}

                {/* Matching configuration */}
                {q.typeCode === 'MATCHING' && (
                  <div className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 p-2.5 text-xs">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Matching Pairs:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const pairs = [...(q.config?.pairs || []), { id: String(Date.now()), left: '', right: '' }];
                          updateQuestion(idx, { config: { ...q.config, pairs } });
                        }}
                        className="text-[11px] font-semibold text-mark hover:underline"
                      >
                        + Add Pair
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {(q.config?.pairs || []).map((pair, pIdx) => (
                        <div key={pIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={pair.left}
                            onChange={(e) => {
                              const newPairs = [...(q.config?.pairs || [])];
                              newPairs[pIdx].left = e.target.value;
                              updateQuestion(idx, { config: { ...q.config, pairs: newPairs } });
                            }}
                            placeholder={`Left prompt ${pIdx + 1}`}
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                          />
                          <span className="text-slate-400 font-bold">⇄</span>
                          <input
                            type="text"
                            value={pair.right}
                            onChange={(e) => {
                              const newPairs = [...(q.config?.pairs || [])];
                              newPairs[pIdx].right = e.target.value;
                              updateQuestion(idx, { config: { ...q.config, pairs: newPairs } });
                            }}
                            placeholder={`Correct match ${pIdx + 1}`}
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                          />
                          {(q.config?.pairs || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newPairs = (q.config?.pairs || []).filter((_, i) => i !== pIdx);
                                updateQuestion(idx, { config: { ...q.config, pairs: newPairs } });
                              }}
                              className="text-slate-400 hover:text-pen"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ordering configuration */}
                {q.typeCode === 'ORDERING' && (
                  <div className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 p-2.5 text-xs">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-700">Sequence Steps:</span>
                        <span className="ms-1.5 text-[10.5px] text-slate-500">(shuffled for students)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const items = [...(q.config?.items || []), ''];
                          updateQuestion(idx, { config: { ...q.config, items } });
                        }}
                        className="text-[11px] font-semibold text-mark hover:underline"
                      >
                        + Add Step
                      </button>
                    </div>
                    <div className="space-y-1">
                      {(q.config?.items || []).map((item, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                            {iIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const newItems = [...(q.config?.items || [])];
                              newItems[iIdx] = e.target.value;
                              updateQuestion(idx, { config: { ...q.config, items: newItems } });
                            }}
                            placeholder={`Step ${iIdx + 1}...`}
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                          />
                          {(q.config?.items || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = (q.config?.items || []).filter((_, i) => i !== iIdx);
                                updateQuestion(idx, { config: { ...q.config, items: newItems } });
                              }}
                              className="text-slate-400 hover:text-pen"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fill in the Blanks configuration */}
                {q.typeCode === 'FILL_BLANK' && (
                  <div className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 p-2.5 text-xs">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-700">Blanks & Answers:</span>
                        <span className="ms-1.5 text-[10.5px] text-slate-500">(use [blank-1], [blank-2])</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const blanks = [
                            ...(q.config?.blanks || []),
                            { id: String((q.config?.blanks || []).length + 1), acceptableAnswers: [''] },
                          ];
                          updateQuestion(idx, { config: { ...q.config, blanks } });
                        }}
                        className="text-[11px] font-semibold text-mark hover:underline"
                      >
                        + Add Blank
                      </button>
                    </div>
                    <div className="space-y-1">
                      {(q.config?.blanks || []).map((b, bIdx) => (
                        <div key={bIdx} className="flex items-center gap-2">
                          <span className="font-medium text-slate-600 shrink-0">Blank {b.id || bIdx + 1}:</span>
                          <input
                            type="text"
                            value={Array.isArray(b.acceptableAnswers) ? b.acceptableAnswers.join(', ') : (b.acceptableAnswers || '')}
                            onChange={(e) => {
                              const newBlanks = [...(q.config?.blanks || [])];
                              newBlanks[bIdx] = {
                                ...newBlanks[bIdx],
                                acceptableAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              };
                              updateQuestion(idx, { config: { ...q.config, blanks: newBlanks } });
                            }}
                            placeholder="Acceptable answers (comma separated, e.g. Paris, paris)"
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                          />
                          {(q.config?.blanks || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newBlanks = (q.config?.blanks || []).filter((_, i) => i !== bIdx);
                                updateQuestion(idx, { config: { ...q.config, blanks: newBlanks } });
                              }}
                              className="text-slate-400 hover:text-pen"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Programming / Code configuration */}
                {q.typeCode === 'CODE' && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-600 font-medium text-[11px] block">
                        Programming Environment & Starter Code
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        <span className="font-medium text-slate-700">Answer lines (PDF):</span>
                        <input
                          type="number"
                          min="5"
                          max="60"
                          placeholder="18"
                          value={q.config?.answerLines ?? ''}
                          onChange={(e) => updateQuestion(idx, {
                            config: {
                              ...q.config,
                              answerLines: parseInt(e.target.value, 10) || null,
                            },
                          })}
                          className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center font-bold text-mark"
                        />
                        <span>lines</span>
                      </div>
                    </div>
                    <CodeMorph
                      code={q.config?.starterCode ?? ''}
                      language={q.config?.language || 'c'}
                      onLanguageChange={(newLang) =>
                        updateQuestion(idx, { config: { ...q.config, language: newLang } })
                      }
                      editable={true}
                      onChange={(newCode) =>
                        updateQuestion(idx, { config: { ...q.config, starterCode: newCode } })
                      }
                      placeholder="// Write starter template code here directly for students..."
                      title="Starter Code"
                      className="min-h-[10rem]"
                    />
                  </div>
                )}

                {/* Explanation / Solution key note */}
                <div className="mt-2">
                  <input
                    type="text"
                    value={q.explanationMd || ''}
                    onChange={(e) => updateQuestion(idx, { explanationMd: e.target.value })}
                    placeholder="Optional solution notes or grading rubric (shown to students during feedback)..."
                    className="w-full text-[11px] text-slate-500 italic border-b border-transparent hover:border-slate-300 focus:border-slate-400 focus:outline-none py-0.5"
                  />
                </div>
              </div>

              {/* Question Actions Toolbar (Bank Sync / Reorder / Delete) */}
              <div className="mt-2 flex items-center justify-between gap-2 text-slate-400">
                <div>
                  {q.inBank ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700">
                      <CheckCircle2 size={11} /> In Question Bank
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => saveQuestionToBank(idx)}
                      className="inline-flex items-center gap-1 rounded border border-mark/30 bg-mark-tint/50 px-2 py-0.5 text-[10.5px] font-medium text-mark hover:bg-mark-tint transition-colors"
                      title="Save this question to your Question Bank immediately"
                    >
                      <Library size={11} /> Save to Bank
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Move Up"
                  disabled={idx === 0}
                  onClick={() => moveQuestion(idx, -1)}
                  className="p-1 hover:text-slate-700 disabled:opacity-20"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  title="Move Down"
                  disabled={idx === questions.length - 1}
                  onClick={() => moveQuestion(idx, 1)}
                  className="p-1 hover:text-slate-700 disabled:opacity-20"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  title="Delete Question"
                  onClick={() => removeQuestion(idx)}
                  className="p-1 hover:text-pen ms-1.5"
                >
                  <Trash2 size={13} />
                </button>
                </div>
              </div>
            </div>
          );
        }

        // Helper to render Add Question bar
        function renderAddQuestionBar() {
          return (
            <div className="mt-5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-3.5 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                + Add Question to Examination Paper
              </span>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addQuestion('MCQ_SINGLE')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Single Choice
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('MCQ_MULTI')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Multiple Choice
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('TRUE_FALSE')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + True / False
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('NUMERIC')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Numeric
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('SHORT_TEXT')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Short Text
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('ESSAY')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Essay
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('MATCHING')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Matching
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('ORDERING')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Ordering
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('FILL_BLANK')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Blanks
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('CODE')}
                  className="btn-quiet text-xs py-1 px-2.5"
                >
                  + Code
                </button>
                <button
                  type="button"
                  onClick={openBankModal}
                  className="btn-primary text-xs py-1 px-2.5 bg-mark"
                >
                  <Library size={12} /> Bank Import
                </button>
              </div>
            </div>
          );
        }

        // Academic Header Banner component
        function renderAcademicHeader() {
          return (
            <div className="border-b border-slate-900 pb-3 text-center">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Department of {selectedCourse?.department_name || 'Academic Studies'}
              </div>
              <div className="mt-1 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Course:</span>
                  <select
                    value={exam.courseId}
                    onChange={(e) => setExam({ ...exam, courseId: e.target.value })}
                    className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-800"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  value={exam.title}
                  onChange={(e) => setExam({ ...exam, title: e.target.value })}
                  placeholder="Examination Title..."
                  className="w-full text-center text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-mark rounded px-2 py-0.5 font-serif"
                />
              </div>

              {/* Exam Meta Strip on Paper */}
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-4 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock size={12} className="text-slate-500" />
                  <span>Duration: <strong>{exam.durationMinutes} min</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <Award size={12} className="text-slate-500" />
                  <span>Total Score: <strong>{computedTotalPoints} Points</strong></span>
                </div>
                <div>
                  <span>Pass: <strong>{exam.passingScore} Pts</strong></span>
                </div>
              </div>
            </div>
          );
        }

        // Instructions to Candidates
        function renderInstructions() {
          return (
            <div className="my-2.5 rounded border border-slate-300 bg-slate-50/70 p-2.5 text-xs leading-relaxed text-slate-700">
              <span className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Instructions to Candidates:</span>
              <textarea
                rows={2}
                value={exam.descriptionMd}
                onChange={(e) => setExam({ ...exam, descriptionMd: e.target.value })}
                placeholder="Instructions and exam conditions..."
                className="mt-0.5 w-full rounded border-0 bg-transparent p-0 text-xs text-slate-700 focus:outline-none focus:ring-0 resize-none italic"
              />
            </div>
          );
        }

        const splitIdx = Math.max(1, Math.ceil(questions.length / 2));
        const sheet1Questions = questions.slice(0, splitIdx);
        const sheet2Questions = questions.slice(splitIdx);

        if (paperViewMode === 'double') {
          return (
            <div className="mx-auto max-w-[1550px] px-2 sm:px-4">
              {error && <div className="mb-3"><Alert variant="danger">{error}</Alert></div>}
              {successMsg && <div className="mb-3"><Alert variant="ok">{successMsg}</Alert></div>}

              {/* DUAL PAPERS VIEW: SIDE BY SIDE */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                {/* SHEET 1 */}
                <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-7 shadow-xl transition-all">
                  {renderAcademicHeader()}
                  {renderInstructions()}

                  <div className="divide-y divide-slate-200">
                    {sheet1Questions.map((q, subIdx) => renderQuestionItem(q, subIdx))}
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Sheet 1 of 2</span>
                    <span>(Continued on Sheet 2 →)</span>
                  </div>
                </div>

                {/* SHEET 2 */}
                <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-7 shadow-xl transition-all">
                  {/* Sheet 2 Continuation Header */}
                  <div className="border-b border-slate-900 pb-2.5 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Department of {selectedCourse?.department_name || 'Academic Studies'}
                    </div>
                    <div className="mt-0.5 text-base font-bold uppercase tracking-tight text-slate-800 font-serif">
                      {exam.title || 'Examination'} — Continuation Sheet
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                      Course: <strong>{selectedCourse?.code || 'Course'}</strong> • Sheet 2 of 2
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200 mt-2">
                    {sheet2Questions.length > 0 ? (
                      sheet2Questions.map((q, subIdx) => renderQuestionItem(q, splitIdx + subIdx))
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-400 italic">
                        Sheet 2 will hold the remaining exercises as you add more questions.
                      </div>
                    )}
                  </div>

                  {renderAddQuestionBar()}

                  <div className="mt-5 border-t border-slate-200 pt-3 text-center">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-600 font-serif">
                      — END OF EXAMINATION PAPER —
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>Sheet 2 of 2</span>
                      <span>Total Exercises: {questions.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // SINGLE PAPER VIEW
        return (
          <div className="mx-auto max-w-4xl px-4">
            {error && <div className="mb-3"><Alert variant="danger">{error}</Alert></div>}
            {successMsg && <div className="mb-3"><Alert variant="ok">{successMsg}</Alert></div>}

            <div className="relative rounded-sm border border-slate-300 bg-white p-5 sm:p-7 shadow-xl transition-all">
              {renderAcademicHeader()}
              {renderInstructions()}

              <div className="divide-y divide-slate-200">
                {questions.map((q, idx) => renderQuestionItem(q, idx))}
              </div>

              {renderAddQuestionBar()}

              <div className="mt-6 border-t border-slate-200 pt-3 text-center">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-600 font-serif">
                  — END OF EXAMINATION PAPER —
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Page 1 of 1</span>
                  <span>Total Exercises: {questions.length}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          EXAM CONFIGURATION & RULES MODAL / DRAWER
         ========================================================================= */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Examination Schedule & Rules</h2>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Opens At</label>
                  <input
                    type="datetime-local"
                    value={exam.opensAt}
                    onChange={(e) => setExam({ ...exam, opensAt: e.target.value })}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Closes At</label>
                  <input
                    type="datetime-local"
                    value={exam.closesAt}
                    onChange={(e) => setExam({ ...exam, closesAt: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={exam.durationMinutes}
                    onChange={(e) => setExam({ ...exam, durationMinutes: parseInt(e.target.value, 10) || 1 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Passing Score</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={exam.passingScore}
                    onChange={(e) => setExam({ ...exam, passingScore: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded border border-line bg-paper p-3 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exam.shuffleQuestions}
                    onChange={(e) => setExam({ ...exam, shuffleQuestions: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>Shuffle question order for each candidate</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exam.shuffleOptions}
                    onChange={(e) => setExam({ ...exam, shuffleOptions: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>Shuffle option choices order</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exam.monitorFocus}
                    onChange={(e) => setExam({ ...exam, monitorFocus: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>Track tab switching and window blur (Integrity protection)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exam.negativeMarking}
                    onChange={(e) => setExam({ ...exam, negativeMarking: e.target.checked })}
                    className="rounded text-mark"
                  />
                  <span>Apply penalty for wrong choices (Negative marking)</span>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="btn-primary text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          IMPORT FROM QUESTION BANK MODAL
         ========================================================================= */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Import from Question Bank</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Select any existing question from your bank to insert onto this exam paper.
            </p>

            {/* Category Filter */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Tag size={13} className="text-ink-soft" />
              <span className="font-medium text-ink-soft">Filter by category:</span>
              <select
                value={bankCategoryFilter}
                onChange={(e) => setBankCategoryFilter(e.target.value)}
                className="rounded border border-line bg-white px-2 py-1 text-xs"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.depth > 0 ? `${'\u00A0\u00A0'.repeat(c.depth)}↳ ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              {bankCategoryFilter && (
                <span className="text-[11px] text-mark font-medium">
                  (Includes all subcategories)
                </span>
              )}
            </div>

            <div className="mt-4 divide-y divide-line max-h-96 overflow-y-auto">
              {(() => {
                const matchingCatIds = getMatchingCategoryIds(bankCategoryFilter, categories);
                const filteredBankQuestions = bankQuestions.filter(
                  (q) => !matchingCatIds || (q.category_id && matchingCatIds.has(q.category_id))
                );

                if (filteredBankQuestions.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-ink-faint">
                      No questions found{bankCategoryFilter ? ' in this category or its subcategories' : ' in question bank'}.
                    </div>
                  );
                }

                return filteredBankQuestions.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-ink">{q.body_md}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <span className="rounded bg-paper px-1.5 py-0.5">{q.type_code}</span>
                        <span>{q.default_points} pts</span>
                        {Array.isArray(q.options) && q.options.length > 0 && (
                          <span className="text-ok font-medium">• {q.options.length} options</span>
                        )}
                        {(q.category_path || q.category_name) && (
                          <span className="flex items-center gap-1 text-slate-500">
                            • <Tag size={11} /> {q.category_path || q.category_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => importBankQuestion(q)}
                      className="btn-primary text-xs py-1 px-2.5"
                    >
                      Insert
                    </button>
                  </div>
                ));
              })()}
            </div>

            <div className="flex justify-end pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => { setShowBankModal(false); setBankCategoryFilter(''); }}
                className="btn-quiet text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportModal
        open={showExportModal}
        title="Export Exam Paper (PDF)"
        defaultFilename={`${sanitizeFilename(exam.title || 'exam')}_paper`}
        extension="pdf"
        onClose={() => setShowExportModal(false)}
        onConfirm={({ filename }) => {
          exportExamPaperToPdf({ ...exam, questions }, selectedCourse, { filename });
          setShowExportModal(false);
        }}
      />
    </div>
  );
}
