import { motion } from 'framer-motion';

interface ShimmerButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const ShimmerButton: React.FC<ShimmerButtonProps> = ({ children, className = '', onClick, disabled }) => {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-xl px-6 py-3 font-medium text-white transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={{
        background: 'linear-gradient(135deg, hsl(217 91% 60%), hsl(262 83% 58%))',
      }}
    >
      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPosition: ['-200% 0', '200% 0'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
      />
      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          boxShadow: '0 0 24px hsl(217 91% 60% / 0.35), 0 0 60px hsl(262 83% 58% / 0.15)',
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
};

export default ShimmerButton;
