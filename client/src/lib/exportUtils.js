import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function sanitizeFilename(name, fallback = 'export') {
  const cleaned = String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function ensureExtension(filename, ext) {
  const base = sanitizeFilename(filename);
  const suffix = `.${ext}`;
  return base.toLowerCase().endsWith(suffix) ? base : `${base}${suffix}`;
}

function getIntegrityLabel(s) {
  if (s.fullscreen_exits_count > 0) return 'Fullscreen Exit (Auto-Submitted)';
  if (s.security_events_count > 0) return `${s.security_events_count} events`;
  return 'Clean';
}

function getResultLabel(s) {
  if (s.passed === true) return 'Passed';
  if (s.passed === false) return 'Failed';
  return 'In Progress';
}

function computeGradeStats(submissions) {
  const graded = submissions.filter((s) => s.total_score !== null && s.total_score !== undefined);
  const passedCount = submissions.filter((s) => s.passed === true).length;
  const failedCount = submissions.filter((s) => s.passed === false).length;
  const avgScore = graded.length
    ? (graded.reduce((sum, s) => sum + Number(s.total_score), 0) / graded.length).toFixed(2)
    : '0.00';
  const avgPct = graded.length
    ? (graded.reduce((sum, s) => sum + Number(s.percentage ?? 0), 0) / graded.length).toFixed(1)
    : '0.0';
  return { total: submissions.length, gradedCount: graded.length, passedCount, failedCount, avgScore, avgPct };
}

export function exportGradesToExcel(exam, submissions, { filename, variant = 'detailed' } = {}) {
  const isShort = variant === 'short';

  const rows = isShort
    ? submissions.map((s) => ({
        Matricule: s.matricule || '',
        'First Name': s.first_name || '',
        'Last Name': s.last_name || '',
        Note: s.total_score !== null && s.total_score !== undefined ? Number(s.total_score) : '',
        Status: getResultLabel(s),
      }))
    : submissions.map((s, idx) => ({
        '#': idx + 1,
        Matricule: s.matricule || '',
        'Last Name': s.last_name || '',
        'First Name': s.first_name || '',
        Email: s.email || '',
        Attempt: s.attempt_no ?? 1,
        Score: s.total_score !== null && s.total_score !== undefined ? Number(s.total_score) : '',
        'Max Score': exam?.max_score !== undefined ? Number(exam.max_score) : '',
        'Percentage (%)': s.percentage !== null && s.percentage !== undefined ? Number(s.percentage) : '',
        Result: getResultLabel(s),
        Integrity: getIntegrityLabel(s),
        'Submitted At': s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '',
      }));

  const wb = XLSX.utils.book_new();
  const gradesSheet = XLSX.utils.json_to_sheet(rows);
  gradesSheet['!cols'] = isShort
    ? [
        { wch: 16 }, // Matricule
        { wch: 18 }, // First Name
        { wch: 18 }, // Last Name
        { wch: 10 }, // Note
        { wch: 14 }, // Status
      ]
    : [
        { wch: 5 },  // #
        { wch: 14 }, // Matricule
        { wch: 16 }, // Last Name
        { wch: 16 }, // First Name
        { wch: 26 }, // Email
        { wch: 9 },  // Attempt
        { wch: 10 }, // Score
        { wch: 11 }, // Max Score
        { wch: 15 }, // Percentage
        { wch: 13 }, // Result
        { wch: 30 }, // Integrity
        { wch: 22 }, // Submitted At
      ];
  XLSX.utils.book_append_sheet(wb, gradesSheet, 'Grades');

  if (!isShort) {
    const stats = computeGradeStats(submissions);
    const infoRows = [
      { Field: 'Exam Title', Value: exam?.title || '' },
      { Field: 'Course', Value: exam?.course_code ? `${exam.course_code} - ${exam.course_name || ''}` : '' },
      { Field: 'Max Score', Value: exam?.max_score ?? '' },
      { Field: 'Passing Score', Value: exam?.passing_score ?? '' },
      { Field: 'Total Submissions', Value: stats.total },
      { Field: 'Passed', Value: stats.passedCount },
      { Field: 'Failed', Value: stats.failedCount },
      { Field: 'Average Score', Value: `${stats.avgScore} (${stats.avgPct}%)` },
      { Field: 'Exported At', Value: new Date().toLocaleString() },
    ];
    const infoSheet = XLSX.utils.json_to_sheet(infoRows);
    infoSheet['!cols'] = [{ wch: 20 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, infoSheet, 'Summary');
  }

  const defaultName = `${sanitizeFilename(exam?.title || 'exam')}_grades_${variant}`;
  XLSX.writeFile(wb, ensureExtension(filename || defaultName, 'xlsx'));
}

export function exportGradesToPdf(exam, submissions, { filename, variant = 'detailed' } = {}) {
  const isShort = variant === 'short';
  const doc = new jsPDF({ orientation: isShort ? 'portrait' : 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const stats = computeGradeStats(submissions);

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${exam?.title || 'Grade List'}${isShort ? ' (Short)' : ''}`, 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const courseLine = exam?.course_code
    ? `${exam.course_code} — ${exam.course_name || ''}`
    : 'Examination Grade Sheet';
  doc.text(courseLine, 40, 60);

  doc.setFontSize(9);
  if (isShort) {
    doc.text(
      `Max Score: ${exam?.max_score ?? '—'} pts   |   Passing: ${exam?.passing_score ?? '—'} pts   |   Total: ${stats.total}`,
      40,
      76
    );
  } else {
    doc.text(
      `Max Score: ${exam?.max_score ?? '—'} pts   |   Passing Score: ${exam?.passing_score ?? '—'} pts   |   Total: ${stats.total}   |   Passed: ${stats.passedCount}   |   Failed: ${stats.failedCount}   |   Average: ${stats.avgScore} pts (${stats.avgPct}%)`,
      40,
      76
    );
  }
  doc.text(`Exported: ${new Date().toLocaleDateString()}`, pageWidth - 40, 42, { align: 'right' });

  const head = isShort
    ? [['Matricule', 'First Name', 'Last Name', 'Note', 'Status']]
    : [['#', 'Matricule', 'Student', 'Email', 'Score', '%', 'Result', 'Integrity']];

  const body = isShort
    ? submissions.map((s) => [
        s.matricule || '—',
        s.first_name || '—',
        s.last_name || '—',
        s.total_score !== null && s.total_score !== undefined ? `${s.total_score} / ${exam?.max_score ?? ''}` : '—',
        getResultLabel(s),
      ])
    : submissions.map((s, idx) => [
        String(idx + 1),
        s.matricule || '—',
        `${s.first_name || ''} ${s.last_name || ''}`.trim() || '—',
        s.email || '—',
        s.total_score !== null && s.total_score !== undefined ? `${s.total_score} / ${exam?.max_score ?? ''}` : '—',
        s.percentage !== null && s.percentage !== undefined ? `${s.percentage}%` : '—',
        getResultLabel(s),
        getIntegrityLabel(s),
      ]);

  const statusColIndex = isShort ? 4 : 6;

  autoTable(doc, {
    startY: 92,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: isShort ? 9.5 : 8.5, cellPadding: isShort ? 6 : 5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: isShort
      ? {
          0: { cellWidth: 95 },
          3: { halign: 'center', cellWidth: 75 },
          4: { halign: 'center', cellWidth: 80 },
        }
      : {
          0: { cellWidth: 28, halign: 'center' },
          1: { cellWidth: 80 },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
        },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === statusColIndex) {
        if (data.cell.raw === 'Passed') {
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'Failed') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (!isShort && data.section === 'body' && data.column.index === 7 && String(data.cell.raw).includes('Fullscreen')) {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    );
  }

  const defaultName = `${sanitizeFilename(exam?.title || 'exam')}_grades_${variant}`;
  doc.save(ensureExtension(filename || defaultName, 'pdf'));
}

// ==========================================
// Professional Academic Exam Paper PDF Export
// 3-Part Architecture:
// Part 1: Official Academic Cover Page
// Part 2: Question Paper (Sujet d'examen)
// Part 3: Candidate Answer Booklet (Feuilles de réponses)
// ==========================================

const PDF_TRANSLATIONS = {
  fr: {
    institution: "ÉTABLISSEMENT D'ENSEIGNEMENT SUPÉRIEUR",
    departmentDefault: "DÉPARTEMENT DES ÉTUDES ACADÉMIQUES",
    coursePrefix: "COURS / MODULE",
    academicYear: "Année Universitaire 2026 / 2027",
    duration: "Durée",
    minutes: "min",
    totalScore: "Barème total",
    passingScore: "Note de passage",
    questionCount: "Nb. de questions",
    points: "pts",
    point: "pt",
    studentInfoTitle: "CADRE RÉSERVÉ AU CANDIDAT",
    studentName: "Nom et Prénom :",
    matricule: "N° Matricule :",
    filiere: "Filière / Classe :",
    groupOrRoom: "Groupe / Salle :",
    placeNo: "Place N° :",
    signatureLabel: "Signature du candidat :",
    gradingGridTitle: "GRILLE D'ÉVALUATION ET DE NOTATION (RÉSERVÉE AUX EXAMINATEURS)",
    colExercise: "Exercice",
    colBareme: "Barème",
    colGrade: "Note attribuée",
    colNotes: "Observations",
    totalLabel: "TOTAL GÉNÉRAL",
    markerSignature: "Visa du correcteur :",
    instructionsTitle: "CONSIGNES IMPORTANTES AUX CANDIDATS",
    defaultInstructions: [
      "1. Vérifiez que votre sujet comporte l'ensemble des pages avant de commencer.",
      "2. Aucun document, téléphone portable ou appareil électronique n'est autorisé.",
      "3. Écrivez lisiblement à l'encre bleue ou noire. L'usage du correcteur blanc est déconseillé.",
      "4. Répondez exclusivement dans les espaces réservés sur la FEUILLE DE RÉPONSES.",
      "5. La clarté, la rigueur et la précision de la rédaction sont prises en compte.",
    ],
    startExamNotice: "Tournez la page pour découvrir les sujets d'examen ➔",
    questionPaperTitle: "SUJET D'EXAMEN — ÉNONCÉS DES QUESTIONS",
    questionPaperSubtitle: "Lisez attentivement l'intégralité du sujet. Reportez toutes vos réponses sur le cahier de réponses.",
    seeAnswerSheetNotice: "➔ Rédigez votre réponse sur la FEUILLE DE RÉPONSES à la fin du document.",
    checkAnswer: "Cochez la bonne réponse :",
    blankLabel: "Trou",
    answerBookletTitle: "FEUILLE DE RÉPONSES / CAHIER DE RÉDACTION",
    answerBookletSubtitle: "Rédigez soigneusement vos réponses dans les cadres prévus pour chaque exercice.",
    candidateReminder: "Rappel Candidat — Nom : ________________________   Matricule : ______________   Salle : ______",
    exercise: "Exercice",
    question: "Question",
    answerLabel: "Réponse finale :",
    workSpaceLabel: "Espace de rédaction / Calculs :",
    codeLabel: "Solution en code source :",
    codeInstructions: "Rédigez votre code lisiblement en respectant l'indentation :",
    matchingPrompt: "Associez chaque élément de gauche à sa correspondance :",
    orderingPrompt: "Indiquez l'ordre chronologique ou logique (1, 2, 3...) :",
    blankPrompt: "Complétez les éléments manquants :",
    maxWords: "Max",
    words: "mots",
    attachmentAudio: "Document Audio",
    attachmentVideo: "Document Vidéo",
    attachmentMedia: "Pièce jointe",
    page: "Page",
    of: "sur",
    confidential: "Épreuve d'examen officielle — Ne pas détacher",
    types: {
      MCQ_SINGLE: "Choix unique (QCM)",
      MCQ_MULTI: "Choix multiple (QCM)",
      TRUE_FALSE: "Vrai / Faux",
      NUMERIC: "Calcul numérique",
      SHORT_TEXT: "Réponse courte",
      LONG_TEXT: "Réponse développée",
      ESSAY: "Dissertation / Essai",
      MATCHING: "Association",
      ORDERING: "Ordonnancement",
      FILL_BLANK: "Texte à trous",
      CODE: "Programmation",
    },
  },
  en: {
    institution: "INSTITUTION OF HIGHER EDUCATION",
    departmentDefault: "DEPARTMENT OF ACADEMIC STUDIES",
    coursePrefix: "COURSE / MODULE",
    academicYear: "Academic Year 2026 / 2027",
    duration: "Duration",
    minutes: "min",
    totalScore: "Total Score",
    passingScore: "Pass Score",
    questionCount: "No. of Questions",
    points: "pts",
    point: "pt",
    studentInfoTitle: "CANDIDATE IDENTIFICATION BOX",
    studentName: "Full Name:",
    matricule: "Student ID:",
    filiere: "Degree / Class:",
    groupOrRoom: "Group / Room:",
    placeNo: "Seat No.:",
    signatureLabel: "Candidate's Signature:",
    gradingGridTitle: "EVALUATION & GRADING GRID (FOR EXAMINERS ONLY)",
    colExercise: "Exercise",
    colBareme: "Max",
    colGrade: "Awarded",
    colNotes: "Notes",
    totalLabel: "OVERALL TOTAL",
    markerSignature: "Examiner's Signature:",
    instructionsTitle: "IMPORTANT INSTRUCTIONS TO CANDIDATES",
    defaultInstructions: [
      "1. Ensure you have received a complete examination paper before you start.",
      "2. No unauthorised documents, mobile phones, or smart devices are allowed.",
      "3. Write legibly in blue or black ink. Pencil is only permitted for drawings/graphs.",
      "4. Record all your answers strictly in the designated spaces in the ANSWER BOOKLET.",
      "5. Clarity, structure, and precision of presentation will be awarded credit.",
    ],
    startExamNotice: "Turn the page to read the examination questions ➔",
    questionPaperTitle: "QUESTION PAPER — EXAM QUESTIONS",
    questionPaperSubtitle: "Read each question carefully. Write all answers on the provided Answer Sheet.",
    seeAnswerSheetNotice: "➔ Record your solution on the ANSWER SHEET at the end of the paper.",
    checkAnswer: "Select the correct answer:",
    blankLabel: "Blank",
    answerBookletTitle: "CANDIDATE ANSWER BOOKLET / ANSWER SHEET",
    answerBookletSubtitle: "Write your answers clearly in the designated spaces provided for each exercise.",
    candidateReminder: "Candidate Reminder — Name: ________________________   ID: ______________   Room: ______",
    exercise: "Exercise",
    question: "Question",
    answerLabel: "Final Answer:",
    workSpaceLabel: "Written Response / Working Space:",
    codeLabel: "Source Code Solution:",
    codeInstructions: "Write your code cleanly maintaining correct indentation:",
    matchingPrompt: "Match each item on the left with its partner on the right:",
    orderingPrompt: "Order the items sequentially (1, 2, 3...):",
    blankPrompt: "Fill in the blank fields:",
    maxWords: "Max",
    words: "words",
    attachmentAudio: "Audio Document",
    attachmentVideo: "Video Document",
    attachmentMedia: "Attachment",
    page: "Page",
    of: "of",
    confidential: "Official Examination Paper — Do not detach",
    types: {
      MCQ_SINGLE: "Single Choice (MCQ)",
      MCQ_MULTI: "Multiple Choice",
      TRUE_FALSE: "True / False",
      NUMERIC: "Numeric Calculation",
      SHORT_TEXT: "Short Answer",
      LONG_TEXT: "Detailed Answer",
      ESSAY: "Essay / Discussion",
      MATCHING: "Matching Pairs",
      ORDERING: "Ordering",
      FILL_BLANK: "Fill in the Blanks",
      CODE: "Programming",
    },
  },
  ar: {
    institution: "المؤسسة الجامعية للتعليم العالي",
    departmentDefault: "قسم الدراسات الأكاديمية",
    coursePrefix: "المقياس / المادة",
    academicYear: "السنة الجامعية 2026 / 2027",
    duration: "المدة",
    minutes: "د",
    totalScore: "المجموع",
    passingScore: "علامة النجاح",
    questionCount: "عدد الأسئلة",
    points: "نقاط",
    point: "نقطة",
    studentInfoTitle: "معلومات المترشح",
    studentName: "اللقب والاسم :",
    matricule: "رقم التسجيل :",
    filiere: "الشعبة / القسم :",
    groupOrRoom: "الفوج / القاعة :",
    placeNo: "رقم المقعد :",
    signatureLabel: "توقيع الطالب :",
    gradingGridTitle: "جدول التنقيط والتقييم (خاص بالأستاذ المصحح)",
    colExercise: "التمرين",
    colBareme: "النقطة",
    colGrade: "العلامة",
    colNotes: "ملاحظات",
    totalLabel: "المجموع الكلي",
    markerSignature: "تأشيرة المصحح :",
    instructionsTitle: "تعليمات هامة للمترشحين",
    defaultInstructions: [
      "1. تأكد من وضوح واكتمال صفحات ورقة الامتحان قبل الشروع في الإجابة.",
      "2. يمنع منعا باتا استخدام الهاتف النقال أو أي وثائق غير مرخص بها.",
      "3. اكتب بخط واضح ومقروء بالحبر الأزرق أو الأسود.",
      "4. اكتب الإجابات حصرا في المساحات المخصصة على ورقة الإجابة المرفقة.",
    ],
    startExamNotice: "اقلب الصفحة لبدء موضوع الامتحان ➔",
    questionPaperTitle: "موضوع الامتحان — نص الأسئلة",
    questionPaperSubtitle: "اقرأ التمارين بتمعن. دون جميع إجاباتك على ورقة الإجابة المخصصة.",
    seeAnswerSheetNotice: "➔ دون إجابتك على ورقة الإجابة المخصصة في نهاية الملف.",
    checkAnswer: "اختر الإجابة المناسبة :",
    blankLabel: "الفراغ",
    answerBookletTitle: "ورقة الإجابة والتحرير",
    answerBookletSubtitle: "اكتب إجاباتك في الإطار المخصص لكل تمرين بعناية.",
    candidateReminder: "تذكير المترشح — الاسم: ________________________   التسجيل: ______________   القاعة: ______",
    exercise: "تمرين",
    question: "سؤال",
    answerLabel: "الإجابة النهائية :",
    workSpaceLabel: "مساحة التحرير والحساب :",
    codeLabel: "كتابة الشيفرة البرمجية :",
    codeInstructions: "اكتب الكود البرمجي بوضوح ودقة :",
    matchingPrompt: "اربط كل عنصر بما يناسبه :",
    orderingPrompt: "رتب العناصر بالتسلسل (1، 2، 3...) :",
    blankPrompt: "املأ الفراغات بالكلمات المناسبة :",
    maxWords: "الحد الأقصى",
    words: "كلمة",
    attachmentAudio: "ملف صوتي",
    attachmentVideo: "ملف فيديو",
    attachmentMedia: "مرفق",
    page: "صفحة",
    of: "من",
    confidential: "وثيقة امتحان رسمية",
    types: {
      MCQ_SINGLE: "اختيار من متعدد (إجابة واحدة)",
      MCQ_MULTI: "اختيارات متعددة",
      TRUE_FALSE: "صحيح / خطأ",
      NUMERIC: "حساب عددي",
      SHORT_TEXT: "إجابة قصيرة",
      LONG_TEXT: "إجابة مطولة",
      ESSAY: "مقال / تحرير",
      MATCHING: "مطابقة وربط",
      ORDERING: "ترتيب تسلسلي",
      FILL_BLANK: "ملء الفراغات",
      CODE: "برمجة",
    },
  },
};

function drawRuledDottedLines(doc, x1, x2, startY, count, spacing = 20) {
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.65);
  doc.setLineDashPattern([2, 2.5], 0);
  let curY = startY;
  for (let i = 0; i < count; i++) {
    curY += spacing;
    doc.line(x1, curY, x2, curY);
  }
  doc.setLineDashPattern([], 0);
  return curY;
}

export function exportExamPaperToPdf(examData, selectedCourse = null, { filename } = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;
  const bottomThreshold = pageHeight - 44;
  let y = margin;

  // Language & Translation
  const rawLocale = (examData.locale || 'fr').toLowerCase();
  const locale = PDF_TRANSLATIONS[rawLocale] ? rawLocale : 'fr';
  const tr = PDF_TRANSLATIONS[locale];

  const title = (examData.title || 'EXAMEN').trim();
  const courseCode = (examData.course_code || selectedCourse?.code || '').trim();
  const courseName = (examData.course_name || selectedCourse?.name || '').trim();
  const departmentName = (examData.department_name || selectedCourse?.department_name || tr.departmentDefault).trim();
  const durationMinutes = examData.duration_minutes ?? examData.durationMinutes ?? 60;
  const passingScore = examData.passing_score ?? examData.passingScore ?? 10;
  const descriptionMd = (examData.description_md ?? examData.descriptionMd ?? '').trim();
  const rawQuestions = examData.questions || [];
  const totalPoints = rawQuestions.reduce((s, q) => s + (Number(q.points) || 0), 0) || examData.max_score || examData.maxScore || 20;

  let currentSectionTitle = '';

  function ensureSpace(needed, sectionName = currentSectionTitle) {
    if (y + needed > bottomThreshold) {
      doc.addPage();
      y = margin + 14;
      drawRunningHeader(sectionName);
    }
  }

  function drawRunningHeader(sectionName) {
    if (doc.internal.getNumberOfPages() > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      const leftHeader = courseCode ? `${courseCode} — ${title}` : title;
      doc.text(leftHeader, margin, margin - 4);
      if (sectionName) {
        doc.setFont('helvetica', 'bold');
        doc.text(sectionName.toUpperCase(), pageWidth - margin, margin - 4, { align: 'right' });
      }
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.65);
      doc.line(margin, margin + 2, pageWidth - margin, margin + 2);
    }
  }

  // ==========================================
  // PART 1: OFFICIAL ACADEMIC COVER PAGE (PAGE 1)
  // ==========================================
  currentSectionTitle = 'PAGE DE GARDE';

  // Decorative border around Cover Page
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.roundedRect(margin - 8, margin - 8, contentWidth + 16, pageHeight - (margin * 2) + 2, 6, 6, 'S');

  // Institution Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(tr.institution, pageWidth / 2, y + 8, { align: 'center' });
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(departmentName.toUpperCase(), pageWidth / 2, y + 6, { align: 'center' });
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(tr.academicYear, pageWidth / 2, y + 4, { align: 'center' });
  y += 16;

  // Course Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin + 20, y, contentWidth - 40, 26, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  const courseStr = `${tr.coursePrefix} : ${courseCode ? `${courseCode} — ` : ''}${courseName}`.toUpperCase();
  doc.text(courseStr, pageWidth / 2, y + 17, { align: 'center' });
  y += 38;

  // Examination Title
  doc.setFont('times', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title.toUpperCase(), contentWidth - 30);
  doc.text(titleLines, pageWidth / 2, y + 10, { align: 'center' });
  y += titleLines.length * 22 + 10;

  // Key Parameters Strip
  const stripW = contentWidth - 20;
  const stripX = margin + 10;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(stripX, y, stripW, 30, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const metaText = `${tr.duration} : ${durationMinutes} ${tr.minutes}    |    ${tr.totalScore} : ${totalPoints} ${tr.points}    |    ${tr.passingScore} : ${passingScore} ${tr.points}    |    ${tr.questionCount} : ${rawQuestions.length}`;
  doc.text(metaText, pageWidth / 2, y + 19, { align: 'center' });
  y += 42;

  // Candidate Identification Box
  const idBoxH = 76;
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(250, 252, 255);
  doc.roundedRect(margin + 10, y, stripW, idBoxH, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(79, 70, 229);
  doc.text(tr.studentInfoTitle, margin + 20, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  // Line 1: Nom & Prenom
  doc.text(tr.studentName, margin + 20, y + 32);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(margin + 85, y + 33, margin + 440, y + 33);

  // Line 2: Matricule, Filiere
  doc.text(tr.matricule, margin + 20, y + 50);
  doc.line(margin + 78, y + 51, margin + 210, y + 51);
  doc.text(tr.filiere, margin + 225, y + 50);
  doc.line(margin + 295, y + 51, margin + 440, y + 51);

  // Line 3: Salle, Signature
  doc.text(tr.groupOrRoom, margin + 20, y + 68);
  doc.line(margin + 85, y + 69, margin + 210, y + 69);
  doc.text(tr.signatureLabel, margin + 225, y + 68);
  doc.line(margin + 310, y + 69, margin + 440, y + 69);

  y += idBoxH + 16;

  // Evaluation & Grading Table (For Examiners)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(tr.gradingGridTitle, margin + 10, y);
  y += 6;

  const gradingBody = rawQuestions.map((q, idx) => [
    `${tr.exercise} ${idx + 1}${q.title ? ` : ${q.title}` : ''}`,
    `${q.points || 1} ${tr.points}`,
    '',
    '',
  ]);
  gradingBody.push([
    tr.totalLabel,
    `${totalPoints} ${tr.points}`,
    `     / ${totalPoints}`,
    tr.markerSignature,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin + 10, right: margin + 10 },
    head: [[tr.colExercise, tr.colBareme, tr.colGrade, tr.colNotes]],
    body: gradingBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 190 },
      1: { cellWidth: 65, halign: 'center' },
      2: { cellWidth: 95, halign: 'center' },
      3: { halign: 'left' },
    },
  });

  y = doc.lastAutoTable.finalY + 14;

  // Instructions to Candidates Box
  const rawInstructions = descriptionMd ? [descriptionMd] : tr.defaultInstructions;
  const instrText = rawInstructions.join('\n');
  const instrLines = doc.splitTextToSize(instrText, stripW - 24);

  // Dynamically size instructions box so it never collides with startExamNotice
  const maxInstrY = pageHeight - margin - 22;
  const availInstrH = maxInstrY - y;
  const instrH = Math.max(34, Math.min(instrLines.length * 11 + 20, Math.min(availInstrH, 80)));

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(stripX, y, stripW, instrH, 3, 3, 'FD');
  doc.setFillColor(79, 70, 229);
  doc.rect(stripX, y, 3, instrH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(79, 70, 229);
  doc.text(tr.instructionsTitle, stripX + 12, y + 12);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const maxVisibleLines = Math.floor((instrH - 18) / 11);
  doc.text(instrLines.slice(0, maxVisibleLines), stripX + 12, y + 23);

  // Bottom Notice on Page 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(79, 70, 229);
  doc.text(tr.startExamNotice, pageWidth / 2, pageHeight - margin - 8, { align: 'center' });

  // ==========================================
  // PART 2: QUESTION PAPER (SUJET D'EXAMEN)
  // ==========================================
  currentSectionTitle = tr.questionPaperTitle;
  doc.addPage();
  y = margin + 14;
  drawRunningHeader(tr.questionPaperTitle);

  // Section Banner: Sujet d'Examen
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(tr.questionPaperTitle, pageWidth / 2, y + 17, { align: 'center' });
  y += 34;

  // Single Important Notice before all exercises (Mentioned once here)
  const noticeH = 24;
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.setFillColor(245, 247, 255); // indigo-50
  doc.roundedRect(margin, y, contentWidth, noticeH, 3, 3, 'FD');
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(margin, y, 3.5, noticeH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(67, 56, 202); // indigo-700
  doc.text(tr.seeAnswerSheetNotice, margin + 12, y + 15);
  y += noticeH + 16;

  rawQuestions.forEach((q, idx) => {
    const typeCode = q.typeCode || q.type_code || 'MCQ_SINGLE';
    const bodyMd = (q.bodyMd ?? q.body_md ?? '').trim();
    const points = q.points ?? 1;
    const config = q.config || {};
    const options = q.options || [];
    const attachments = q.attachments || q.config?.attachments || [];
    const qTitle = (q.title || '').trim();

    const typeLabel = tr.types[typeCode] || typeCode;
    const ptsText = `[ ${points} ${points === 1 ? tr.point : tr.points} ]`;

    // Ensure we don't start question right at bottom of page
    const bodyLines = doc.splitTextToSize(bodyMd, contentWidth - 10);
    const estimatedH = 45 + bodyLines.length * 14;
    ensureSpace(Math.min(estimatedH, 140), tr.questionPaperTitle);

    // Exercise separator
    if (idx > 0 && y > margin + 25) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.65);
      doc.line(margin, y - 8, pageWidth - margin, y - 8);
    }

    // Exercise Header with clean wrapping to avoid any overlap with points badge
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const exHeader = `${tr.exercise} ${idx + 1}${qTitle ? ` : ${qTitle}` : ''}`;

    const ptsW = doc.getTextWidth(ptsText) + 8;
    const maxTitleW = contentWidth - ptsW - 12;
    const exHeaderLines = doc.splitTextToSize(exHeader, maxTitleW);

    doc.text(exHeaderLines, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(ptsText, pageWidth - margin, y, { align: 'right' });

    y += exHeaderLines.length * 14 + 3;

    // Subtitle type
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(typeLabel, margin, y);
    y += 11;

    // Attachments indicator
    if (attachments.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(79, 70, 229);
      attachments.forEach((att) => {
        let icon = `📎 ${tr.attachmentMedia}`;
        if (att.mime_type?.startsWith('audio/') || att.mimeType?.startsWith('audio/')) icon = `🔊 ${tr.attachmentAudio}`;
        else if (att.mime_type?.startsWith('video/') || att.mimeType?.startsWith('video/')) icon = `🎬 ${tr.attachmentVideo}`;
        doc.text(`[ ${icon} : ${att.filename} ]`, margin, y);
        y += 12;
      });
      y += 2;
    }

    // Question Body / Statement
    if (bodyLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(bodyLines, margin, y, { lineHeightFactor: 1.35 });
      y += bodyLines.length * 13 + 8;
    }

    // Options for MCQ / True-False
    if (typeCode === 'MCQ_SINGLE' || typeCode === 'MCQ_MULTI' || typeCode === 'TRUE_FALSE') {
      options.forEach((opt, oIdx) => {
        const optText = (opt.bodyMd ?? opt.body_md ?? '').trim();
        const letter = String.fromCharCode(65 + oIdx);
        const optLines = doc.splitTextToSize(optText, contentWidth - 36);
        ensureSpace(optLines.length * 13 + 6, tr.questionPaperTitle);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(`${letter}.`, margin + 10, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(optLines, margin + 26, y, { lineHeightFactor: 1.3 });
        y += optLines.length * 13 + 5;
      });
      y += 6;
    } else if (typeCode === 'MATCHING' && Array.isArray(config.pairs)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.matchingPrompt, margin, y);
      y += 12;
      config.pairs.forEach((p, pIdx) => {
        ensureSpace(18, tr.questionPaperTitle);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`${pIdx + 1}.  ${p.left || ''}`, margin + 10, y);
        doc.text(`${String.fromCharCode(65 + pIdx)}.  ${p.right || ''}`, margin + 230, y);
        y += 15;
      });
      y += 6;
    } else if (typeCode === 'ORDERING' && Array.isArray(config.items)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.orderingPrompt, margin, y);
      y += 12;
      config.items.forEach((item, iIdx) => {
        ensureSpace(16, tr.questionPaperTitle);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`• ${item}`, margin + 12, y);
        y += 15;
      });
      y += 6;
    } else if (typeCode === 'CODE' && config.starterCode) {
      const codeLines = doc.splitTextToSize(config.starterCode, contentWidth - 30);
      const codeBoxH = codeLines.length * 13 + 18;
      ensureSpace(codeBoxH + 12, tr.questionPaperTitle);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, codeBoxH, 3, 3, 'FD');
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(codeLines, margin + 12, y + 14, { lineHeightFactor: 1.3 });
      y += codeBoxH + 8;
    }

    y += 10;
  });

  // ==========================================
  // PART 3: CANDIDATE ANSWER BOOKLET (FEUILLE DE RÉPONSES)
  // ==========================================
  currentSectionTitle = tr.answerBookletTitle;
  doc.addPage();
  y = margin + 14;
  drawRunningHeader(tr.answerBookletTitle);

  // Section Banner: Feuille de Réponses
  doc.setDrawColor(79, 70, 229);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text(tr.answerBookletTitle, pageWidth / 2, y + 17, { align: 'center' });
  y += 34;

  // Candidate Quick-Reminder Bar
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(tr.candidateReminder, margin + 10, y + 15);
  y += 32;

  // Answer space for every question
  rawQuestions.forEach((q, idx) => {
    const typeCode = q.typeCode || q.type_code || 'MCQ_SINGLE';
    const points = q.points ?? 1;
    const config = q.config || {};
    const options = q.options || [];
    const qTitle = (q.title || '').trim();

    // Determine lines count specified by teacher or defaults
    const maxTeacherLines = config.answerLines ? parseInt(config.answerLines, 10) : null;
    const isEssay = typeCode === 'ESSAY';
    const isLongText = typeCode === 'LONG_TEXT';
    const isShortText = typeCode === 'SHORT_TEXT';
    const isCode = typeCode === 'CODE';

    let neededH = 55;
    if (typeCode === 'MCQ_SINGLE' || typeCode === 'MCQ_MULTI' || typeCode === 'TRUE_FALSE') {
      neededH = 52;
    } else if (isCode) {
      const lines = Math.max(1, maxTeacherLines || 18);
      neededH = lines * 18 + 40;
    } else if (isEssay || isLongText || isShortText) {
      const lines = Math.max(1, maxTeacherLines || (isEssay ? 14 : isLongText ? 10 : 5));
      neededH = lines * 20 + 40;
    } else if (typeCode === 'NUMERIC') {
      neededH = 96;
    } else if (typeCode === 'MATCHING' && Array.isArray(config.pairs)) {
      neededH = config.pairs.length * 20 + 45;
    } else if (typeCode === 'ORDERING' && Array.isArray(config.items)) {
      neededH = 65;
    } else if (typeCode === 'FILL_BLANK') {
      const blanksCount = Array.isArray(config.blanks) && config.blanks.length > 0 ? config.blanks.length : 1;
      neededH = blanksCount * 22 + 40;
    }

    // Check space before drawing exercise block so it doesn't split awkwardly
    ensureSpace(Math.min(neededH, pageHeight - margin * 2 - 30), tr.answerBookletTitle);

    // Answer block header with points badge on the right
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const exAnsTitle = `${tr.exercise} ${idx + 1}${qTitle ? ` : ${qTitle}` : ''}`;
    const ptsAnsText = `[ ${points} ${points === 1 ? tr.point : tr.points} ]`;

    const ptsAnsW = doc.getTextWidth(ptsAnsText) + 6;
    const maxAnsTitleW = contentWidth - ptsAnsW - 10;
    const ansTitleLines = doc.splitTextToSize(exAnsTitle, maxAnsTitleW);

    doc.text(ansTitleLines, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(ptsAnsText, pageWidth - margin, y, { align: 'right' });

    y += ansTitleLines.length * 13 + 6;

    // Specific Answer Spaces:
    if (typeCode === 'MCQ_SINGLE' || typeCode === 'MCQ_MULTI' || typeCode === 'TRUE_FALSE') {
      // Clean Option Checkboxes grid
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.checkAnswer || "Cochez la réponse :", margin + 8, y + 13);

      const optBoxW = 36;
      const optBoxH = 18;
      let optX = margin + 130;
      let optY = y;

      options.forEach((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);

        if (optX + optBoxW > pageWidth - margin) {
          optX = margin + 130;
          optY += optBoxH + 6;
          ensureSpace(optBoxH + 6, tr.answerBookletTitle);
        }

        doc.setDrawColor(148, 163, 184); // slate-400
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(optX, optY, optBoxW, optBoxH, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`[  ] ${letter}`, optX + 6, optY + 12);
        optX += optBoxW + 8;
      });

      y = optY + optBoxH + 16;

    } else if (isCode) {
      // Code Response Container (configured lines by teacher)
      const linesCount = Math.max(1, maxTeacherLines || 18);
      const lineHeight = 18;
      const headerH = 22;
      const codeBoxH = linesCount * lineHeight + headerH + 6;

      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(margin, y, contentWidth, codeBoxH, 3, 3, 'FD');

      // Top title bar inside the box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105); // slate-600
      const langLabel = config.language || 'Code';
      doc.text(`${tr.codeLabel} (${langLabel}) — Max ${linesCount} lignes`, margin + 10, y + 15);

      // Divider line separating title bar from code lines
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.65);
      doc.line(margin, y + headerH, pageWidth - margin, y + headerH);

      // Vertical line separating line numbers gutter from writing area
      const gutterW = 34;
      doc.line(margin + gutterW, y + headerH, margin + gutterW, y + codeBoxH);

      let curLineY = y + headerH;
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);

      for (let l = 0; l < linesCount; l++) {
        curLineY += lineHeight;

        // Line number in gutter
        doc.setTextColor(148, 163, 184); // slate-400
        const lineNumStr = String(l + 1).padStart(2, ' ');
        doc.text(lineNumStr, margin + 10, curLineY - 4);

        // Subtle ruled dotted line for student code writing
        doc.setDrawColor(226, 232, 240);
        doc.setLineDashPattern([1.5, 2.5], 0);
        doc.line(margin + gutterW + 6, curLineY, pageWidth - margin - 8, curLineY);
        doc.setLineDashPattern([], 0);
      }

      y += codeBoxH + 16;

    } else if (isEssay || isLongText || isShortText) {
      // Essay / Long / Short Text writing lines (configured lines by teacher)
      const defaultLines = isEssay ? 14 : isLongText ? 10 : 5;
      const linesCount = Math.max(1, maxTeacherLines || defaultLines);
      const lineSpacing = 20;
      const headerH = 22;
      const boxH = linesCount * lineSpacing + headerH + 8;

      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, boxH, 3, 3, 'FD');

      // Top title bar inside the box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(tr.workSpaceLabel, margin + 10, y + 15);

      const maxW = config.maxWords || config.wordLimit;
      if (maxW) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`(${tr.maxWords} : ${maxW} ${tr.words})`, pageWidth - margin - 10, y + 15, { align: 'right' });
      }

      // Draw clean ruled dotted lines
      let curDottedY = y + headerH;
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.65);
      doc.setLineDashPattern([2, 2.5], 0);
      for (let i = 0; i < linesCount; i++) {
        curDottedY += lineSpacing;
        doc.line(margin + 10, curDottedY, pageWidth - margin - 10, curDottedY);
      }
      doc.setLineDashPattern([], 0);

      y += boxH + 16;

    } else if (typeCode === 'NUMERIC') {
      // Numeric Calculation & Final Answer Card
      const numBoxH = 80;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(250, 252, 255);
      doc.roundedRect(margin, y, contentWidth, numBoxH, 3, 3, 'FD');

      // Final Answer section
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(tr.answerLabel, margin + 12, y + 18);

      doc.setDrawColor(148, 163, 184);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 110, y + 6, 160, 20, 2, 2, 'FD');

      // Calculation area below
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.workSpaceLabel, margin + 12, y + 42);

      let calcY = y + 44;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.65);
      doc.setLineDashPattern([2, 2.5], 0);
      for (let c = 0; c < 2; c++) {
        calcY += 15;
        doc.line(margin + 12, calcY, pageWidth - margin - 12, calcY);
      }
      doc.setLineDashPattern([], 0);

      y += numBoxH + 16;

    } else if (typeCode === 'MATCHING' && Array.isArray(config.pairs)) {
      // Matching Answer Boxes
      const pairRows = config.pairs.length;
      const matchBoxH = pairRows * 20 + 26;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, matchBoxH, 3, 3, 'FD');

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.matchingPrompt, margin + 10, y + 14);

      let curPairY = y + 18;
      config.pairs.forEach((p, pIdx) => {
        curPairY += 20;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        const leftLabel = `${pIdx + 1}.  ${p.left || ''}`;
        const truncatedLeft = doc.splitTextToSize(leftLabel, contentWidth * 0.6)[0];
        doc.text(truncatedLeft, margin + 12, curPairY - 4);

        doc.setDrawColor(148, 163, 184);
        doc.setFillColor(250, 252, 255);
        doc.roundedRect(margin + contentWidth * 0.65, curPairY - 14, 50, 15, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`[ ___ ]`, margin + contentWidth * 0.65 + 12, curPairY - 3);
      });

      y += matchBoxH + 16;

    } else if (typeCode === 'ORDERING' && Array.isArray(config.items)) {
      // Ordering Sequence Boxes
      const itemsCount = config.items.length;
      const rows = Math.ceil((itemsCount * 56) / (contentWidth - 24)) || 1;
      const ordBoxH = rows * 26 + 26;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, ordBoxH, 3, 3, 'FD');

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.orderingPrompt, margin + 10, y + 14);

      let ordX = margin + 12;
      let curOrdY = y + 26;
      config.items.forEach((_, iIdx) => {
        if (ordX + 50 > pageWidth - margin - 12) {
          ordX = margin + 12;
          curOrdY += 24;
        }

        doc.setDrawColor(148, 163, 184);
        doc.setFillColor(250, 252, 255);
        doc.roundedRect(ordX, curOrdY, 46, 16, 2, 2, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(`${iIdx + 1}: [ ___ ]`, ordX + 4, curOrdY + 11);
        ordX += 52;
      });

      y += ordBoxH + 16;

    } else if (typeCode === 'FILL_BLANK') {
      const blanksCount = Array.isArray(config.blanks) && config.blanks.length > 0 ? config.blanks.length : 1;
      const fillBoxH = blanksCount * 22 + 20;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, fillBoxH, 3, 3, 'FD');

      let curBlankY = y + 6;
      for (let b = 0; b < blanksCount; b++) {
        curBlankY += 22;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const blankPrefix = `${tr.blankLabel || 'Trou'} ${b + 1} : `;
        doc.text(blankPrefix, margin + 12, curBlankY - 4);

        const prefixW = doc.getTextWidth(blankPrefix);
        doc.setDrawColor(148, 163, 184);
        doc.setLineDashPattern([2, 2.5], 0);
        doc.line(margin + 12 + prefixW + 4, curBlankY - 4, pageWidth - margin - 14, curBlankY - 4);
        doc.setLineDashPattern([], 0);
      }

      y += fillBoxH + 16;

    } else {
      const fallbackLines = 4;
      const fallbackH = fallbackLines * 20 + 20;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, fallbackH, 3, 3, 'FD');

      let curDottedY = y + 10;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.65);
      doc.setLineDashPattern([2, 2.5], 0);
      for (let i = 0; i < fallbackLines; i++) {
        curDottedY += 20;
        doc.line(margin + 10, curDottedY, pageWidth - margin - 10, curDottedY);
      }
      doc.setLineDashPattern([], 0);

      y += fallbackH + 16;
    }

    y += 10;
  });

  // ==========================================
  // RUNNING FOOTERS & PAGE NUMBERING
  // ==========================================

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer hairline
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    // Left: Integrity note
    doc.text(tr.confidential, margin, pageHeight - 15);

    // Right: Page X of Y
    const pageStr = `${tr.page} ${i} ${tr.of} ${pageCount}`;
    doc.text(pageStr, pageWidth - margin, pageHeight - 15, { align: 'right' });
  }

  const defaultName = `${sanitizeFilename(title)}_paper`;
  doc.save(ensureExtension(filename || defaultName, 'pdf'));
}
