import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

export const AlertToast: React.FC = () => {
  const { nodes, setActiveAlert } = useAppStore(useShallow((state) => ({ nodes: state.nodes, setActiveAlert: state.setActiveAlert })));
  const [toast, setToast] = React.useState<any>(null);

  // Mock incoming alarm logic
  useEffect(() => {
    if (nodes.length === 0) return;

    const criticalNodes = nodes.filter(n => n.status === 'critical');
    if (criticalNodes.length > 0) {
      // Pick random critical node for demo toast
      const timer = setTimeout(() => {
        const randomNode = criticalNodes[Math.floor(Math.random() * criticalNodes.length)];
        setToast(randomNode);
      }, 3000); // Trigger 3s after load

      return () => clearTimeout(timer);
    }
  }, [nodes]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-20 right-4 md:right-8 z-50 cursor-pointer"
          onClick={() => {
            setActiveAlert(toast);
            setToast(null);
          }}
        >
          <div className="glass-panel border border-red-500/50 bg-red-100/90 dark:bg-red-950/40 rounded-xl p-4 flex items-center gap-4 shadow-[0_0_30px_rgba(255,51,102,0.3)]">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
              <AlertCircle className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-text-primary font-bold text-sm">Fiber Cut Detected</h4>
              <p className="text-red-500 dark:text-red-300 text-xs font-mono">{toast.name}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
