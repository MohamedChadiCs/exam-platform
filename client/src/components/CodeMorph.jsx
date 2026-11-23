import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Code, Play, RefreshCw, Terminal, Sparkles } from 'lucide-react';

// Common programming language keywords for syntax coloring
const KEYWORDS = new Set([
  'function', 'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while',
  'import', 'from', 'as', 'const', 'let', 'var', 'export', 'default', 'async',
  'await', 'try', 'except', 'catch', 'finally', 'throw', 'raise', 'in', 'of',
  'new', 'this', 'self', 'public', 'private', 'static', 'void', 'int', 'string',
  'boolean', 'bool', 'true', 'false', 'null', 'undefined', 'None', 'True', 'False',
  'lambda', 'with', 'yield', 'pass', 'break', 'continue'
]);

function tokenizeCode(code = '') {
  const lines = code.split('\n');
  const counts = new Map();

  return lines.map((line, lineIdx) => {
    // Regex matching comments, strings, words/identifiers, symbols, whitespace
    const tokenRegex = /(#.*$|\/\/.*$)|(".*?"|'.*?'|`.*?`)|(\b\d+(\.\d+)?\b)|([a-zA-Z_]\w*)|([^\s\w])|(\s+)/g;
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
  editable = false,
  code: singleCode,
  onChange,
  onReset,
  title,
  className = '',
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

  const currentSnippet = normalizedSnippets[currentIndex] || normalizedSnippets[0];
  const activeCode = currentSnippet?.code || '';

  const tokenizedLines = useMemo(() => {
    return tokenizeCode(activeCode);
  }, [activeCode]);

  function handleCopy() {
    navigator.clipboard?.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl transition-all ${className}`}>
      {/* Window Titlebar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 py-2.5 backdrop-blur-md">
        {/* macOS Traffic Light Window Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56] transition-transform hover:scale-110" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e] transition-transform hover:scale-110" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f] transition-transform hover:scale-110" />
          </div>

          <div className="ms-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Code size={13} className="text-mark" />
            <span className="font-mono font-medium text-slate-300">
              {currentSnippet?.language || language}
            </span>
          </div>
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
                  setIsEditMode(false);
                }}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors ${
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
                  {s.icon || <Sparkles size={11} />}
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Right Tools (Copy, Editor Toggle, Reset) */}
        <div className="flex items-center gap-2">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title="Reset code to original"
            >
              <RefreshCw size={12} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {editable && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                isEditMode
                  ? 'bg-mark/20 text-mark border border-mark/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {isEditMode ? 'Morph Preview' : 'Edit Code'}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Display or Interactive Editor Area */}
      <div className="relative min-h-[14rem] overflow-x-auto p-4 font-mono text-xs leading-relaxed">
        {isEditMode && editable ? (
          <textarea
            rows={Math.max(10, activeCode.split('\n').length + 1)}
            value={activeCode}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                const val = e.target.value;
                const next = val.substring(0, start) + '  ' + val.substring(end);
                onChange?.(next);
                setTimeout(() => {
                  e.target.selectionStart = e.target.selectionEnd = start + 2;
                }, 0);
              }
            }}
            placeholder="// Write code here..."
            className="w-full resize-none border-0 bg-transparent p-0 font-mono text-xs leading-relaxed text-emerald-400 outline-none focus:ring-0"
            spellCheck={false}
          />
        ) : (
          <div className="table w-full">
            <AnimatePresence mode="popLayout" initial={false}>
              {tokenizedLines.map((lineTokens, lineIdx) => (
                <div key={`line-${lineIdx}`} className="table-row">
                  {/* Line Number */}
                  <span className="table-cell select-none pe-4 text-right font-mono text-[11px] text-slate-600">
                    {lineIdx + 1}
                  </span>

                  {/* Morphing Line Content */}
                  <span className="table-cell whitespace-pre">
                    {lineTokens.map((token) => (
                      <motion.span
                        key={token.id}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                        transition={{
                          layout: { type: 'spring', stiffness: 350, damping: 28 },
                          opacity: { duration: 0.2 },
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
      <div className="flex items-center justify-between border-t border-slate-900 bg-slate-950/90 px-4 py-1.5 text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-2">
          <span>UTF-8</span>
          <span>•</span>
          <span>{tokenizedLines.length} lines</span>
          <span>•</span>
          <span>{activeCode.length} chars</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Terminal size={11} />
          <span>Code Morph</span>
        </div>
      </div>
    </div>
  );
}
