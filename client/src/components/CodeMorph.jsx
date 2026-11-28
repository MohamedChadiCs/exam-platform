import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Code, RefreshCw, Terminal, Sparkles, Edit3, Eye } from 'lucide-react';

export const SUPPORTED_LANGUAGES = [
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML / CSS' },
];

// Common programming language keywords for syntax coloring
const KEYWORDS = new Set([
  'function', 'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while',
  'import', 'from', 'as', 'const', 'let', 'var', 'export', 'default', 'async',
  'await', 'try', 'except', 'catch', 'finally', 'throw', 'raise', 'in', 'of',
  'new', 'this', 'self', 'public', 'private', 'static', 'void', 'int', 'string',
  'boolean', 'bool', 'true', 'false', 'null', 'undefined', 'None', 'True', 'False',
  'lambda', 'with', 'yield', 'pass', 'break', 'continue', '#include', '#define',
  'main', 'printf', 'cout', 'cin', 'struct', 'typedef', 'char', 'float', 'double'
]);

function tokenizeCode(code = '') {
  const lines = code.split('\n');
  const counts = new Map();

  return lines.map((line, lineIdx) => {
    // Regex matching comments, strings, words/identifiers, symbols, whitespace
    const tokenRegex = /(#.*$|\/\/.*$)|(".*?"|'.*?'|`.*?`)|(\b\d+(\.\d+)?\b)|([a-zA-Z_#]\w*)|([^\s\w])|(\s+)/g;
    const tokens = [];
    let match;

    while ((match = tokenRegex.exec(line)) !== null) {
      const text = match[0];
      let type = 'text';

      if (match[1]) {
        type = 'comment';
      } else if (match[2]) {
        type = 'string';
      } else if (match[3]) {
        type = 'number';
      } else if (match[4]) {
        if (KEYWORDS.has(text)) {
          type = 'keyword';
        } else {
          type = 'identifier';
        }
      } else if (match[5]) {
        type = 'symbol';
      } else if (match[6]) {
        type = 'whitespace';
      }

      // Stable key computation for layout animations
      const baseKey = `${type}-${text}`;
      const count = counts.get(baseKey) || 0;
      counts.set(baseKey, count + 1);

      tokens.push({
        id: `${baseKey}-${count}`,
        text,
        type,
        lineIdx,
      });
    }

    if (tokens.length === 0) {
      tokens.push({
        id: `empty-${lineIdx}`,
        text: ' ',
        type: 'whitespace',
        lineIdx,
      });
    }

    return tokens;
  });
}

function getTokenColor(type) {
  switch (type) {
    case 'keyword':
      return 'text-purple-400 font-semibold';
    case 'string':
      return 'text-emerald-300';
    case 'number':
      return 'text-amber-300';
    case 'comment':
      return 'text-slate-500 italic';
    case 'symbol':
      return 'text-cyan-400';
    case 'identifier':
      return 'text-slate-200';
    default:
      return 'text-slate-300';
  }
}

export default function CodeMorph({
  snippets = [],
  activeSnippet = 0,
  language = 'python',
  onLanguageChange,
  editable = false,
  code: singleCode,
  onChange,
  onReset,
  title,
  placeholder,
  className = '',
  preventPaste = false,
  disableCopy = false,
  onPasteBlocked,
}) {
  // Normalize snippets input
  const normalizedSnippets = useMemo(() => {
    if (snippets && snippets.length > 0) return snippets;
    if (typeof singleCode === 'string') {
      return [{ name: title || 'Code', code: singleCode, language }];
    }
    return [{ name: 'Code', code: '', language }];
  }, [snippets, singleCode, title, language]);

  const [currentIndex, setCurrentIndex] = useState(activeSnippet);
  const [copied, setCopied] = useState(false);
  const [isEditMode, setIsEditMode] = useState(editable);
  const textareaRef = useRef(null);

  const currentSnippet = normalizedSnippets[currentIndex] || normalizedSnippets[0];
  const activeCode = (currentIndex === 0 && typeof singleCode === 'string')
    ? singleCode
    : (currentSnippet?.code ?? '');

  const lineCount = useMemo(() => {
    return Math.max(1, (activeCode || '').split('\n').length);
  }, [activeCode]);

  const tokenizedLines = useMemo(() => {
    return tokenizeCode(activeCode);
  }, [activeCode]);

  function handleCopy() {
    navigator.clipboard?.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Handle Tab key insertion (2 spaces) & prevent paste if enabled
  function handleKeyDown(e) {
    if (preventPaste && (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      e.stopPropagation();
      onPasteBlocked?.();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const next = val.substring(0, start) + '  ' + val.substring(end);
      onChange?.(next);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  }

  const isEditing = editable && (isEditMode || normalizedSnippets.length === 1);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl transition-all ${className}`}>
      {/* Window Titlebar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-900/95 px-3 py-2 backdrop-blur-md gap-2">
        {/* macOS Traffic Lights + Language Selector */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 select-none">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56] transition-transform hover:scale-110" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e] transition-transform hover:scale-110" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f] transition-transform hover:scale-110" />
          </div>

          {/* Top Language Selector or Static Badge */}
          {onLanguageChange ? (
            <div className="flex items-center gap-1.5 ms-1">
              <Code size={12} className="text-cyan-400" />
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Language:
              </label>
              <select
                value={language || currentSnippet?.language || 'python'}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="rounded border border-slate-700/80 bg-slate-800/90 px-2 py-0.5 text-[11px] font-mono font-medium text-cyan-300 hover:border-slate-600 focus:border-mark focus:outline-none transition-colors cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value} className="bg-slate-900 text-slate-200">
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="ms-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Code size={12} className="text-cyan-400" />
              <span className="font-mono font-medium text-slate-300">
                {currentSnippet?.language || language}
              </span>
            </div>
          )}
        </div>

        {/* Snippet Morph Switcher Tabs */}
        {normalizedSnippets.length > 1 && (
          <div className="flex items-center gap-1 rounded-lg bg-slate-950/80 p-0.5 border border-slate-800">
            {normalizedSnippets.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  if (idx !== 0) setIsEditMode(false);
                }}
                className={`relative px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  currentIndex === idx ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {currentIndex === idx && (
                  <motion.div
                    layoutId="activeSnippetBadge"
                    className="absolute inset-0 rounded-md bg-mark shadow-sm"
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  {s.icon || <Sparkles size={10} />}
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Right Tools (Reset, Edit Toggle, Copy) */}
        <div className="flex items-center gap-1.5 ms-auto">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title="Reset code"
            >
              <RefreshCw size={11} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {editable && normalizedSnippets.length > 1 && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                isEditMode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {isEditMode ? (
                <>
                  <Eye size={11} />
                  <span>Morph Preview</span>
                </>
              ) : (
                <>
                  <Edit3 size={11} />
                  <span>Direct Edit</span>
                </>
              )}
            </button>
          )}

          {!disableCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Code Area: Direct Writing Editor OR Morphing Token View */}
      <div className="relative min-h-[10rem] overflow-x-auto bg-slate-950 p-2.5 font-mono text-[11px] leading-[18px]">
        {isEditing ? (
          <div className="flex w-full items-start">
            {/* Gutter with line numbers */}
            <div className="select-none pe-2.5 text-right font-mono text-[10px] leading-[18px] text-slate-600 border-r border-slate-800/80 min-w-[2rem]">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="leading-[18px]">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Direct Writing Textarea */}
            <textarea
              ref={textareaRef}
              value={activeCode}
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={preventPaste ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onPasteBlocked?.();
              } : undefined}
              onDrop={preventPaste ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onPasteBlocked?.();
              } : undefined}
              placeholder={placeholder || '// Enter code here directly...'}
              rows={Math.max(6, lineCount)}
              className="w-full flex-1 resize-none border-0 bg-transparent ps-3 p-0 font-mono text-[11px] leading-[18px] text-slate-100 placeholder-slate-600 outline-none focus:ring-0 selection:bg-mark/40 selection:text-white"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="table w-full">
            <AnimatePresence mode="popLayout" initial={false}>
              {tokenizedLines.map((lineTokens, lineIdx) => (
                <div key={`line-${lineIdx}`} className="table-row">
                  {/* Line Number */}
                  <span className="table-cell select-none pe-2.5 text-right font-mono text-[10px] leading-[18px] text-slate-600 border-r border-slate-800/80 min-w-[2rem]">
                    {lineIdx + 1}
                  </span>

                  {/* Morphing Line Content */}
                  <span className="table-cell whitespace-pre ps-3 font-mono text-[11px] leading-[18px]">
                    {lineTokens.map((token) => (
                      <motion.span
                        key={token.id}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.9, filter: 'blur(3px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                        transition={{
                          layout: { type: 'spring', stiffness: 350, damping: 28 },
                          opacity: { duration: 0.15 },
                        }}
                        className={`inline-block ${getTokenColor(token.type)}`}
                      >
                        {token.text}
                      </motion.span>
                    ))}
                  </span>
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bottom Statusbar */}
      <div className="flex items-center justify-between border-t border-slate-900 bg-slate-950/95 px-3 py-1 text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-2">
          <span>UTF-8</span>
          <span>•</span>
          <span>{lineCount} lines</span>
          <span>•</span>
          <span>{activeCode.length} chars</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Terminal size={10} />
          <span>Code Morph</span>
        </div>
      </div>
    </div>
  );
}
