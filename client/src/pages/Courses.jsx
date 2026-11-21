import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, Trash2, Edit3, Users, Building, Search, Check, Layers, Power, PowerOff } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';

export default function Courses() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    departmentId: '',
    classIds: [],
  });

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [courseList, classList, deptList] = await Promise.all([
        api.get('/academic/courses?status=all'),
        api.get('/academic/classes?mine=true&status=all'),
        api.get('/academic/departments'),
      ]);
      setCourses(courseList);
      setClasses(classList);
      setDepartments(deptList);
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
    setEditingCourse(null);
    setForm({
      code: '',
      name: '',
      departmentId: departments[0]?.id || '',
      classIds: [],
    });
    setShowModal(true);
  }

  function handleOpenEdit(course) {
    setEditingCourse(course);
    const assignedIds = (course.assigned_classes || []).map((c) => c.id);
    setForm({
      code: course.code,
      name: course.name,
      departmentId: course.department_id || '',
      classIds: assignedIds,
    });
    setShowModal(true);
  }

  function toggleClassSelection(classId) {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      return {
        ...prev,
        classIds: exists
          ? prev.classIds.filter((id) => id !== classId)
          : [...prev.classIds, classId],
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        departmentId: form.departmentId || null,
        classIds: form.classIds,
      };

      if (editingCourse) {
        await api.put(`/academic/courses/${editingCourse.id}`, payload);
        setSuccessMsg(t('courses.updated', 'Course updated successfully'));
      } else {
        await api.post('/academic/courses', payload);
        setSuccessMsg(t('courses.created', 'Course created successfully'));
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course) {
    const ok = await confirm({
      title: t('courses.archiveTitle', 'Archive Course'),
      message: t('courses.archiveConfirm', 'Archive this course?'),
      confirmLabel: t('courses.archive', 'Archive'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/academic/courses/${course.id}`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleStatus(course) {
    const isActive = Boolean(course.is_active);
    const ok = await confirm({
      title: isActive
        ? t('courses.deactivateTitle', 'Deactivate Course')
        : t('courses.activateTitle', 'Activate Course'),
      message: isActive
        ? t('courses.deactivateConfirm', 'Deactivate this course? It will be marked inactive.')
        : t('courses.activateConfirm', 'Activate this course?'),
      confirmLabel: isActive
        ? t('courses.deactivate', 'Deactivate')
        : t('courses.activate', 'Activate'),
      variant: isActive ? 'warning' : 'primary',
    });
    if (!ok) return;

    try {
      if (isActive) {
        await api.post(`/academic/courses/${course.id}/deactivate`);
        setSuccessMsg(t('courses.deactivatedSuccess', 'Course deactivated.'));
      } else {
        await api.post(`/academic/courses/${course.id}/activate`);
        setSuccessMsg(t('courses.activatedSuccess', 'Course activated successfully.'));
      }
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredCourses = courses.filter((c) => {
    const isActive = Boolean(c.is_active);
    if (statusFilter === 'active' && !isActive) return false;
    if (statusFilter === 'inactive' && isActive) return false;
    const matchesSearch =
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase());
    const matchesDept = !deptFilter || c.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t('courses.title', 'Courses')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('courses.subtitle', 'Create courses and assign them to your classes.')}
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-primary inline-flex items-center gap-2 self-start shadow-sm"
        >
          <Plus size={16} />
          {t('courses.newCourse', 'New Course')}
        </button>
      </div>

      {error && <Alert type="danger" message={error} />}
      {successMsg && (
        <Alert
          type="success"
          message={successMsg}
          onDismiss={() => setSuccessMsg('')}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
            <input
              type="text"
              placeholder={t('common.search', 'Search courses by code or name...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full pl-9 text-sm"
            />
          </div>
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="input text-sm sm:w-52"
            >
              <option value="">{t('common.all', 'All Departments')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-paper p-1 text-xs">
          {[
            { id: 'all', label: t('courses.all', 'All') },
            { id: 'active', label: t('courses.active', 'Active') },
            { id: 'inactive', label: t('courses.inactive', 'Inactive') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-md px-3 py-1 font-medium transition ${
                statusFilter === tab.id
                  ? 'bg-white text-mark shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Course Cards Grid */}
      {loading ? (
        <div className="py-12 text-center text-sm text-ink-soft">
          {t('common.loading', 'Loading courses...')}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-paper p-10 text-center">
          <BookOpen size={36} className="mx-auto text-ink-faint" />
          <p className="mt-3 font-medium text-ink">
            {t('courses.empty', 'No courses found.')}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {search || deptFilter
              ? t('courses.noMatch', 'Try adjusting your search or filters.')
              : t('courses.createFirst', 'Get started by creating your first course.')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((c) => {
            const assignedList = c.assigned_classes || [];
            return (
              <div
                key={c.id}
                className="group flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm transition hover:border-mark/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block rounded-md bg-mark-tint px-2.5 py-1 text-xs font-semibold text-mark">
                        {c.code}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                          c.is_active
                            ? 'bg-ok-tint text-ok'
                            : 'bg-paper text-ink-faint border border-line'
                        }`}
                      >
                        {c.is_active ? t('courses.activeBadge', 'Active') : t('courses.inactiveBadge', 'Inactive')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={() => handleToggleStatus(c)}
                        title={c.is_active ? t('courses.deactivate', 'Deactivate Course') : t('courses.activate', 'Activate Course')}
                        className={`rounded p-1 ${
                          c.is_active
                            ? 'text-ink-soft hover:bg-paper hover:text-ink'
                            : 'text-ok hover:bg-ok-tint'
                        }`}
                      >
                        {c.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(c)}
                        title={t('courses.editCourse', 'Edit course')}
                        className="rounded p-1 text-ink-soft hover:bg-paper hover:text-ink"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        title={t('courses.archiveConfirm', 'Archive course')}
                        className="rounded p-1 text-ink-soft hover:bg-danger-tint hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-3 font-semibold text-ink">{c.name}</h3>

                  {c.department_name && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
                      <Building size={13} className="shrink-0 text-ink-faint" />
                      <span>{c.department_name}</span>
                    </div>
                  )}

                  {/* Assigned Classes */}
                  <div className="mt-4 border-t border-line/60 pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                      <Users size={13} />
                      <span>{t('courses.assignedClasses', 'Assigned Classes')}:</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {assignedList.length > 0 ? (
                        assignedList.map((cls) => (
                          <span
                            key={cls.id}
                            className="inline-flex items-center gap-1 rounded bg-mark-tint/40 px-2 py-0.5 text-[11px] font-medium text-ink"
                          >
                            <Users size={10} className="text-mark" />
                            {cls.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] italic text-ink-faint">
                          {t('courses.noClassesAssigned', 'Not assigned to any class')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-line/40 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="btn-quiet text-xs font-medium inline-flex items-center gap-1.5 text-mark"
                  >
                    <Layers size={13} />
                    {t('courses.manageAssignments', 'Manage Classes')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-ink">
              {editingCourse
                ? t('courses.editCourse', 'Edit Course')
                : t('courses.newCourse', 'New Course')}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {t(
                'courses.modalHint',
                'Specify the course code, name, and choose which classes to assign.'
              )}
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft">
                  {t('courses.code', 'Course Code')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS101, MATH201"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="input mt-1 w-full text-sm font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft">
                  {t('courses.name', 'Course Name')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures and Algorithms"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input mt-1 w-full text-sm"
                />
              </div>

              {departments.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-ink-soft">
                    {t('courses.department', 'Department (Optional)')}
                  </label>
                  <select
                    value={form.departmentId}
                    onChange={(e) =>
                      setForm({ ...form, departmentId: e.target.value })
                    }
                    className="input mt-1 w-full text-sm"
                  >
                    <option value="">{t('common.none', 'None / General')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Assign to Classes */}
              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft">
                  {t('courses.assignToClasses', 'Assign to Classes')}
                </label>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {t('courses.selectClassesHint', 'Select classes that should study this course:')}
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 rounded-md border border-line p-2 bg-paper/50">
                  {classes.length === 0 ? (
                    <p className="p-2 text-xs text-ink-faint">
                      {t('courses.noAvailableClasses', 'No classes created yet.')}
                    </p>
                  ) : (
                    classes.map((cls) => {
                      const isSelected = form.classIds.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-xs cursor-pointer transition ${
                            isSelected
                              ? 'bg-mark-tint text-mark font-medium'
                              : 'hover:bg-white text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleClassSelection(cls.id)}
                            className="rounded border-line text-mark focus:ring-mark"
                          />
                          <div className="flex-1 flex items-center justify-between">
                            <span>{cls.name}</span>
                            <span className="text-[10px] text-ink-soft">
                              {cls.academic_year}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-quiet text-xs"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary text-xs"
                >
                  {saving
                    ? t('common.loading', 'Saving...')
                    : editingCourse
                    ? t('common.update', 'Update Course')
                    : t('common.create', 'Create Course')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
