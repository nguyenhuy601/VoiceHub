// Migrated from Topic.tsx - Navigation menu item with animation
import { motion } from 'framer-motion';

export const NavItem = ({ 
  title, 
  icon: Icon, 
  onClick, 
  active = false,
  animateFrom = 'left' 
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`
        flex items-center w-full py-2.5 px-4 rounded-lg
        font-semibold duration-100 ease-out
        ${active 
          ? 'bg-blue-600 text-white' 
          : 'text-gray-400 hover:bg-gray-700 hover:text-white'
        }
      `}
      initial={{
        x: animateFrom === 'left' ? -200 : 200,
        opacity: 0,
      }}
      animate={{ 
        opacity: 1, 
        x: 0 
      }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {Icon && (
        <div className="text-2xl">
          <Icon />
        </div>
      )}
      <span className="ml-3 text-base">{title}</span>
    </motion.button>
  );
};
