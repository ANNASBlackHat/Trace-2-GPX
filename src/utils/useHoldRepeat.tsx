import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook to provide press-and-hold auto-repeating behavior for buttons.
 * Triggers action immediately on click/press, then continuously repeats
 * after initialDelay at repeatInterval while held down.
 */
export function useHoldRepeat(
  action: () => void,
  initialDelay = 250,
  repeatInterval = 50
) {
  const actionRef = useRef(action);
  actionRef.current = action;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHeldRef = useRef(false);

  const stop = useCallback(() => {
    isHeldRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      stop();
      isHeldRef.current = true;

      // Trigger immediately
      actionRef.current();

      // Start delay timer
      timerRef.current = setTimeout(() => {
        if (!isHeldRef.current) return;
        intervalRef.current = setInterval(() => {
          if (isHeldRef.current) {
            actionRef.current();
          } else {
            stop();
          }
        }, repeatInterval);
      }, initialDelay);
    },
    [stop, initialDelay, repeatInterval]
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchCancel: stop,
  };
}

export interface HoldButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onTrigger: () => void;
  initialDelay?: number;
  repeatInterval?: number;
  children: React.ReactNode;
}

export const HoldButton: React.FC<HoldButtonProps> = ({
  onTrigger,
  initialDelay = 260,
  repeatInterval = 55,
  children,
  className = '',
  ...props
}) => {
  const holdHandlers = useHoldRepeat(onTrigger, initialDelay, repeatInterval);

  return (
    <button
      type="button"
      {...props}
      {...holdHandlers}
      className={`select-none touch-none ${className}`}
    >
      {children}
    </button>
  );
};
