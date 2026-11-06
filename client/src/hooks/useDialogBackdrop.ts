import { type PointerEvent, useRef } from "react";

function isBackdrop(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } =
    event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left ||
    event.clientX > right ||
    event.clientY < top ||
    event.clientY > bottom
  );
}

export default function useDialogBackdrop(onDismiss: () => void) {
  const pressedOutside = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      pressedOutside.current =
        event.isPrimary && event.button === 0 && isBackdrop(event);
    },
    onPointerUp(event: PointerEvent<HTMLDialogElement>) {
      const shouldDismiss = pressedOutside.current && isBackdrop(event);
      pressedOutside.current = false;
      if (shouldDismiss) onDismiss();
    },
    onPointerCancel() {
      pressedOutside.current = false;
    },
  };
}
