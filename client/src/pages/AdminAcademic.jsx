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
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('academic.title', 'Academic Management')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('academic.subtitle', 'Configure departments, classes, and course offerings.')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary self-start">
          <Plus size={16} />
          {tab === 'departments' && t('academic.addDept', 'Add Department')}
          {tab === 'classes' && t('academic.addClass', 'Add Class')}
          {tab === 'courses' && t('academic.addCourse', 'Add Course')}
        </button>
      </div>

      {error && <div className="mt-4"><Alert variant="danger">{error}</Alert></div>}

      {/* Tabs */}
      <div className="mt-6 flex border-b border-line">
        <button
          onClick={() => setTab('departments')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
            tab === 'departments' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <Building size={16} />
          {t('academic.departments', 'Departments')} ({departments.length})
        </button>
        <button
          onClick={() => setTab('classes')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
            tab === 'classes' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <GraduationCap size={16} />
          {t('academic.classes', 'Classes')} ({classes.length})
        </button>
        <button
          onClick={() => setTab('courses')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
            tab === 'courses' ? 'border-mark text-mark' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <BookOpen size={16} />
          {t('academic.courses', 'Courses')} ({courses.length})
        </button>
      </div>

      {/* Content */}
      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-ink-soft">{t('common.loading')}</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            {tab === 'departments' && (
              <table className="w-full text-start text-sm">
                <thead className="border-b border-line bg-paper text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.code', 'Code')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.name', 'Name')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {departments.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-faint">{t('academic.empty', 'No departments found.')}</td></tr>
                  ) : (
                    departments.map((d) => (
                      <tr key={d.id} className="hover:bg-paper/50">
                        <td className="px-4 py-3 font-medium text-mark">{d.code}</td>
                        <td className="px-4 py-3">{d.name}</td>
                        <td className="px-4 py-3 text-end">
                          <button onClick={() => handleDelete('departments', d.id)} className="text-pen hover:opacity-80 p-1" title="Archive">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {tab === 'classes' && (
              <table className="w-full text-start text-sm">
                <thead className="border-b border-line bg-paper text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.class', 'Class Name')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.year', 'Academic Year')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {classes.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-faint">{t('academic.empty', 'No classes found.')}</td></tr>
                  ) : (
                    classes.map((c) => (
                      <tr key={c.id} className="hover:bg-paper/50">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-ink-soft">{c.academic_year}</td>
                        <td className="px-4 py-3 text-end">
                          <button onClick={() => handleDelete('classes', c.id)} className="text-pen hover:opacity-80 p-1" title="Archive">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {tab === 'courses' && (
              <table className="w-full text-start text-sm">
                <thead className="border-b border-line bg-paper text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.code', 'Course Code')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.name', 'Course Name')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('academic.department', 'Department')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {courses.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-faint">{t('academic.empty', 'No courses found.')}</td></tr>
                  ) : (
                    courses.map((co) => (
                      <tr key={co.id} className="hover:bg-paper/50">
                        <td className="px-4 py-3 font-medium text-mark">{co.code}</td>
                        <td className="px-4 py-3">{co.name}</td>
                        <td className="px-4 py-3 text-ink-soft">{co.department_name}</td>
                        <td className="px-4 py-3 text-end">
                          <button onClick={() => handleDelete('courses', co.id)} className="text-pen hover:opacity-80 p-1" title="Archive">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {tab === 'departments' && t('academic.addDept', 'Add Department')}
              {tab === 'classes' && t('academic.addClass', 'Add Class')}
              {tab === 'courses' && t('academic.addCourse', 'Add Course')}
            </h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {tab === 'departments' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.code', 'Code')}</label>
                    <input
                      required
                      placeholder="e.g. CS"
                      value={deptForm.code}
                      onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                      className="input uppercase"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.name', 'Name')}</label>
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
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.department', 'Department')}</label>
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
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.class', 'Class Name')}</label>
                    <input
                      required
                      placeholder="e.g. L3"
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.year', 'Academic Year')}</label>
                    <input
                      required
                      placeholder="2026/2027"
                      value={classForm.academicYear}
                      onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })}
                      className="input"
                    />
                  </div>
                </>
              )}

              {tab === 'courses' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.department', 'Department')}</label>
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
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.code', 'Course Code')}</label>
                    <input
                      required
                      placeholder="e.g. CS201"
                      value={courseForm.code}
                      onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                      className="input uppercase"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">{t('academic.name', 'Course Name')}</label>
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
    </div>
  );
}
