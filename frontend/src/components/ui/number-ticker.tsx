import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useSpring, useTransform } from 'framer-motion';

interface NumberTickerProps {
  value: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  delay?: number;
}

const NumberTicker: React.FC<NumberTickerProps> = ({
  value,
  className = '',
  suffix = '',
  prefix = '',
  delay = 0,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [hasStarted, setHasStarted] = useState(false);

  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (isInView && !hasStarted) {
      const timer = setTimeout(() => {
        setHasStarted(true);
        spring.set(value);
      }, delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [isInView, hasStarted, value, spring, delay]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => setDisplayValue(v));
    return unsubscribe;
  }, [display]);

  return (
    <motion.span ref={ref} className={className}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </motion.span>
  );
};

export default NumberTicker;
