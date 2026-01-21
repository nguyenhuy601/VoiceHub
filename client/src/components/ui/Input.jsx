import { forwardRef } from 'react';

const Input = forwardRef(
  (
    {
      label,
      error,
      type = 'text',
      className = '',
      containerClassName = '',
      icon: Icon,
      ...props
    },
    ref
  ) => {
    return (
      <div className={`${containerClassName}`}>
        {label && (
          <label className="block text-sm font-medium mb-2 text-gray-300">
            {label}
          </label>
        )}
        
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon className="w-5 h-5" />
            </div>
          )}
          
          <input
            ref={ref}
            type={type}
            className={`
              w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg
              focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
              transition-all duration-200 text-white placeholder-gray-500
              ${Icon ? 'pl-10' : ''}
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}
              ${className}
            `}
            {...props}
          />
        </div>

        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
