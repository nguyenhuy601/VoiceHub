// Migrated from Groups.tsx - Organization/Server list sidebar
import { motion } from 'framer-motion';
import { AiFillCompass } from 'react-icons/ai';
import { FiPlus } from 'react-icons/fi';
import { Link } from 'react-router-dom';

export const OrganizationSidebar = ({ organizations = [], activeOrgId, onCreateNew }) => {
  return (
    <div className="w-20 bg-gray-900 flex flex-col items-center py-4 space-y-3 overflow-y-auto">
      {/* Home button */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          to="/dashboard"
          className="w-12 h-12 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors"
        >
          <AiFillCompass size={24} className="text-white" />
        </Link>
      </motion.div>

      <div className="w-full h-px bg-gray-700 mx-2" />

      {/* Organization list */}
      {organizations.map((org, index) => (
        <motion.div
          key={org._id}
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <Link to={`/organization/${org._id}`}>
            <div
              className={`
                w-12 h-12 rounded-full overflow-hidden cursor-pointer
                transition-all duration-200 hover:rounded-xl
                ${activeOrgId === org._id ? 'rounded-xl ring-2 ring-blue-500' : ''}
              `}
            >
              {org.logo ? (
                <img
                  src={org.logo}
                  alt={org.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {org.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </Link>
        </motion.div>
      ))}

      {/* Create new organization button */}
      <motion.button
        onClick={onCreateNew}
        className="w-12 h-12 bg-gray-700 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors group"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: organizations.length * 0.1 }}
        whileHover={{ scale: 1.1 }}
      >
        <FiPlus size={24} className="text-gray-400 group-hover:text-white" />
      </motion.button>
    </div>
  );
};
