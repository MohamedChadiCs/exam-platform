import { useId } from 'react';

export default function Field({ label, hint, error, children, optionalLabel }) {
  const id = useId();
  const control = children(id, Boolean(error));
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-xs font-semibold tracking-wide text-ink">
        <span>{label}</span>
        {optionalLabel && <span className="text-[11px] font-normal text-ink-faint">{optionalLabel}</span>}
      </label>
      {control}
      {hint && !error && <p className="text-xs text-ink-soft leading-normal">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-pen leading-normal">{error}</p>}
    </div>
  );
}
