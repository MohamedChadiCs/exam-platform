import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const ok = kind === 'ok';
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <div role={ok ? 'status' : 'alert'}
      className={`flex gap-2 rounded-md px-3 py-2.5 text-sm ${ok ? 'bg-ok-tint text-ok' : 'bg-pen-tint text-pen'}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
