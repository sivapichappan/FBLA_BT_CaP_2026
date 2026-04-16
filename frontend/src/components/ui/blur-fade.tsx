import { motion } from 'framer-motion';

interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
}

const BlurFade: React.FC<BlurFadeProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 0.5,
  yOffset = 12,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default BlurFade;
