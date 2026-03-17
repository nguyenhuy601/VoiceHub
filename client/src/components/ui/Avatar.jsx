import { getAvatarColor, getInitials, getUserDisplayName } from '../../utils/helpers';

const Avatar = ({ user, size = 'md', online = false, className = '' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-xl',
  };

  const onlineIndicatorSize = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
  };

  const displayName = getUserDisplayName(user);

  return (
    <div className={`relative ${className}`}>
      {user?.avatar ? (
        <img
          src={user.avatar}
          alt={displayName || 'User'}
          className={`${sizeClasses[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`
            ${sizeClasses[size]} ${getAvatarColor(displayName)}
            rounded-full flex items-center justify-center font-semibold text-white
          `}
        >
          {getInitials(displayName || 'U')}
        </div>
      )}

      {online && (
        <div
          className={`
            absolute bottom-0 right-0 ${onlineIndicatorSize[size]}
            bg-green-500 border-2 border-dark-900 rounded-full
          `}
        />
      )}
    </div>
  );
};

export default Avatar;
