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
// ==========================================

const PDF_TRANSLATIONS = {
  fr: {
    institution: "ÉTABLISSEMENT D'ENSEIGNEMENT SUPÉRIEUR",
    departmentDefault: "DÉPARTEMENT DES ÉTUDES ACADÉMIQUES",
    coursePrefix: "COURS / MODULE",
    duration: "Durée",
    minutes: "min",
    totalScore: "Barème",
    passingScore: "Moyenne",
    points: "pts",
    point: "pt",
    studentInfoTitle: "CADRE RÉSERVÉ AU CANDIDAT",
    studentName: "Nom et Prénom :",
    matricule: "N° Matricule :",
    groupOrRoom: "Groupe / Salle :",
    finalGrade: "NOTE :",
    instructionsTitle: "CONSIGNES AUX CANDIDATS",
    exercise: "Exercice",
    question: "Question",
    answerLabel: "Réponse :",
    workSpaceLabel: "Espace de réponse / rédaction :",
    codeLabel: "Solution en code :",
    matchingPrompt: "Associez chaque élément de gauche à sa correspondance :",
    orderingPrompt: "Indiquez l'ordre chronologique ou logique (1, 2, 3...) :",
    blankPrompt: "Complétez les éléments manquants :",
    maxWords: "Max",
    words: "mots",
    attachmentAudio: "Fichier Audio",
    attachmentVideo: "Fichier Vidéo",
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
    duration: "Duration",
    minutes: "min",
    totalScore: "Total Score",
    passingScore: "Pass Score",
    points: "pts",
    point: "pt",
    studentInfoTitle: "CANDIDATE IDENTIFICATION BOX",
    studentName: "Full Name:",
    matricule: "Student ID:",
    groupOrRoom: "Group / Room:",
    finalGrade: "GRADE:",
    instructionsTitle: "INSTRUCTIONS TO CANDIDATES",
    exercise: "Exercise",
    question: "Question",
    answerLabel: "Answer:",
    workSpaceLabel: "Written Answer Space / Calculations:",
    codeLabel: "Source Code Solution:",
    matchingPrompt: "Match each item on the left with its corresponding pair:",
    orderingPrompt: "Order the items sequentially (1, 2, 3...):",
    blankPrompt: "Fill in the blank fields:",
    maxWords: "Max",
    words: "words",
    attachmentAudio: "Audio File",
    attachmentVideo: "Video File",
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
    duration: "المدة",
    minutes: "د",
    totalScore: "المجموع",
    passingScore: "علامة النجاح",
    points: "نقاط",
    point: "نقطة",
    studentInfoTitle: "معلومات المترشح",
    studentName: "اللقب والاسم :",
    matricule: "رقم التسجيل :",
    groupOrRoom: "الفوج / القاعة :",
    finalGrade: "العلامة :",
    instructionsTitle: "تعليمات للمترشحين",
    exercise: "تمرين",
    question: "سؤال",
    answerLabel: "الإجابة :",
    workSpaceLabel: "مساحة التحرير والإجابة :",
    codeLabel: "كتابة الشيفرة البرمجية :",
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

function drawRuledWritingLines(doc, x1, x2, startY, count, spacing = 20) {
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
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const bottomThreshold = pageHeight - 48;
  let y = margin;

  // Language & Translation
  const rawLocale = (examData.locale || 'fr').toLowerCase();
  const locale = PDF_TRANSLATIONS[rawLocale] ? rawLocale : 'fr';
  const tr = PDF_TRANSLATIONS[locale];

  const title = (examData.title || tr.exam).trim();
  const courseCode = (examData.course_code || selectedCourse?.code || '').trim();
  const courseName = (examData.course_name || selectedCourse?.name || '').trim();
  const departmentName = (examData.department_name || selectedCourse?.department_name || tr.departmentDefault).trim();
  const durationMinutes = examData.duration_minutes ?? examData.durationMinutes ?? 60;
  const passingScore = examData.passing_score ?? examData.passingScore ?? 10;
  const descriptionMd = (examData.description_md ?? examData.descriptionMd ?? '').trim();
  const rawQuestions = examData.questions || [];
  const totalPoints = rawQuestions.reduce((s, q) => s + (Number(q.points) || 0), 0) || examData.max_score || examData.maxScore || 20;

  function ensureSpace(needed) {
    if (y + needed > bottomThreshold) {
      doc.addPage();
      y = margin;
      drawRunningHeader();
    }
  }

  function drawRunningHeader() {
    if (doc.internal.getNumberOfPages() > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      const leftHeader = courseCode ? `${courseCode} — ${title}` : title;
      doc.text(leftHeader, margin, y - 14);
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(margin, y - 8, pageWidth - margin, y - 8);
    }
  }

  // ==========================================
  // PAGE 1: PRESTIGIOUS INSTITUTIONAL HEADER
  // ==========================================

  // Department / Institution
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(departmentName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 14;

  // Course Line
  if (courseCode || courseName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    const courseText = `${tr.coursePrefix} : ${courseCode ? `${courseCode} — ` : ''}${courseName}`.toUpperCase();
    doc.text(courseText, pageWidth / 2, y, { align: 'center' });
    y += 18;
  }

  // Exam Title
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42); // slate-900
  const titleLines = doc.splitTextToSize(title.toUpperCase(), contentWidth);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 19 + 6;

  // Metadata Strip (Duration, Total Points, Passing Score)
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageWidth - margin, y);
  y += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const metadataText = `${tr.duration} : ${durationMinutes} ${tr.minutes}     •     ${tr.totalScore} : ${totalPoints} ${tr.points}     •     ${tr.passingScore} : ${passingScore} ${tr.points}`;
  doc.text(metadataText, pageWidth / 2, y, { align: 'center' });
  y += 10;
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  // Candidate Identification Box (Framed Academic Card)
  const idBoxH = 46;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(margin, y, contentWidth, idBoxH, 4, 4, 'FD');

  // Left side: Student Name, Matricule, Room
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(tr.studentName, margin + 12, y + 17);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(margin + 80, y + 18, margin + 330, y + 18);

  doc.text(tr.matricule, margin + 12, y + 35);
  doc.line(margin + 75, y + 36, margin + 200, y + 36);

  doc.text(tr.groupOrRoom, margin + 215, y + 35);
  doc.line(margin + 285, y + 36, margin + 350, y + 36);

  // Right side: Official Grade Award Box
  const gradeBoxW = 120;
  const gradeBoxX = pageWidth - margin - gradeBoxW - 8;
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(gradeBoxX, y + 6, gradeBoxW, 34, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(tr.finalGrade, gradeBoxX + 8, y + 18);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`____ / ${totalPoints}`, gradeBoxX + gradeBoxW - 10, y + 27, { align: 'right' });

  y += idBoxH + 14;

  // Instructions Box (if instructions exist)
  if (descriptionMd) {
    const instrLines = doc.splitTextToSize(descriptionMd, contentWidth - 26);
    const instrBoxH = instrLines.length * 12 + 24;
    ensureSpace(instrBoxH + 10);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentWidth, instrBoxH, 3, 3, 'FD');

    // Left accent stripe
    doc.setFillColor(79, 70, 229); // mark color
    doc.rect(margin, y, 3.5, instrBoxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(79, 70, 229);
    doc.text(tr.instructionsTitle, margin + 12, y + 13);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(instrLines, margin + 12, y + 25);

    y += instrBoxH + 16;
  }

  // ==========================================
  // EXERCISES / QUESTIONS RENDERING
  // ==========================================

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

    // Estimate initial needed height for header + prompt to prevent orphan exercise headers
    const bodyLines = doc.splitTextToSize(bodyMd, contentWidth);
    const headerPromptHeight = 44 + bodyLines.length * 13;
    ensureSpace(Math.min(headerPromptHeight + 35, 130));

    // Separator between exercises (except top of page)
    if (idx > 0 && y > margin + 20) {
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.setLineWidth(0.5);
      doc.line(margin, y - 6, pageWidth - margin, y - 6);
    }

    // Exercise Header
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);

    const exercisePrefix = `${tr.exercise} ${idx + 1}`;
    doc.text(exercisePrefix, margin, y);
    const prefixW = doc.getTextWidth(exercisePrefix);

    if (qTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(` : ${qTitle}`, margin + prefixW, y);
    }

    // Question Type Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const titleFullW = prefixW + (qTitle ? doc.getTextWidth(` : ${qTitle}`) : 0);
    if (titleFullW < contentWidth - 110) {
      doc.text(`— ${typeLabel}`, margin + titleFullW + 8, y);
    }

    // Points box on right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(ptsText, pageWidth - margin, y, { align: 'right' });
    y += 14;

    // Attachments indicator
    if (attachments.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(79, 70, 229);
      attachments.forEach((att) => {
        let iconText = `📎 ${tr.attachmentMedia}`;
        if (att.mime_type?.startsWith('audio/') || att.mimeType?.startsWith('audio/')) {
          iconText = `🔊 ${tr.attachmentAudio}`;
        } else if (att.mime_type?.startsWith('video/') || att.mimeType?.startsWith('video/')) {
          iconText = `🎬 ${tr.attachmentVideo}`;
        }
        doc.text(`[ ${iconText} : ${att.filename} ]`, margin, y);
        y += 11;
      });
      y += 2;
    }

    // Question Body / Statement
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(bodyLines, margin, y);
    y += bodyLines.length * 13 + 6;

    // ==========================================
    // Clean, Realistic Answer Spaces per Type
    // ==========================================

    if (typeCode === 'MCQ_SINGLE' || typeCode === 'MCQ_MULTI' || typeCode === 'TRUE_FALSE') {
      // Academic Multiple Choice Options
      const isMulti = typeCode === 'MCQ_MULTI';
      options.forEach((opt, oIdx) => {
        const optText = (opt.bodyMd ?? opt.body_md ?? '').trim();
        const letter = String.fromCharCode(65 + oIdx);
        const optLines = doc.splitTextToSize(optText, contentWidth - 44);
        ensureSpace(optLines.length * 13 + 6);

        // Checkbox / Circle
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.65);
        if (isMulti) {
          doc.rect(margin + 6, y - 7.5, 8.5, 8.5);
        } else {
          doc.circle(margin + 10, y - 3, 4.5);
        }

        // Letter
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(`${letter}.`, margin + 21, y);

        // Text
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(optLines, margin + 34, y);
        y += optLines.length * 13 + 4;
      });
      y += 6;

    } else if (typeCode === 'SHORT_TEXT') {
      // Short Answer Box (3 neat ruled lines)
      ensureSpace(68);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(250, 252, 255);
      doc.roundedRect(margin, y, contentWidth, 60, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.answerLabel, margin + 8, y + 12);

      drawRuledWritingLines(doc, margin + 10, pageWidth - margin - 10, y + 6, 2, 19);
      y += 68;

    } else if (typeCode === 'ESSAY' || typeCode === 'LONG_TEXT') {
      // Essay / Long Answer (8 neat ruled lines with word limit badge)
      const maxW = config.maxWords || config.wordLimit;
      const linesCount = typeCode === 'ESSAY' ? 8 : 6;
      const boxHeight = linesCount * 19 + 20;
      ensureSpace(boxHeight + 10);

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.workSpaceLabel, margin + 8, y + 12);

      if (maxW) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`(${tr.maxWords} : ${maxW} ${tr.words})`, pageWidth - margin - 10, y + 12, { align: 'right' });
      }

      drawRuledWritingLines(doc, margin + 10, pageWidth - margin - 10, y + 10, linesCount, 19);
      y += boxHeight + 8;

    } else if (typeCode === 'NUMERIC') {
      // Numeric Calculation Card
      ensureSpace(58);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(250, 252, 255);
      doc.roundedRect(margin, y, contentWidth, 50, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(tr.answerLabel, margin + 12, y + 18);

      // Input box for answer
      doc.setDrawColor(148, 163, 184);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 75, y + 8, 170, 16, 2, 2, 'FD');

      // Calculation line
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(tr.workSpaceLabel, margin + 12, y + 36);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(margin + 130, y + 36, pageWidth - margin - 12, y + 36);
      doc.setLineDashPattern([], 0);

      y += 58;

    } else if (typeCode === 'MATCHING' && Array.isArray(config.pairs)) {
      // Matching Pairs Table
      ensureSpace(config.pairs.length * 20 + 26);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.matchingPrompt, margin, y);
      y += 12;

      config.pairs.forEach((p, pIdx) => {
        ensureSpace(18);
        const letter = String.fromCharCode(65 + pIdx);

        // Left item
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`${pIdx + 1}.  ${p.left || ''}`, margin + 8, y);

        // Match box
        doc.setDrawColor(148, 163, 184);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin + 205, y - 8, 22, 11, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('...', margin + 213, y - 1);

        // Right item
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`${letter}.  ${p.right || ''}`, margin + 245, y);

        y += 17;
      });
      y += 6;

    } else if (typeCode === 'ORDERING' && Array.isArray(config.items)) {
      // Ordering Items
      ensureSpace(config.items.length * 18 + 24);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.orderingPrompt, margin, y);
      y += 12;

      config.items.forEach((item, iIdx) => {
        ensureSpace(17);
        doc.setDrawColor(148, 163, 184);
        doc.rect(margin + 8, y - 7.5, 14, 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`${iIdx + 1}.  ${item}`, margin + 28, y);
        y += 16;
      });
      y += 6;

    } else if (typeCode === 'FILL_BLANK') {
      // Fill in the Blanks
      ensureSpace(38);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr.blankPrompt, margin, y);
      y += 12;

      const blanksCount = Array.isArray(config.blanks) && config.blanks.length > 0 ? config.blanks.length : 1;
      for (let b = 0; b < blanksCount; b++) {
        ensureSpace(18);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`[ ${b + 1} ] : `, margin + 8, y);
        doc.setDrawColor(148, 163, 184);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(margin + 36, y, margin + 260, y);
        doc.setLineDashPattern([], 0);
        y += 16;
      }
      y += 6;

    } else if (typeCode === 'CODE') {
      // Programming Code Box with line numbers
      const lang = config.language || 'Code';
      const codeLines = config.starterCode ? doc.splitTextToSize(config.starterCode, contentWidth - 44) : [];
      const blankLinesCount = 7;
      const totalCodeLinesCount = Math.max(codeLines.length + 4, blankLinesCount);
      const codeBoxH = totalCodeLinesCount * 14 + 24;
      ensureSpace(Math.min(codeBoxH + 10, 160));

      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, codeBoxH, 3, 3, 'FD');

      // Top title bar
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${tr.codeLabel} (${lang})`, margin + 10, y + 11);

      // Monospace code area
      let codeY = y + 23;
      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);

      for (let l = 0; l < totalCodeLinesCount; l++) {
        // Line number
        doc.setTextColor(148, 163, 184);
        doc.text(`${String(l + 1).padStart(2, ' ')} |`, margin + 10, codeY);

        // Starter code if any
        if (l < codeLines.length) {
          doc.setTextColor(30, 41, 59);
          doc.text(codeLines[l], margin + 34, codeY);
        } else {
          // Subtle dot guideline
          doc.setDrawColor(226, 232, 240);
          doc.setLineDashPattern([1, 3], 0);
          doc.line(margin + 34, codeY, pageWidth - margin - 10, codeY);
          doc.setLineDashPattern([], 0);
        }
        codeY += 14;
      }

      y += codeBoxH + 8;
    } else {
      // Fallback open space (3 neat ruled lines)
      ensureSpace(58);
      drawRuledWritingLines(doc, margin, pageWidth - margin, y + 2, 3, 18);
      y += 60;
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
    doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    // Left: Integrity note
    doc.text(tr.confidential, margin, pageHeight - 16);

    // Right: Page X of Y
    const pageStr = `${tr.page} ${i} ${tr.of} ${pageCount}`;
    doc.text(pageStr, pageWidth - margin, pageHeight - 16, { align: 'right' });
  }

  const defaultName = `${sanitizeFilename(title)}_paper`;
  doc.save(ensureExtension(filename || defaultName, 'pdf'));
}
