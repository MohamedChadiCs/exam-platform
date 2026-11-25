import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function safeFilename(name) {
  return String(name || 'export')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'export';
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

export function exportGradesToExcel(exam, submissions) {
  const rows = submissions.map((s, idx) => ({
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

  const wb = XLSX.utils.book_new();
  const gradesSheet = XLSX.utils.json_to_sheet(rows);
  gradesSheet['!cols'] = [
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

  const infoSheet = XLSX.utils.json_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 20 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, infoSheet, 'Summary');

  XLSX.writeFile(wb, `${safeFilename(exam?.title || 'exam')}_grades.xlsx`);
}

export function exportGradesToPdf(exam, submissions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const stats = computeGradeStats(submissions);

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(exam?.title || 'Grade List', 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const courseLine = exam?.course_code
    ? `${exam.course_code} — ${exam.course_name || ''}`
    : 'Examination Grade Sheet';
  doc.text(courseLine, 40, 60);

  doc.setFontSize(9);
  doc.text(
    `Max Score: ${exam?.max_score ?? '—'} pts   |   Passing Score: ${exam?.passing_score ?? '—'} pts   |   Total: ${stats.total}   |   Passed: ${stats.passedCount}   |   Failed: ${stats.failedCount}   |   Average: ${stats.avgScore} pts (${stats.avgPct}%)`,
    40,
    76
  );
  doc.text(`Exported: ${new Date().toLocaleString()}`, pageWidth - 40, 42, { align: 'right' });

  const body = submissions.map((s, idx) => [
    String(idx + 1),
    s.matricule || '—',
    `${s.first_name || ''} ${s.last_name || ''}`.trim() || '—',
    s.email || '—',
    s.total_score !== null && s.total_score !== undefined ? `${s.total_score} / ${exam?.max_score ?? ''}` : '—',
    s.percentage !== null && s.percentage !== undefined ? `${s.percentage}%` : '—',
    getResultLabel(s),
    getIntegrityLabel(s),
  ]);

  autoTable(doc, {
    startY: 92,
    head: [['#', 'Matricule', 'Student', 'Email', 'Score', '%', 'Result', 'Integrity']],
    body,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: 80 },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 6) {
        if (data.cell.raw === 'Passed') {
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'Failed') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 7 && String(data.cell.raw).includes('Fullscreen')) {
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

  doc.save(`${safeFilename(exam?.title || 'exam')}_grades.pdf`);
}

const QUESTION_TYPE_LABELS = {
  MCQ_SINGLE: 'Single Choice',
  MCQ_MULTI: 'Multiple Choice',
  TRUE_FALSE: 'True / False',
  NUMERIC: 'Numeric',
  SHORT_TEXT: 'Short Answer',
  LONG_TEXT: 'Long Answer',
  ESSAY: 'Essay',
  MATCHING: 'Matching',
  ORDERING: 'Ordering',
  FILL_BLANK: 'Fill in the Blanks',
  CODE: 'Programming / Code',
};

export function exportExamPaperToPdf(examData, selectedCourse = null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const title = examData.title || 'Examination';
  const courseCode = examData.course_code || selectedCourse?.code || '';
  const courseName = examData.course_name || selectedCourse?.name || '';
  const departmentName = examData.department_name || selectedCourse?.department_name || '';
  const durationMinutes = examData.duration_minutes ?? examData.durationMinutes ?? 60;
  const passingScore = examData.passing_score ?? examData.passingScore ?? 0;
  const descriptionMd = examData.description_md ?? examData.descriptionMd ?? '';
  const rawQuestions = examData.questions || [];
  const totalPoints = rawQuestions.reduce((s, q) => s + (Number(q.points) || 0), 0) || examData.max_score || examData.maxScore || 0;

  function ensureSpace(needed) {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = margin;
    }
  }

  // Top Academic Header
  if (departmentName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(departmentName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 14;
  }

  if (courseCode || courseName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`COURSE: ${courseCode}${courseName ? ` — ${courseName}` : ''}`, pageWidth / 2, y, { align: 'center' });
    y += 18;
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title.toUpperCase(), contentWidth);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 20 + 4;

  // Divider + Metadata
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Duration: ${durationMinutes} min    •    Total Score: ${totalPoints} Points    •    Pass: ${passingScore} Pts`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 12;
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  // Student Identification Box
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('Student Name: ___________________________', margin + 12, y + 21);
  doc.text('Matricule: _______________', margin + 250, y + 21);
  doc.text('Score: ____ / ' + totalPoints, margin + 400, y + 21);
  y += 46;

  // Instructions Box
  if (descriptionMd && descriptionMd.trim()) {
    const instrLines = doc.splitTextToSize(descriptionMd.trim(), contentWidth - 20);
    const boxHeight = instrLines.length * 13 + 28;
    ensureSpace(boxHeight + 12);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('INSTRUCTIONS TO CANDIDATES:', margin + 10, y + 14);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(instrLines, margin + 10, y + 28);
    y += boxHeight + 16;
  }

  // Exercises
  rawQuestions.forEach((q, idx) => {
    const typeCode = q.typeCode || q.type_code || 'MCQ_SINGLE';
    const bodyMd = q.bodyMd ?? q.body_md ?? '';
    const points = q.points ?? 1;
    const config = q.config || {};
    const options = q.options || [];

    const bodyLines = doc.splitTextToSize(bodyMd, contentWidth);
    const estimatedMinHeight = 36 + bodyLines.length * 14;
    ensureSpace(estimatedMinHeight);

    // Exercise Header + Points
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    const typeLabel = QUESTION_TYPE_LABELS[typeCode] || typeCode;
    doc.text(`Exercise ${idx + 1}`, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`(${typeLabel})`, margin + 62, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`[ ${points} pts ]`, pageWidth - margin, y, { align: 'right' });
    y += 16;

    // Question Body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(bodyLines, margin, y);
    y += bodyLines.length * 14 + 6;

    // Options for MCQ / TRUE_FALSE
    if (options.length > 0 && (typeCode === 'MCQ_SINGLE' || typeCode === 'MCQ_MULTI' || typeCode === 'TRUE_FALSE')) {
      options.forEach((opt, oIdx) => {
        const optText = opt.bodyMd ?? opt.body_md ?? '';
        const letter = String.fromCharCode(65 + oIdx);
        const optLines = doc.splitTextToSize(optText, contentWidth - 40);
        ensureSpace(optLines.length * 13 + 6);

        doc.setDrawColor(148, 163, 184);
        doc.rect(margin + 8, y - 8, 9, 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`${letter}.`, margin + 22, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(optLines, margin + 36, y);
        y += optLines.length * 13 + 5;
      });
    } else if (typeCode === 'MATCHING' && Array.isArray(config.pairs)) {
      config.pairs.forEach((p, pIdx) => {
        ensureSpace(18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`${pIdx + 1}. ${p.left || ''}`, margin + 12, y);
        doc.text(`_______   ${String.fromCharCode(65 + pIdx)}. ${p.right || ''}`, margin + 240, y);
        y += 16;
      });
    } else if (typeCode === 'ORDERING' && Array.isArray(config.items)) {
      config.items.forEach((item, iIdx) => {
        ensureSpace(18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`[   ]  ${iIdx + 1}. ${item}`, margin + 12, y);
        y += 16;
      });
    } else if (typeCode === 'NUMERIC') {
      ensureSpace(24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Answer: ___________________________________', margin + 8, y + 6);
      y += 22;
    } else if (typeCode === 'CODE') {
      const codeLines = config.starterCode ? doc.splitTextToSize(config.starterCode, contentWidth - 20) : [];
      const boxH = Math.max(70, codeLines.length * 12 + 30);
      ensureSpace(boxH + 8);
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, boxH, 3, 3, 'FD');
      if (codeLines.length > 0) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text(codeLines, margin + 10, y + 14);
      }
      y += boxH + 8;
    } else {
      // SHORT_TEXT / LONG_TEXT / ESSAY / FILL_BLANK answer lines
      const lineCount = typeCode === 'ESSAY' || typeCode === 'LONG_TEXT' ? 6 : 3;
      ensureSpace(lineCount * 18 + 6);
      doc.setDrawColor(203, 213, 225);
      for (let l = 0; l < lineCount; l++) {
        y += 16;
        doc.line(margin, y, pageWidth - margin, y);
      }
      y += 6;
    }

    y += 14;
  });

  // Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 22, { align: 'center' });
  }

  doc.save(`${safeFilename(title)}_paper.pdf`);
}
