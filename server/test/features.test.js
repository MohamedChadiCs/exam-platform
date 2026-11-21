import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { client, createAdmin, query, resetDb, startApp } from './helpers.js';

test.beforeEach(async () => {
  await resetDb();
  for (const code of ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'NUMERIC', 'SHORT_TEXT']) {
    await query(`INSERT INTO question_types (code) VALUES ($1) ON CONFLICT DO NOTHING`, [code]);
  }
});

async function createProfessor(email = 'prof@test.local', password = 'Prof-Password-123') {
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, role_id, status, first_name, last_name, email_verified_at)
     VALUES ($1, $2, 2, 'ACTIVE', 'Alan', 'Turing', now()) RETURNING id`,
    [email, hash]
  );
  await query(`INSERT INTO professors (user_id) VALUES ($1)`, [rows[0].id]);
  return { id: rows[0].id, email, password };
}

async function createStudent(email = 'student@test.local', password = 'Student-Password-123', classId = null) {
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, role_id, status, first_name, last_name, email_verified_at)
     VALUES ($1, $2, 3, 'ACTIVE', 'Ada', 'Lovelace', now()) RETURNING id`,
    [email, hash]
  );
  await query(`INSERT INTO students (user_id, matricule) VALUES ($1, $2)`, [rows[0].id, `ST-${Date.now()}`]);
  if (classId) {
    await query(`INSERT INTO class_students (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [classId, rows[0].id]);
  }
  return { id: rows[0].id, email, password };
}

test('Academic Management: Admin can CRUD departments, classes, courses', async () => {
  const app = await startApp();
  try {
    const admin = await createAdmin();
    const c = client(app.url);
    await c.login(admin.email, admin.password);

    // 1. Create department
    const deptRes = await c.post('/academic/departments', { code: 'MATH', name: 'Mathematics' });
    assert.equal(deptRes.status, 201);
    const deptId = deptRes.body.data.id;

    // 2. Create class
    const classRes = await c.post('/academic/classes', { departmentId: deptId, name: 'L1', academicYear: '2026/2027' });
    assert.equal(classRes.status, 201);
    const classId = classRes.body.data.id;

    // 3. Create course
    const courseRes = await c.post('/academic/courses', { departmentId: deptId, code: 'MATH101', name: 'Calculus I' });
    assert.equal(courseRes.status, 201);

    // 4. Verify public fetch
    const listRes = await c.get('/academic/departments');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((d) => d.code === 'MATH'));
  } finally {
    await app.close();
  }
});

test('Full Exam Cycle: Question Bank -> Exam -> Access Code -> Student Join & Submit -> Auto Grading', async () => {
  const app = await startApp();
  try {
    const admin = await createAdmin();
    const prof = await createProfessor();
    const student = await createStudent();

    // 1. Admin creates course
    const cAdmin = client(app.url);
    await cAdmin.login(admin.email, admin.password);
    const deptRes = await cAdmin.post('/academic/departments', { code: 'CS', name: 'Computer Science' });
    const courseRes = await cAdmin.post('/academic/courses', { departmentId: deptRes.body.data.id, code: 'CS101', name: 'Intro to CS' });
    const courseId = courseRes.body.data.id;

    // 2. Professor creates questions in question bank
    const cProf = client(app.url);
    await cProf.login(prof.email, prof.password);

    // Q1: Single choice MCQ (5 points)
    const q1Res = await cProf.post('/questions', {
      typeCode: 'MCQ_SINGLE',
      bodyMd: 'What is 2 + 2?',
      defaultPoints: 5,
      options: [
        { position: 0, bodyMd: '3', isCorrect: false },
        { position: 1, bodyMd: '4', isCorrect: true },
        { position: 2, bodyMd: '5', isCorrect: false },
      ],
    });
    assert.equal(q1Res.status, 201);
    const q1 = q1Res.body.data;
    const correctOptId = q1.options.find((o) => o.is_correct).id;

    // 3. Professor creates an Exam
    const opensAt = new Date(Date.now() - 60_000).toISOString();
    const closesAt = new Date(Date.now() + 3600_000).toISOString();
    const examRes = await cProf.post('/exams', {
      courseId,
      title: 'Midterm Exam',
      opensAt,
      closesAt,
      durationMinutes: 60,
      maxScore: 5,
      passingScore: 2.5,
      resultsPolicy: 'IMMEDIATE',
    });
    assert.equal(examRes.status, 201);
    const examId = examRes.body.data.id;

    // Assign question to exam
    const assignRes = await cProf.post(`/exams/${examId}/questions`, {
      questions: [{ questionVersionId: q1.id, position: 1, points: 5 }],
    });
    assert.equal(assignRes.status, 200);

    // Publish exam
    const pubRes = await cProf.post(`/exams/${examId}/publish`, {});
    assert.equal(pubRes.status, 200);

    // Generate access code
    const codeExpires = new Date(Date.now() + 86400_000).toISOString();
    const codeRes = await cProf.post(`/exams/${examId}/codes`, { expiresAt: codeExpires, maxUses: 10 });
    assert.equal(codeRes.status, 201);
    const accessCode = codeRes.body.data.code;
    assert.ok(accessCode && accessCode.length === 8);

    // 4. Student joins with access code
    const cStudent = client(app.url);
    await cStudent.login(student.email, student.password);

    const joinRes = await cStudent.post('/student/exams/join', { code: accessCode });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.body.data.enrolled, true);

    // Student lists enrolled exams
    const myExams = await cStudent.get('/student/exams');
    assert.equal(myExams.status, 200);
    assert.equal(myExams.body.data.length, 1);
    assert.equal(myExams.body.data[0].id, examId);

    // 5. Student starts exam session
    const startRes = await cStudent.post(`/student/exams/${examId}/start`, {});
    assert.equal(startRes.status, 201);
    const sessionId = startRes.body.data.sessionId;

    // Fetch active session questions (verify options do NOT leak correct answer)
    const sessionDetails = await cStudent.get(`/student/sessions/${sessionId}`);
    assert.equal(sessionDetails.status, 200);
    const qInSession = sessionDetails.body.data.questions[0];
    assert.equal(qInSession.options[0].is_correct, undefined);

    // 6. Autosave answer
    const saveRes = await cStudent.post(`/student/sessions/${sessionId}/save`, {
      questionVersionId: q1.id,
      answer: { selectedOptionId: correctOptId },
      seq: 1,
    });
    assert.equal(saveRes.status, 200);

    // Record integrity event
    const secEvent = await cStudent.post(`/student/sessions/${sessionId}/security-event`, {
      eventType: 'TAB_BLUR',
      severity: 'WARNING',
      details: { reason: 'User switched tab' },
    });
    assert.equal(secEvent.status, 200);

    // 7. Student submits exam
    const submitRes = await cStudent.post(`/student/sessions/${sessionId}/submit`, {});
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.data.score, 5);
    assert.equal(submitRes.body.data.passed, true);

    // 8. Professor checks submissions
    const subList = await cProf.get(`/exams/${examId}/submissions`);
    assert.equal(subList.status, 200);
    assert.equal(subList.body.data.length, 1);
    assert.equal(Number(subList.body.data[0].total_score), 5);
    assert.equal(subList.body.data[0].security_events_count, 1);
  } finally {
    await app.close();
  }
});

test('Category Hierarchy: Parent category filters all descendant questions recursively', async () => {
  const app = await startApp();
  try {
    const prof = await createProfessor('science.prof@test.local', 'Prof-Password-123');
    const c = client(app.url);
    await c.login(prof.email, prof.password);

    // 1. Create root category "Science"
    const cat1Res = await c.post('/questions/categories', { name: 'Science' });
    assert.equal(cat1Res.status, 201);
    const catScience = cat1Res.body.data;

    // 2. Create child category "Physics" under "Science"
    const cat2Res = await c.post('/questions/categories', { name: 'Physics', parentId: catScience.id });
    assert.equal(cat2Res.status, 201);
    const catPhysics = cat2Res.body.data;

    // 3. Create sub-child category "Astrophysics" under "Physics"
    const cat3Res = await c.post('/questions/categories', { name: 'Astrophysics', parentId: catPhysics.id });
    assert.equal(cat3Res.status, 201);
    const catAstro = cat3Res.body.data;

    // 4. Create separate unrelated category "Literature"
    const cat4Res = await c.post('/questions/categories', { name: 'Literature' });
    assert.equal(cat4Res.status, 201);
    const catLit = cat4Res.body.data;

    // 5. Verify category hierarchy endpoint returns path and depth
    const catList = await c.get('/questions/categories');
    assert.equal(catList.status, 200);
    const astroInList = catList.body.data.find((x) => x.id === catAstro.id);
    assert.ok(astroInList);
    assert.equal(astroInList.path, 'Science > Physics > Astrophysics');
    assert.equal(astroInList.depth, 2);

    // 6. Create questions in each category
    await c.post('/questions', {
      typeCode: 'SHORT_TEXT',
      bodyMd: 'What is the scientific method?',
      defaultPoints: 2,
      categoryId: catScience.id,
    });

    await c.post('/questions', {
      typeCode: 'SHORT_TEXT',
      bodyMd: 'State Newton second law.',
      defaultPoints: 3,
      categoryId: catPhysics.id,
    });

    await c.post('/questions', {
      typeCode: 'SHORT_TEXT',
      bodyMd: 'What is a black hole event horizon?',
      defaultPoints: 5,
      categoryId: catAstro.id,
    });

    await c.post('/questions', {
      typeCode: 'SHORT_TEXT',
      bodyMd: 'Who wrote Hamlet?',
      defaultPoints: 1,
      categoryId: catLit.id,
    });

    // 7. Filter by root "Science" -> should return 3 questions (Science + Physics + Astrophysics)
    const filterScience = await c.get(`/questions?categoryId=${catScience.id}`);
    assert.equal(filterScience.status, 200);
    assert.equal(filterScience.body.data.length, 3);
    assert.ok(filterScience.body.data.some((q) => q.body_md.includes('scientific method')));
    assert.ok(filterScience.body.data.some((q) => q.body_md.includes('Newton second law')));
    assert.ok(filterScience.body.data.some((q) => q.body_md.includes('event horizon')));
    assert.ok(!filterScience.body.data.some((q) => q.body_md.includes('Hamlet')));

    // 8. Filter by "Physics" -> should return 2 questions (Physics + Astrophysics)
    const filterPhysics = await c.get(`/questions?categoryId=${catPhysics.id}`);
    assert.equal(filterPhysics.status, 200);
    assert.equal(filterPhysics.body.data.length, 2);
    assert.ok(filterPhysics.body.data.some((q) => q.body_md.includes('Newton second law')));
    assert.ok(filterPhysics.body.data.some((q) => q.body_md.includes('event horizon')));

    // 9. Filter by leaf "Astrophysics" -> should return 1 question
    const filterAstro = await c.get(`/questions?categoryId=${catAstro.id}`);
    assert.equal(filterAstro.status, 200);
    assert.equal(filterAstro.body.data.length, 1);
    assert.ok(filterAstro.body.data[0].body_md.includes('event horizon'));

    // 10. Filter by "Literature" -> should return 1 question
    const filterLit = await c.get(`/questions?categoryId=${catLit.id}`);
    assert.equal(filterLit.status, 200);
    assert.equal(filterLit.body.data.length, 1);
    assert.ok(filterLit.body.data[0].body_md.includes('Hamlet'));
  } finally {
    await app.close();
  }
});

test('Teacher Class & Course Management: Create class, invite students, create course and assign to class', async () => {
  const app = await startApp();
  try {
    const prof = await createProfessor('teacher.class@test.local', 'Teacher-Pass-123');
    const student1 = await createStudent('alice@test.local', 'Alice-Pass-123');
    const student2 = await createStudent('bob@test.local', 'Bob-Pass-123');

    const cProf = client(app.url);
    await cProf.login(prof.email, prof.password);

    // 1. Teacher creates their own class
    const createClassRes = await cProf.post('/academic/classes', {
      name: 'Software Engineering A',
      academicYear: '2026/2027',
    });
    assert.equal(createClassRes.status, 201);
    const cls = createClassRes.body.data;
    assert.ok(cls.invite_code.startsWith('CLS-'));
    assert.equal(cls.teacher_id, prof.id);

    // 2. Teacher creates a course and assigns it to the class
    const createCourseRes = await cProf.post('/academic/courses', {
      code: 'SE301',
      name: 'Software Architecture',
      classIds: [cls.id],
    });
    assert.equal(createCourseRes.status, 201);
    const course = createCourseRes.body.data;

    // 3. Teacher invites student 1 by email directly
    const inviteRes = await cProf.post(`/academic/classes/${cls.id}/invite`, {
      identifier: student1.email,
    });
    assert.equal(inviteRes.status, 201);
    assert.equal(inviteRes.body.data.email, student1.email);

    // 4. Student 2 joins the class using the class invite code
    const cStudent2 = client(app.url);
    await cStudent2.login(student2.email, student2.password);
    const joinRes = await cStudent2.post('/academic/classes/join', {
      inviteCode: cls.invite_code,
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.body.data.id, cls.id);

    // 5. Teacher checks class details -> both students and the course are listed
    const classDetails = await cProf.get(`/academic/classes/${cls.id}`);
    assert.equal(classDetails.status, 200);
    assert.equal(classDetails.body.data.students.length, 2);
    assert.ok(classDetails.body.data.students.some((s) => s.email === student1.email));
    assert.ok(classDetails.body.data.students.some((s) => s.email === student2.email));
    assert.equal(classDetails.body.data.courses.length, 1);
    assert.equal(classDetails.body.data.courses[0].id, course.id);

    // 6. Student 2 checks their enrolled classes
    const studentClasses = await cStudent2.get('/academic/student/classes');
    assert.equal(studentClasses.status, 200);
    assert.equal(studentClasses.body.data.length, 1);
    assert.equal(studentClasses.body.data[0].id, cls.id);
    assert.equal(studentClasses.body.data[0].courses.length, 1);
    assert.equal(studentClasses.body.data[0].courses[0].code, 'SE301');

    // 7. Archive & Restore class, then filter by status
    const archiveClassRes = await cProf.post(`/academic/classes/${cls.id}/archive`);
    assert.equal(archiveClassRes.status, 200);

    const activeClasses = await cProf.get('/academic/classes?mine=true&status=active');
    assert.equal(activeClasses.body.data.length, 0);

    const archivedClasses = await cProf.get('/academic/classes?mine=true&status=archived');
    assert.equal(archivedClasses.body.data.length, 1);
    assert.equal(archivedClasses.body.data[0].id, cls.id);

    const restoreClassRes = await cProf.post(`/academic/classes/${cls.id}/restore`);
    assert.equal(restoreClassRes.status, 200);
    const restoredActive = await cProf.get('/academic/classes?mine=true&status=active');
    assert.equal(restoredActive.body.data.length, 1);

    // 8. Deactivate & Activate course, then filter by status
    const deactCourseRes = await cProf.post(`/academic/courses/${course.id}/deactivate`);
    assert.equal(deactCourseRes.status, 200);

    const activeCourses = await cProf.get('/academic/courses?status=active');
    assert.equal(activeCourses.body.data.filter((c) => c.id === course.id).length, 0);

    const inactiveCourses = await cProf.get('/academic/courses?status=inactive');
    assert.equal(inactiveCourses.body.data.filter((c) => c.id === course.id).length, 1);

    const actCourseRes = await cProf.post(`/academic/courses/${course.id}/activate`);
    assert.equal(actCourseRes.status, 200);
    const restoredCourse = await cProf.get('/academic/courses?status=active');
    assert.equal(restoredCourse.body.data.filter((c) => c.id === course.id).length, 1);
  } finally {
    await app.close();
  }
});
