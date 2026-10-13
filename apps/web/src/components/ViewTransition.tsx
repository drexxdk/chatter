import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useIsPresent,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// How far a view travels while it fades, in pixels: enough to be seen as a slide, little enough to stay in the page.
const SLIDE = 32;

// A view on its way out is for the eyes only: nothing in it can be focused, clicked or read out, so that it is not
// taken for what has replaced it.
function View({ children }: { children: ReactNode }) {
  const present = useIsPresent();

  return (
    <div
      inert={!present}
      aria-hidden={present ? undefined : true}
      className="contents"
    >
      {children}
    </div>
  );
}

// A direction of 1 is forwards: the view that arrives comes in from the right and the one that goes leaves to the left.
// The exiting view is given the direction of the change too (see `custom` below), so going back reverses both.
const variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -direction * SLIDE }),
};

// One view of the page. The view that arrives can move the page under the one that leaves (a room opens scrolled to its
// end, the lobby is shorter than the room that was left), which would throw the leaving view up or down the screen. So
// as it leaves it is fixed where it was last seen on the screen, and only fades and slides from there.
function Slide({
  direction,
  children,
}: {
  direction: 1 | -1;
  children: ReactNode;
}) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<DOMRect | null>(null);
  const [leaving, setLeaving] = useState<DOMRect | null>(null);

  // Where it is on the screen, for as long as it is the view; it is read again when the page scrolls or is resized.
  useLayoutEffect(() => {
    if (present && ref.current)
      seen.current = ref.current.getBoundingClientRect();
  });
  useEffect(() => {
    if (!present) return;

    const note = () => {
      if (ref.current) seen.current = ref.current.getBoundingClientRect();
    };

    window.addEventListener("scroll", note, { passive: true });
    window.addEventListener("resize", note);
    return () => {
      window.removeEventListener("scroll", note);
      window.removeEventListener("resize", note);
    };
  }, [present]);
  useLayoutEffect(() => {
    if (!present) setLeaving(seen.current);
  }, [present]);

  return (
    <m.div
      ref={ref}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-1 flex-col"
      style={
        leaving
          ? {
              position: "fixed",
              top: leaving.top,
              left: leaving.left,
              width: leaving.width,
              height: leaving.height,
            }
          : undefined
      }
    >
      <View>{children}</View>
    </m.div>
  );
}

// Swaps one view of a page for another with a fade and a slide, the old one still in view as the new one arrives. Not
// when the page first opens, and without the slide for somebody who asked their system for less motion.
export function ViewTransition({
  viewKey,
  direction,
  children,
}: {
  // What the view is; a new one is a new view.
  viewKey: string;
  direction: 1 | -1;
  children: ReactNode;
}) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="sync" initial={false} custom={direction}>
          <Slide key={viewKey} direction={direction}>
            {children}
          </Slide>
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
