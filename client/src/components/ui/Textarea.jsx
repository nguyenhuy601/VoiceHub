
const Textarea = ({ 
  value, 
  onChange, 
  placeholder = '', 
  rows = 3,
  disabled = false,
  className = '',
  ...props 
}) => {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`
        w-full px-4 py-2 
        bg-dark-800 text-white
        border border-dark-700 rounded-lg
        focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
        disabled:opacity-50 disabled:cursor-not-allowed
        resize-none
        transition-all duration-200
        ${className}
      `}
      {...props}
    />
  );
};

export default Textarea;
