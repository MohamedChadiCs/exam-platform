import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Building, GraduationCap, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';
import { useConfirm } from '../lib/ConfirmContext';

export default function AdminAcademic() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [tab, setTab] = useState('departments'); // 'departments' | 'classes' | 'courses'
  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [deptForm, setDeptForm] = useState({ code: '', name: '' });
  const [classForm, setClassForm] = useState({ departmentId: '', name: '', academicYear: '2026/2027' });
  const [courseForm, setCourseForm] = useState({ departmentId: '', code: '', name: '' });
  const [showModal, setShowModal] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [dRes, clRes, coRes] = await Promise.all([
        api.get('/academic/departments'),
        api.get('/academic/classes'),
        api.get('/academic/courses'),
      ]);
      setDepartments(dRes);
      setClasses(clRes);
      setCourses(coRes);
      if (dRes.length > 0 && !classForm.departmentId) {
        setClassForm((f) => ({ ...f, departmentId: dRes[0].id }));
        setCourseForm((f) => ({ ...f, departmentId: dRes[0].id }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'departments') {
        await api.post('/academic/departments', deptForm);
        setDeptForm({ code: '', name: '' });
      } else if (tab === 'classes') {
        await api.post('/academic/classes', classForm);
        setClassForm((f) => ({ ...f, name: '' }));
      } else if (tab === 'courses') {
        await api.post('/academic/courses', courseForm);
        setCourseForm((f) => ({ ...f, code: '', name: '' }));
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(type, id) {
    const ok = await confirm({
      title: t('admin.archiveItemTitle', 'Archive Item'),
      message: t('common.confirmDelete', 'Are you sure you want to archive this item?'),
      confirmLabel: t('common.archive', 'Archive'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/academic/${type}/${id}`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('academic.title', 'Academic Management')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('academic.subtitle', 'Configure departments, classes, and course offerings.')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary self-start sm:self-auto">
          <Plus size={16} />
          <span>
            {tab === 'departments' && t('academic.addDept', 'Add Department')}
            {tab === 'classes' && t('academic.addClass', 'Add Class')}
            {tab === 'courses' && t('academic.addCourse', 'Add Course')}
          </span>
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-px">
        <button
          onClick={() => setTab('departments')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'departments' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <Building size={16} />
          <span>{t('academic.departments', 'Departments')}</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-soft font-mono">{departments.length}</span>
        </button>
        <button
          onClick={() => setTab('classes')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'classes' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <GraduationCap size={16} />
          <span>{t('academic.classes', 'Classes')}</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-soft font-mono">{classes.length}</span>
        </button>
        <button
          onClick={() => setTab('courses')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'courses' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <BookOpen size={16} />
          <span>{t('academic.courses', 'Courses')}</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-soft font-mono">{courses.length}</span>
        </button>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="card py-12 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : (
          <div className="table-container">
            {tab === 'departments' && (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm min-w-[36rem]">
                  <thead>
                    <tr>
                      <th className="table-header-cell">{t('academic.code', 'Code')}</th>
                      <th className="table-header-cell">{t('academic.name', 'Name')}</th>
                      <th className="table-header-cell text-end">{t('common.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {departments.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-12 text-center text-ink-soft">{t('academic.empty', 'No departments found.')}</td></tr>
                    ) : (
                      departments.map((d) => (
                        <tr key={d.id} className="table-row">
                          <td className="table-cell font-bold text-mark font-mono">{d.code}</td>
                          <td className="table-cell font-medium text-ink">{d.name}</td>
                          <td className="table-cell text-end">
                            <button onClick={() => handleDelete('departments', d.id)} className="btn-quiet btn-sm text-pen hover:bg-pen-tint/40" title="Archive">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'classes' && (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm min-w-[36rem]">
                  <thead>
                    <tr>
                      <th className="table-header-cell">{t('academic.class', 'Class Name')}</th>
                      <th className="table-header-cell">{t('academic.year', 'Academic Year')}</th>
                      <th className="table-header-cell text-end">{t('common.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {classes.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-12 text-center text-ink-soft">{t('academic.empty', 'No classes found.')}</td></tr>
                    ) : (
                      classes.map((c) => (
                        <tr key={c.id} className="table-row">
                          <td className="table-cell font-semibold text-ink">{c.name}</td>
                          <td className="table-cell text-ink-soft font-mono text-xs">{c.academic_year}</td>
                          <td className="table-cell text-end">
                            <button onClick={() => handleDelete('classes', c.id)} className="btn-quiet btn-sm text-pen hover:bg-pen-tint/40" title="Archive">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'courses' && (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm min-w-[38rem]">
                  <thead>
                    <tr>
                      <th className="table-header-cell">{t('academic.code', 'Course Code')}</th>
                      <th className="table-header-cell">{t('academic.name', 'Course Name')}</th>
                      <th className="table-header-cell">{t('academic.department', 'Department')}</th>
                      <th className="table-header-cell text-end">{t('common.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {courses.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-12 text-center text-ink-soft">{t('academic.empty', 'No courses found.')}</td></tr>
                    ) : (
                      courses.map((co) => (
                        <tr key={co.id} className="table-row">
                          <td className="table-cell font-bold text-mark font-mono">{co.code}</td>
                          <td className="table-cell font-medium text-ink">{co.name}</td>
                          <td className="table-cell text-xs text-ink-soft">{co.department_name}</td>
                          <td className="table-cell text-end">
                            <button onClick={() => handleDelete('courses', co.id)} className="btn-quiet btn-sm text-pen hover:bg-pen-tint/40" title="Archive">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 sm:p-7 shadow-2xl">
            <h2 className="text-lg font-bold tracking-tight text-ink">
              {tab === 'departments' && t('academic.addDept', 'Add Department')}
              {tab === 'classes' && t('academic.addClass', 'Add Class')}
              {tab === 'courses' && t('academic.addCourse', 'Add Course')}
            </h2>
            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              {tab === 'departments' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.code', 'Code')}</label>
                    <input
                      required
                      placeholder="e.g. CS"
                      value={deptForm.code}
                      onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                      className="input uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.name', 'Name')}</label>
                    <input
                      required
                      placeholder="e.g. Computer Science"
                      value={deptForm.name}
                      onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                      className="input"
                    />
                  </div>
                </>
              )}

              {tab === 'classes' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.department', 'Department')}</label>
                    <select
                      value={classForm.departmentId}
                      onChange={(e) => setClassForm({ ...classForm, departmentId: e.target.value })}
                      className="input"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.class', 'Class Name')}</label>
                    <input
                      required
                      placeholder="e.g. L3"
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.year', 'Academic Year')}</label>
                    <input
                      required
                      placeholder="2026/2027"
                      value={classForm.academicYear}
                      onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })}
                      className="input font-mono"
                    />
                  </div>
                </>
              )}

              {tab === 'courses' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.department', 'Department')}</label>
                    <select
                      value={courseForm.departmentId}
                      onChange={(e) => setCourseForm({ ...courseForm, departmentId: e.target.value })}
                      className="input"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.code', 'Course Code')}</label>
                    <input
                      required
                      placeholder="e.g. CS201"
                      value={courseForm.code}
                      onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                      className="input uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">{t('academic.name', 'Course Name')}</label>
                    <input
                      required
                      placeholder="e.g. Algorithms & Data Structures"
                      value={courseForm.name}
                      onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                      className="input"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-line">
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
    </div>
  );
}
