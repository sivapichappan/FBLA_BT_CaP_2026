import { motion } from 'framer-motion';

interface AnimatedGradientTextProps {
  children: React.ReactNode;
  className?: string;
}

const AnimatedGradientText: React.FC<AnimatedGradientTextProps> = ({ children, className = '' }) => {
  return (
    <motion.span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: 'linear-gradient(90deg, hsl(217 91% 60%), hsl(262 83% 58%), hsl(217 91% 60%))',
        backgroundSize: '200% auto',
      }}
      animate={{ backgroundPosition: ['0% center', '200% center'] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
};

export default AnimatedGradientText;
