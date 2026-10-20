import { useEffect, useRef } from 'react';

// Standard accessibility behavior for drawers/modals:
// - Close with the Escape key.
// - Blocks the scrolling of the bodysuit while it is open.
// The component that uses the hook must be mounted only when the modal is open
// (conditional rendering), so that mount/unmount matches open/close.
export function useModalDismiss(onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    document.addEventListener('keydown', handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}
