import { useEffect, useState } from 'react';
import { FileDown, X } from 'lucide-react';

export default function ExportModal({
  open,
  title,
  defaultFilename,
  extension,
  showVariant = false,
  onClose,
  onConfirm,
}) {
  const [filename, setFilename] = useState(defaultFilename || 'export');
  const [variant, setVariant] = useState('detailed');

  useEffect(() => {
    if (open) {
      setFilename(defaultFilename || 'export');
      setVariant('detailed');
    }
  }, [open, defaultFilename]);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm({ filename: filename.trim() || defaultFilename || 'export', variant });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">File Name</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                autoFocus
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Enter file name"
                className="input flex-1"
              />
              <span className="rounded border border-line bg-paper px-2.5 py-2 text-xs font-mono text-ink-soft">
                .{extension}
              </span>
            </div>
          </div>

          {showVariant && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Grade List Version</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVariant('detailed')}
                  className={`rounded-md border p-3 text-start transition-colors ${
                    variant === 'detailed'
                      ? 'border-mark bg-mark/5 text-ink'
                      : 'border-line bg-white text-ink-soft hover:bg-paper'
                  }`}
                >
                  <div className="text-xs font-semibold">Detailed</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    All columns, email, percentage, integrity & summary
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVariant('short')}
                  className={`rounded-md border p-3 text-start transition-colors ${
                    variant === 'short'
                      ? 'border-mark bg-mark/5 text-ink'
                      : 'border-line bg-white text-ink-soft hover:bg-paper'
                  }`}
                >
                  <div className="text-xs font-semibold">Short</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    Matricule, First Name, Last Name, Note & Status
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-quiet text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              <FileDown size={14} /> Download .{extension}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
