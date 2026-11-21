import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Edit3, HelpCircle, CheckCircle, Tag, Filter, FolderPlus, Folder, X } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';

const QUESTION_TYPES = [
  { code: 'MCQ_SINGLE', label: 'Single Choice (MCQ)' },
  { code: 'MCQ_MULTI', label: 'Multiple Choice (MCQ)' },
  { code: 'TRUE_FALSE', label: 'True / False' },
  { code: 'NUMERIC', label: 'Numeric Answer' },
  { code: 'SHORT_TEXT', label: 'Short Text / Open Question' },
];

export default function Questions() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Category Management State
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState('');
  const [catError, setCatError] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // Inline Category Creator inside Question Modal
  const [showInlineCat, setShowInlineCat] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');

  // Question Form State
  const [form, setForm] = useState({
    categoryId: '',
    typeCode: 'MCQ_SINGLE',
    bodyMd: '',
    explanationMd: '',
    defaultPoints: 1,
    config: {},
    options: [
      { position: 0, bodyMd: '', isCorrect: true, feedbackMd: '' },
      { position: 1, bodyMd: '', isCorrect: false, feedbackMd: '' },
    ],
  });

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [qRes, cRes] = await Promise.all([
        api.get(`/questions${selectedCategory ? `?categoryId=${selectedCategory}` : ''}`),
        api.get('/questions/categories'),
      ]);
      setQuestions(qRes);
      setCategories(cRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  async function handleCreateCategory(e) {
    if (e) e.preventDefault();
    if (!newCatName.trim()) return;
    setCatSaving(true);
    setCatError('');
    try {
      await api.post('/questions/categories', {
        name: newCatName.trim(),
        parentId: newCatParentId || null,
      });
      setNewCatName('');
      setNewCatParentId('');
      const cRes = await api.get('/questions/categories');
      setCategories(cRes);
    } catch (err) {
      setCatError(err.message);
    } finally {
      setCatSaving(false);
    }
  }

  async function handleDeleteCategory(cat) {
    const confirmMsg = t(
      'questions.deleteCategoryConfirm',
      'Delete category "{{name}}"? Questions will become uncategorized.',
      { name: cat.name }
    );
    const ok = await confirm({
      title: t('questions.deleteCategoryTitle', 'Delete Category'),
      message: confirmMsg,
      confirmLabel: t('common.delete', 'Delete'),
      variant: 'danger',
    });
    if (!ok) return;
    setCatError('');
    try {
      await api.delete(`/questions/categories/${cat.id}`);
      if (selectedCategory === cat.id) {
        setSelectedCategory('');
      }
      const cRes = await api.get('/questions/categories');
      setCategories(cRes);
      loadData();
    } catch (err) {
      setCatError(err.message);
    }
  }

  async function handleQuickAddCategory() {
    if (!inlineCatName.trim()) return;
    try {
      const res = await api.post('/questions/categories', {
        name: inlineCatName.trim(),
      });
      const cRes = await api.get('/questions/categories');
      setCategories(cRes);
      setForm((prev) => ({ ...prev, categoryId: res.id }));
      setInlineCatName('');
      setShowInlineCat(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleOpenCreate() {
    setEditingQuestion(null);
    setForm({
      categoryId: categories[0]?.id ?? '',
      typeCode: 'MCQ_SINGLE',
      bodyMd: '',
      explanationMd: '',
      defaultPoints: 1,
      config: {},
      options: [
        { position: 0, bodyMd: '', isCorrect: true, feedbackMd: '' },
        { position: 1, bodyMd: '', isCorrect: false, feedbackMd: '' },
      ],
    });
    setShowModal(true);
  }

  function handleOpenEdit(q) {
    setEditingQuestion(q);
    api.get(`/questions/${q.id}`).then((full) => {
      setForm({
        categoryId: full.category_id ?? '',
        typeCode: full.type_code,
        bodyMd: full.body_md,
        explanationMd: full.explanation_md ?? '',
        defaultPoints: Number(full.default_points),
        config: full.config ?? {},
        options: full.options.map((o) => ({
          position: o.position,
          bodyMd: o.body_md,
          isCorrect: o.is_correct,
          feedbackMd: o.feedback_md ?? '',
        })),
      });
      setShowModal(true);
    });
  }

  function handleTypeChange(newType) {
    let opts = form.options;
    if (newType === 'TRUE_FALSE') {
      opts = [
        { position: 0, bodyMd: 'True', isCorrect: true, feedbackMd: '' },
        { position: 1, bodyMd: 'False', isCorrect: false, feedbackMd: '' },
      ];
    } else if (newType === 'NUMERIC' || newType === 'SHORT_TEXT') {
      opts = [];
    } else if (opts.length === 0) {
      opts = [
        { position: 0, bodyMd: '', isCorrect: true, feedbackMd: '' },
        { position: 1, bodyMd: '', isCorrect: false, feedbackMd: '' },
      ];
    }
    setForm({ ...form, typeCode: newType, options: opts });
  }

  function handleOptionChange(idx, field, value) {
    const updated = [...form.options];
    if (field === 'isCorrect' && form.typeCode === 'MCQ_SINGLE') {
      updated.forEach((o, i) => { o.isCorrect = i === idx; });
    } else {
      updated[idx][field] = value;
    }
    setForm({ ...form, options: updated });
  }

  function addOption() {
    setForm({
      ...form,
      options: [
        ...form.options,
        { position: form.options.length, bodyMd: '', isCorrect: false, feedbackMd: '' },
      ],
    });
  }

  function removeOption(idx) {
    const updated = form.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, position: i }));
    setForm({ ...form, options: updated });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingQuestion) {
        await api.put(`/questions/${editingQuestion.id}`, form);
      } else {
        await api.post('/questions', form);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchive(id) {
    const ok = await confirm({
      title: t('questions.archiveTitle', 'Archive Question'),
      message: t('questions.archiveConfirm', 'Archive this question? It will not appear in future exams.'),
      confirmLabel: t('common.archive', 'Archive'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/questions/${id}`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('questions.title', 'Question Bank')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('questions.subtitle', 'Create and organise reusable versioned exam questions.')}</p>
        </div>
        <button onClick={handleOpenCreate} className="btn-primary self-start">
          <Plus size={16} />
          {t('questions.newQuestion', 'New Question')}
        </button>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      {/* Filter and Category Management bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Filter size={16} />
            <span>{t('questions.filterCategory', 'Category:')}</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-sm"
          >
            <option value="">{t('common.all', 'All Categories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.depth > 0 ? `${'\u00A0\u00A0'.repeat(c.depth)}↳ ${c.name}` : c.name}
              </option>
            ))}
          </select>

          {selectedCategory && (
            <div className="flex items-center gap-1.5 rounded-full bg-mark-tint px-2.5 py-1 text-xs text-mark font-medium">
              <span>(Includes all subcategories)</span>
              <button
                type="button"
                onClick={() => setSelectedCategory('')}
                className="ms-1 font-bold text-mark hover:text-ink"
                title="Clear filter"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowCatModal(true)}
          className="btn-quiet text-xs py-1.5 px-3 flex items-center gap-1.5 font-medium"
        >
          <FolderPlus size={15} />
          {t('questions.manageCategories', 'Manage Categories')} ({categories.length})
        </button>
      </div>

      {/* Questions list */}
      <div className="mt-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : questions.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 text-center text-sm text-ink-soft">
            {t('questions.empty', 'No questions in this category yet. Click "New Question" to create one.')}
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="rounded-lg border border-line bg-white p-4 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">
                        {q.type_code}
                      </span>
                      <span className="rounded bg-ok-tint px-2 py-0.5 text-xs font-medium text-ok">
                        {q.default_points} {t('questions.pts', 'pts')}
                      </span>
                      {(q.category_path || q.category_name) && (
                        <span className="flex items-center gap-1 text-xs text-ink-faint" title={q.category_path || q.category_name}>
                          <Tag size={12} /> {q.category_path || q.category_name}
                        </span>
                      )}
                      <span className="text-xs text-ink-faint">v{q.version}</span>
                    </div>
                    <div className="mt-2 font-medium text-ink whitespace-pre-wrap">{q.body_md}</div>
                    {q.explanation_md && (
                      <div className="mt-1 text-xs text-ink-soft italic">💡 {q.explanation_md}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenEdit(q)} className="p-1 text-ink-soft hover:text-mark" title="Edit / New version">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleArchive(q.id)} className="p-1 text-ink-soft hover:text-pen" title="Archive">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Question Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {editingQuestion ? t('questions.editTitle', 'Update Question (Creates v' + (editingQuestion.version + 1) + ')') : t('questions.createTitle', 'Create Question')}
            </h2>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('questions.type', 'Question Type')}</label>
                  <select
                    value={form.typeCode}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="input"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-soft">{t('questions.category', 'Category')}</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineCat(!showInlineCat)}
                      className="text-[11px] font-semibold text-mark hover:underline"
                    >
                      {showInlineCat ? t('common.cancel', 'Cancel') : t('questions.addCategoryQuick', '+ New Category')}
                    </button>
                  </div>

                  {showInlineCat ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder={t('questions.categoryName', 'Category Name')}
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        className="input text-xs py-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAddCategory();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleQuickAddCategory}
                        className="btn-primary text-xs py-1 px-2.5 shrink-0"
                      >
                        {t('common.confirm', 'Add')}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="input"
                    >
                      <option value="">{t('common.none', 'None')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.depth > 0 ? `${'\u00A0\u00A0'.repeat(c.depth)}↳ ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{t('questions.points', 'Default Points')}</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.defaultPoints}
                    onChange={(e) => setForm({ ...form, defaultPoints: parseFloat(e.target.value) || 0 })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">{t('questions.body', 'Question Text (Markdown supported)')}</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter the question text or problem statement..."
                  value={form.bodyMd}
                  onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
                  className="input font-mono text-sm"
                />
              </div>

              {/* Options for MCQ / True False */}
              {(form.typeCode === 'MCQ_SINGLE' || form.typeCode === 'MCQ_MULTI' || form.typeCode === 'TRUE_FALSE') && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-soft">
                      {t('questions.options', 'Answer Options')} (Select the correct answer)
                    </label>
                    {form.typeCode !== 'TRUE_FALSE' && (
                      <button type="button" onClick={addOption} className="text-xs text-mark hover:underline">
                        + Add Choice
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {form.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type={form.typeCode === 'MCQ_MULTI' ? 'checkbox' : 'radio'}
                          name="isCorrect"
                          checked={opt.isCorrect}
                          onChange={(e) => handleOptionChange(idx, 'isCorrect', e.target.checked)}
                          className="h-4 w-4 text-mark focus:ring-mark"
                        />
                        <input
                          required
                          value={opt.bodyMd}
                          onChange={(e) => handleOptionChange(idx, 'bodyMd', e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          className="input flex-1"
                        />
                        {form.typeCode !== 'TRUE_FALSE' && form.options.length > 2 && (
                          <button type="button" onClick={() => removeOption(idx)} className="p-1 text-ink-soft hover:text-pen">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Numeric answer configuration */}
              {form.typeCode === 'NUMERIC' && (
                <div className="grid grid-cols-2 gap-4 rounded-md border border-line bg-paper p-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Expected Number</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={form.config?.answer ?? ''}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, answer: parseFloat(e.target.value) } })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Tolerance (±)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.config?.tolerance ?? 0}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, tolerance: parseFloat(e.target.value) || 0 } })}
                      className="input"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">{t('questions.explanation', 'Explanation / Solution Notes (optional)')}</label>
                <input
                  placeholder="Shown to students during review if enabled..."
                  value={form.explanationMd}
                  onChange={(e) => setForm({ ...form, explanationMd: e.target.value })}
                  className="input text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-quiet">
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

      {/* Category Management Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Folder size={20} className="text-mark" />
                <h2 className="text-lg font-bold text-ink">{t('questions.manageCategories', 'Manage Categories')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="text-ink-soft hover:text-ink p-1"
              >
                <X size={18} />
              </button>
            </div>

            {catError && <div className="mt-3"><Alert variant="danger">{catError}</Alert></div>}

            {/* Create Category Form */}
            <form onSubmit={handleCreateCategory} className="mt-4 rounded-lg border border-line bg-paper/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {t('questions.newCategory', 'New Category')}
              </h3>
              <div className="mt-2 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">
                    {t('questions.categoryName', 'Category Name')}
                  </label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Algorithms, Data Structures, Calculus..."
                    className="input text-xs"
                    required
                  />
                </div>

                {categories.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">
                      {t('questions.parentCategory', 'Parent Category (Optional)')}
                    </label>
                    <select
                      value={newCatParentId}
                      onChange={(e) => setNewCatParentId(e.target.value)}
                      className="input text-xs"
                    >
                      <option value="">{t('common.none', 'None (Top Level)')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.depth > 0 ? `${'\u00A0\u00A0'.repeat(c.depth)}↳ ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={catSaving || !newCatName.trim()}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <Plus size={14} />
                    {catSaving ? t('common.loading', 'Creating...') : t('questions.createCategory', 'Create Category')}
                  </button>
                </div>
              </div>
            </form>

            {/* Existing Categories List */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {t('questions.categories', 'Categories')} ({categories.length})
              </h3>
              <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-line rounded border border-line">
                {categories.length === 0 ? (
                  <div className="p-4 text-center text-xs text-ink-soft">
                    {t('questions.noCategories', 'No categories defined yet. Create your first category above.')}
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3 hover:bg-paper/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <Folder size={14} className="text-slate-400 shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-ink">
                            {cat.depth > 0 && <span className="text-slate-400 me-1.5">{'— '.repeat(cat.depth)}</span>}
                            {cat.name}
                          </div>
                          {cat.path && cat.depth > 0 && (
                            <div className="text-[11px] text-ink-soft">
                              {cat.path}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1 text-ink-soft hover:text-pen"
                        title="Delete category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="btn-quiet text-xs"
              >
                {t('common.cancel', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
