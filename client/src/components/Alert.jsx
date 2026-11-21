import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Alert({ kind, variant, children }) {
  if (!children) return null;
  const isOk = kind === 'ok' || variant === 'ok';
  const Icon = isOk ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={isOk ? 'status' : 'alert'}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-sm transition-all ${
        isOk
          ? 'border-ok/20 bg-ok-tint text-ok'
          : 'border-pen/20 bg-pen-tint text-pen'
      }`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="font-medium leading-relaxed">{children}</div>
    </div>
  );
}
