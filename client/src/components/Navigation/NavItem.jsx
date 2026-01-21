import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';

const NavItem = ({ 
  to, 
  icon: Icon, 
  label, 
  onClick,
  badge,
  className = ''
}) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  const content = (
    <motion.div
      whileHover={{ x: 5 }}
      whileTap={{ scale: 0.98 }}
      className={`
        relative flex items-center px-4 py-3 rounded-lg cursor-pointer
        transition-all duration-200
        ${isActive 
          ? 'bg-blue-600 text-white' 
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }
        ${className}
      `}
    >
      {Icon && (
        <Icon 
          size={20} 
          className="mr-3 flex-shrink-0"
        />
      )}
      
      <span className="flex-1 font-medium truncate">
        {label}
      </span>

      {badge && (
        <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
          {badge}
        </span>
      )}

      {isActive && (
        <motion.div
          layoutId="navActiveIndicator"
          className="absolute left-0 w-1 h-8 bg-white rounded-r"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </motion.div>
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div onClick={onClick}>
      {content}
    </div>
  );
};

export default NavItem;
