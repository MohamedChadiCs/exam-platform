import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, BookOpen, Plus, GraduationCap, Building, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/Alert';

export default function StudentClasses() {
  const { t } = useTranslation();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Join Class Modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  async function loadClasses() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/academic/student/classes');
      setClasses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  async function handleJoinSubmit(e) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await api.post('/academic/classes/join', {
        inviteCode: inviteCode.trim().toUpperCase(),
      });
      setInviteCode('');
      setShowJoinModal(false);
      setSuccessMsg(
        t('classes.joinSuccess', 'Enrolled successfully in {{className}}!', {
          className: res.class_name,
        })
      );
      loadClasses();
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t('classes.myClasses', 'My Classes')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t(
              'classes.myClassesSubtitle',
              'View your enrolled classes and the courses assigned to each class.'
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setJoinError('');
            setShowJoinModal(true);
          }}
          className="btn-primary inline-flex items-center gap-2 self-start shadow-sm"
        >
          <Plus size={16} />
          {t('classes.joinClass', 'Join Class')}
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

      {/* Classes List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-ink-soft">
          {t('common.loading', 'Loading enrolled classes...')}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-paper p-10 text-center">
          <GraduationCap size={40} className="mx-auto text-ink-faint" />
          <p className="mt-3 font-semibold text-ink">
            {t('classes.noEnrolledClasses', 'You have not joined any classes yet.')}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {t(
              'classes.noEnrolledHint',
              'Ask your professor for the class invite code (e.g. CLS-ABC123) and click "Join Class" above.'
            )}
          </p>
          <div className="mt-5">
            <button
              onClick={() => {
                setJoinError('');
                setShowJoinModal(true);
              }}
              className="btn-primary inline-flex items-center gap-2 text-xs"
            >
              <Plus size={14} />
              {t('classes.joinClass', 'Join Class')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {classes.map((cls) => {
            const courseList = cls.courses || [];
            return (
              <div
                key={cls.id}
                className="flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-ink">{cls.name}</h2>
                      <span className="mt-0.5 inline-block text-xs font-medium text-mark">
                        {cls.academic_year}
                      </span>
                    </div>
                    {cls.department_name && (
                      <span className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-xs text-ink-soft">
                        <Building size={12} className="text-ink-faint" />
                        {cls.department_name}
                      </span>
                    )}
                  </div>

                  {/* Teacher Info */}
                  {cls.owner_name && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-paper/60 p-2 text-xs text-ink">
                      <GraduationCap size={15} className="text-mark shrink-0" />
                      <div>
                        <span className="font-semibold">{cls.owner_name}</span>
                        {cls.owner_email && (
                          <span className="text-[11px] text-ink-soft block">
                            {cls.owner_email}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Assigned Courses Section */}
                  <div className="mt-4 border-t border-line/60 pt-3">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <BookOpen size={14} className="text-mark" />
                        {t('classes.assignedCourses', 'Assigned Courses')}
                      </span>
                      <span className="rounded-full bg-mark-tint px-2 py-0.5 text-[10px] font-bold text-mark">
                        {courseList.length}
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-2">
                      {courseList.length === 0 ? (
                        <p className="text-xs italic text-ink-faint">
                          {t('classes.noCourses', 'No courses assigned to this class yet.')}
                        </p>
                      ) : (
                        courseList.map((course) => (
                          <div
                            key={course.id}
                            className="flex items-center justify-between rounded-md border border-line/60 bg-paper/30 px-2.5 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-mark">
                                {course.code}
                              </span>
                              <span className="font-medium text-ink">{course.name}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-line/40 text-[11px] text-ink-faint flex items-center justify-between">
                  <span>
                    {t('classes.enrolledAt', 'Enrolled:')}{' '}
                    {cls.enrolled_at ? new Date(cls.enrolled_at).toLocaleDateString() : '—'}
                  </span>
                  <span className="font-mono text-[10px] text-ink-faint">
                    {cls.invite_code}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Join Class Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-ink">
              {t('classes.joinClass', 'Join a Class')}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {t(
                'classes.joinSubtitle',
                'Enter the 10-character class invite code provided by your teacher.'
              )}
            </p>

            {joinError && (
              <div className="mt-3">
                <Alert type="danger" message={joinError} />
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft">
                  {t('classes.inviteCode', 'Invite Code')}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. CLS-7X9B2K"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input mt-1 w-full font-mono text-center text-base uppercase tracking-widest"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="btn-quiet text-xs"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={joining || !inviteCode.trim()}
                  className="btn-primary text-xs"
                >
                  {joining
                    ? t('common.loading', 'Joining...')
                    : t('classes.joinClass', 'Join Class')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
