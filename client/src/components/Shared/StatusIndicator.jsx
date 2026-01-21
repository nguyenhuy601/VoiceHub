const StatusIndicator = ({ status = "online" }) => {
  const colors = {
    online: "bg-green-500",
    busy: "bg-red-500",
    away: "bg-yellow-500",
    offline: "bg-gray-500"
  };
  
  return (
    <div className={`w-3 h-3 rounded-full ${colors[status]} ring-2 ring-[#0a0118] ${status === 'online' ? 'animate-pulse' : ''}`}></div>
  );
};

export default StatusIndicator;
