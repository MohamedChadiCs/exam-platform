import { useId } from 'react';

export default function Field({ label, hint, error, children, optionalLabel }) {
  const id = useId();
  const control = children(id, Boolean(error));
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
        <span>{label}</span>
        {optionalLabel && <span className="text-xs font-normal text-ink-faint">{optionalLabel}</span>}
      </label>
      {control}
      {hint && !error && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-pen">{error}</p>}
    </div>
  );
}
