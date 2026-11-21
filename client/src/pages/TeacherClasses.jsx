import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, Plus, Trash2, Edit3, Copy, Check, Mail, UserPlus, BookOpen,
  GraduationCap, Share2, X, ChevronRight, AlertCircle, Archive, RotateCcw, Search
} from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';

export default function TeacherClasses() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Create/Edit Class Modal
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    name: '',
    academicYear: '2026/2027',
    departmentId: '',
  });

  // Manage Class Details Drawer/Modal
  const [selectedClass, setSelectedClass] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Invite Student State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Assign Course State
  const [selectedCourseToAssign, setSelectedCourseToAssign] = useState('');
  const [assigningCourse, setAssigningCourse] = useState(false);

  // Copied code feedback
  const [copiedCode, setCopiedCode] = useState('');

  // Status and search filter
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'archived'
  const [search, setSearch] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [clsList, cList, dList] = await Promise.all([
        api.get('/academic/classes?mine=true&status=all'),
        api.get('/academic/courses?status=all'),
        api.get('/academic/departments'),
      ]);
      setClasses(clsList);
      setAllCourses(cList);
      setDepartments(dList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function openClassDetails(cls) {
    setSelectedClass(cls);
    setLoadingDetails(true);
    try {
      const details = await api.get(`/academic/classes/${cls.id}`);
      setClassDetails(details);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleOpenCreate() {
    setEditingClass(null);
    setClassForm({
      name: '',
      academicYear: '2026/2027',
      departmentId: departments[0]?.id || '',
    });
    setShowClassModal(true);
  }

  function handleOpenEdit(cls, e) {
    e.stopPropagation();
    setEditingClass(cls);
    setClassForm({
      name: cls.name,
      academicYear: cls.academic_year,
      departmentId: cls.department_id || '',
    });
    setShowClassModal(true);
  }

  async function handleClassSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingClass) {
        await api.put(`/academic/classes/${editingClass.id}`, classForm);
        setSuccessMsg(t('classes.updated', 'Class updated successfully'));
      } else {
        const created = await api.post('/academic/classes', classForm);
        setSuccessMsg(t('classes.created', 'Class created! Invite code: ') + created.invite_code);
      }
      setShowClassModal(false);
      loadData();
      if (selectedClass && editingClass && selectedClass.id === editingClass.id) {
        openClassDetails({ ...selectedClass, ...classForm });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteClass(cls, e) {
    e.stopPropagation();
    const ok = await confirm({
      title: t('classes.archiveTitle', 'Archive Class'),
      message: t('classes.deleteConfirm', 'Archive this class? Students will no longer see it.'),
      confirmLabel: t('classes.archive', 'Archive'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/academic/classes/${cls.id}`);
      setSuccessMsg(t('classes.archivedSuccess', 'Class archived successfully.'));
      if (selectedClass?.id === cls.id) {
        setSelectedClass(null);
        setClassDetails(null);
      }
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestoreClass(cls, e) {
    e.stopPropagation();
    const ok = await confirm({
      title: t('classes.restoreTitle', 'Restore Class'),
      message: t('classes.restoreConfirm', 'Restore this archived class?'),
      confirmLabel: t('classes.restore', 'Restore'),
      variant: 'primary',
    });
    if (!ok) return;
    try {
      await api.post(`/academic/classes/${cls.id}/restore`);
      setSuccessMsg(t('classes.restoredSuccess', 'Class restored successfully.'));
      loadData();
      if (selectedClass?.id === cls.id) {
        openClassDetails({ ...cls, is_archived: false, archived_at: null });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleInviteStudent(e) {
    e.preventDefault();
    if (!inviteIdentifier.trim() || !selectedClass) return;
    setInviting(true);
    setInviteError('');
    try {
      const res = await api.post(`/academic/classes/${selectedClass.id}/invite`, {
        identifier: inviteIdentifier.trim(),
      });
      setInviteIdentifier('');
      setShowInviteModal(false);
      // Refresh class details
      openClassDetails(selectedClass);
      loadData();
      setSuccessMsg(`Student ${res.first_name} ${res.last_name} (${res.matricule}) enrolled!`);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveStudent(studentId) {
    const ok = await confirm({
      title: t('classes.removeStudentTitle', 'Remove Student'),
      message: t('classes.removeStudentConfirm', 'Remove this student from the class?'),
      confirmLabel: t('common.remove', 'Remove'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/academic/classes/${selectedClass.id}/students/${studentId}`);
      openClassDetails(selectedClass);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignCourse() {
    if (!selectedCourseToAssign || !selectedClass) return;
    setAssigningCourse(true);
    try {
      await api.post(`/academic/classes/${selectedClass.id}/courses`, {
        courseId: selectedCourseToAssign,
      });
      setSelectedCourseToAssign('');
      openClassDetails(selectedClass);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigningCourse(false);
    }
  }

  async function handleUnassignCourse(courseId) {
    const ok = await confirm({
      title: t('classes.unassignCourseTitle', 'Unassign Course'),
      message: t('classes.unassignCourseConfirm', 'Unassign this course from this class?'),
      confirmLabel: t('common.unassign', 'Unassign'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/academic/classes/${selectedClass.id}/courses/${courseId}`);
      openClassDetails(selectedClass);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  }

  const filteredClasses = classes.filter((cls) => {
    const isArchived = Boolean(cls.archived_at || cls.is_archived);
    if (statusFilter === 'active' && isArchived) return false;
    if (statusFilter === 'archived' && !isArchived) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = cls.name?.toLowerCase().includes(q);
      const matchCode = cls.invite_code?.toLowerCase().includes(q);
      const matchYear = cls.academic_year?.toLowerCase().includes(q);
      const matchDept = cls.department_name?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchYear && !matchDept) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t('classes.title', 'My Classes')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('classes.subtitle', 'Create classes, invite students, and assign academic courses.')}
          </p>
        </div>
        <button onClick={handleOpenCreate} className="btn-primary self-start">
          <Plus size={16} />
          {t('classes.newClass', 'Create Class')}
        </button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {successMsg && <Alert variant="ok">{successMsg}</Alert>}

      {/* Search and Status Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
          <input
            type="text"
            placeholder={t('classes.searchPlaceholder', 'Search classes by name, code or year...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper p-1 text-xs">
          {[
            { id: 'all', label: t('classes.all', 'All') },
            { id: 'active', label: t('classes.active', 'Active') },
            { id: 'archived', label: t('classes.archived', 'Archived') },
          ].map((tab) => (
            <button
              key={tab.id}
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

      {/* Classes Grid */}
      {loading ? (
        <div className="py-12 text-center text-sm text-ink-soft">{t('common.loading')}</div>
      ) : filteredClasses.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-12 text-center">
          <GraduationCap size={40} className="mx-auto text-ink-faint" />
          <h3 className="mt-3 text-base font-semibold text-ink">
            {classes.length === 0
              ? t('classes.emptyTitle', 'No classes created yet')
              : t('classes.noMatching', 'No classes match your filter')}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            {classes.length === 0
              ? t('classes.emptySubtitle', 'Click "Create Class" to create your first class and invite students.')
              : t('classes.noMatchingSubtitle', 'Try selecting a different status filter or clearing your search.')}
          </p>
          {classes.length === 0 && (
            <button onClick={handleOpenCreate} className="btn-primary mt-4 mx-auto">
              <Plus size={16} />
              {t('classes.newClass', 'Create Class')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((cls) => (
            <div
              key={cls.id}
              onClick={() => openClassDetails(cls)}
              className={`cursor-pointer rounded-lg border bg-white p-5 shadow-sm transition-all hover:border-mark hover:shadow-md ${
                selectedClass?.id === cls.id ? 'border-mark ring-1 ring-mark' : 'border-line'
              } ${cls.is_archived || cls.archived_at ? 'opacity-85 bg-slate-50/50' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink hover:text-mark">{cls.name}</h3>
                    {(cls.is_archived || cls.archived_at) && (
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        {t('classes.archivedBadge', 'Archived')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-soft">{cls.academic_year}</div>
                  {cls.department_name && (
                    <div className="mt-1 inline-block rounded bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                      {cls.department_name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEdit(cls, e)}
                    className="p-1 text-ink-soft hover:text-mark"
                    title={t('classes.editClass', 'Edit Class')}
                  >
                    <Edit3 size={15} />
                  </button>
                  {cls.is_archived || cls.archived_at ? (
                    <button
                      type="button"
                      onClick={(e) => handleRestoreClass(cls, e)}
                      className="p-1 text-ink-soft hover:text-ok"
                      title={t('classes.restore', 'Restore Class')}
                    >
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClass(cls, e)}
                      className="p-1 text-ink-soft hover:text-pen"
                      title={t('classes.archive', 'Archive Class')}
                    >
                      <Archive size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Class Invite Code Badge */}
              <div className="mt-4 flex items-center justify-between rounded border border-dashed border-mark/30 bg-mark-tint/30 px-3 py-1.5">
                <div className="text-xs">
                  <span className="text-[10px] uppercase font-bold text-mark block">Invite Code</span>
                  <span className="font-mono font-bold text-ink">{cls.invite_code || '—'}</span>
                </div>
                {cls.invite_code && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCode(cls.invite_code);
                    }}
                    className="flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-medium text-mark shadow-sm hover:bg-slate-50 border border-line"
                    title="Copy Invite Code"
                  >
                    {copiedCode === cls.invite_code ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
                    <span>{copiedCode === cls.invite_code ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>

              {/* Counts footer */}
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft">
                <span className="flex items-center gap-1">
                  <Users size={14} className="text-slate-400" />
                  <strong>{cls.student_count || 0}</strong> {t('classes.students', 'Students')}
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen size={14} className="text-slate-400" />
                  <strong>{cls.course_count || 0}</strong> {t('classes.courses', 'Courses')}
                </span>
                <ChevronRight size={14} className="text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
          SELECTED CLASS DETAILS DRAWER / VIEW
         ========================================================================= */}
      {selectedClass && (
        <div className="mt-8 rounded-lg border border-line bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-ink">{selectedClass.name}</h2>
                <span className="rounded bg-mark-tint px-2 py-0.5 text-xs font-semibold text-mark">
                  {selectedClass.academic_year}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Share invite code <strong className="font-mono text-ink font-bold">{selectedClass.invite_code}</strong> with students to let them self-enroll, or invite them directly below.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="btn-primary text-xs py-1.5 px-3"
              >
                <UserPlus size={14} />
                {t('classes.inviteStudent', 'Invite Student')}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedClass(null); setClassDetails(null); }}
                className="p-1 text-ink-soft hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {loadingDetails ? (
            <div className="py-12 text-center text-sm text-ink-soft">{t('common.loading')}</div>
          ) : classDetails && (
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Enrolled Students Column */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-ink flex items-center gap-2">
                    <Users size={16} className="text-mark" />
                    {t('classes.enrolledStudents', 'Enrolled Students')} ({classDetails.students?.length || 0})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="text-xs text-mark font-semibold hover:underline"
                  >
                    + Invite
                  </button>
                </div>

                <div className="mt-3 divide-y divide-line rounded border border-line max-h-80 overflow-y-auto">
                  {classDetails.students?.length === 0 ? (
                    <div className="p-6 text-center text-xs text-ink-soft">
                      No students enrolled yet. Click "Invite Student" or share the invite code.
                    </div>
                  ) : (
                    classDetails.students?.map((s) => (
                      <div key={s.user_id} className="flex items-center justify-between p-3 hover:bg-paper/40 transition-colors">
                        <div>
                          <div className="text-xs font-semibold text-ink">
                            {s.first_name} {s.last_name}
                          </div>
                          <div className="text-[11px] text-ink-soft font-mono">
                            ID: {s.matricule} • {s.email}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(s.user_id)}
                          className="p-1 text-ink-soft hover:text-pen"
                          title="Remove Student"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Assigned Courses Column */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-ink flex items-center gap-2">
                    <BookOpen size={16} className="text-mark" />
                    {t('classes.assignedCourses', 'Assigned Courses')} ({classDetails.courses?.length || 0})
                  </h3>
                </div>

                {/* Assign Course Selector */}
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={selectedCourseToAssign}
                    onChange={(e) => setSelectedCourseToAssign(e.target.value)}
                    className="input text-xs py-1.5 flex-1"
                  >
                    <option value="">Select course to assign...</option>
                    {allCourses
                      .filter((c) => !classDetails.courses?.some((ac) => ac.id === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedCourseToAssign || assigningCourse}
                    onClick={handleAssignCourse}
                    className="btn-primary text-xs py-1.5 px-3 shrink-0"
                  >
                    <Plus size={14} />
                    {assigningCourse ? 'Assigning...' : 'Assign'}
                  </button>
                </div>

                {/* Assigned Courses List */}
                <div className="mt-3 divide-y divide-line rounded border border-line max-h-64 overflow-y-auto">
                  {classDetails.courses?.length === 0 ? (
                    <div className="p-6 text-center text-xs text-ink-soft">
                      No courses assigned to this class yet. Select a course above to assign it.
                    </div>
                  ) : (
                    classDetails.courses?.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 hover:bg-paper/40 transition-colors">
                        <div>
                          <div className="text-xs font-semibold text-ink">
                            {c.code} — {c.name}
                          </div>
                          {c.department_name && (
                            <div className="text-[11px] text-ink-soft">
                              {c.department_name}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnassignCourse(c.id)}
                          className="p-1 text-ink-soft hover:text-pen"
                          title="Unassign Course"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          CREATE / EDIT CLASS MODAL
         ========================================================================= */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">
              {editingClass ? t('classes.editTitle', 'Edit Class') : t('classes.createTitle', 'Create New Class')}
            </h2>

            <form onSubmit={handleClassSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  {t('classes.name', 'Class Name')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Software Engineering L3, Cyber Security M1..."
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  {t('classes.academicYear', 'Academic Year')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2026/2027"
                  value={classForm.academicYear}
                  onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })}
                  className="input"
                  required
                />
              </div>

              {departments.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">
                    {t('classes.department', 'Department (Optional)')}
                  </label>
                  <select
                    value={classForm.departmentId}
                    onChange={(e) => setClassForm({ ...classForm, departmentId: e.target.value })}
                    className="input"
                  >
                    <option value="">{t('common.none', 'None / General')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="btn-quiet text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                >
                  {editingClass ? t('common.confirm') : t('classes.createClassBtn', 'Create Class')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          INVITE STUDENT MODAL
         ========================================================================= */}
      {showInviteModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">
              {t('classes.inviteTitle', 'Invite Student to')} {selectedClass.name}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Enter the student's email address or Student ID (matricule) to enroll them directly.
            </p>

            {inviteError && (
              <div className="mt-3">
                <Alert variant="danger">{inviteError}</Alert>
              </div>
            )}

            <form onSubmit={handleInviteStudent} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Student Email or Matricule
                </label>
                <input
                  type="text"
                  placeholder="e.g. student@exam.local or ST-2026-001"
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  className="input"
                  autoFocus
                  required
                />
              </div>

              <div className="rounded border border-dashed border-mark/40 bg-mark-tint/20 p-3 text-xs">
                <span className="font-bold text-mark block">Or share class invite code:</span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-ink">{selectedClass.invite_code}</span>
                  <button
                    type="button"
                    onClick={() => copyCode(selectedClass.invite_code)}
                    className="btn-quiet text-xs py-0.5 px-2"
                  >
                    {copiedCode === selectedClass.invite_code ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn-quiet text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteIdentifier.trim()}
                  className="btn-primary text-xs"
                >
                  {inviting ? t('common.loading') : t('classes.enrollBtn', 'Enroll Student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
