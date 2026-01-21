// Migrated and adapted from old Chat.tsx component
import { motion } from 'framer-motion';
import moment from 'moment';
import { Avatar } from '../ui/Avatar';

export const ChatMessage = ({
  message,
  sender,
  timestamp,
  profileImage,
  chatImage,
  isOwnMessage,
}) => {
  const formattedTime = timestamp 
    ? moment(timestamp).fromNow()
    : "Vừa xong";

  return (
    <motion.div
      initial={{
        x: isOwnMessage ? 200 : -200,
        opacity: 0,
      }}
      transition={{ duration: 0.3 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className={`
        border-b border-gray-600 py-3 flex mb-4 text-sm
        ${isOwnMessage ? 'bg-gray-600 rounded-md px-2' : 'px-2'}
      `}
      role="article"
      aria-label={`Tin nhắn từ ${sender}`}
    >
      <Avatar
        src={profileImage}
        alt={`${sender}'s avatar`}
        className="cursor-pointer w-10 h-10 rounded-full mr-3"
      />
      
      <div className="flex-1 overflow-hidden">
        <div>
          <span 
            className="font-bold text-blue-400 cursor-pointer hover:underline"
            role="button"
            tabIndex={0}
          >
            {sender}
          </span>
          <time 
            className="font-bold text-gray-400 text-xs pl-2"
            dateTime={timestamp ? new Date(timestamp).toISOString() : undefined}
          >
            {formattedTime}
          </time>
        </div>
        
        {message && (
          <p className="text-white text-base leading-normal break-words mt-1">
            {message}
          </p>
        )}

        {chatImage && (
          <div className="mt-2">
            <img
              src={chatImage}
              alt="Chat attachment"
              className="max-w-xs max-h-60 rounded-md border border-gray-400 object-contain"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};
