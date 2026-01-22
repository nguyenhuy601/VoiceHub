import logging
from typing import Dict
from src.utils.notification_client import send_notification

logger = logging.getLogger(__name__)


async def handle_friend_request_accepted(data: Dict):
    """Handle friend request accepted event"""
    try:
        user_id = data.get("userId")
        friend_id = data.get("friendId")
        friend_name = data.get("friendName", "Someone")
        
        # Notify the user who sent the request
        await send_notification(
            user_id=user_id,
            notification_type="friend_accepted",
            title="Friend Request Accepted",
            content=f"{friend_name} has accepted your friend request",
            data={
                "friendId": friend_id,
                "friendName": friend_name
            },
            action_url=f"/friends/{friend_id}"
        )
        
        logger.info(f"Friend request accepted notification sent: {user_id} <-> {friend_id}")
    except Exception as e:
        logger.error(f"Error handling friend request accepted: {str(e)}")
        raise


async def handle_friend_request_sent(data: Dict):
    """Handle friend request sent event"""
    try:
        user_id = data.get("userId")
        friend_id = data.get("friendId")
        user_name = data.get("userName", "Someone")
        
        # Notify the user who received the request
        await send_notification(
            user_id=friend_id,
            notification_type="friend_request",
            title="New Friend Request",
            content=f"{user_name} sent you a friend request",
            data={
                "userId": user_id,
                "userName": user_name
            },
            action_url=f"/friends/requests"
        )
        
        logger.info(f"Friend request sent notification: {user_id} -> {friend_id}")
    except Exception as e:
        logger.error(f"Error handling friend request sent: {str(e)}")
        raise


async def handle_friend_removed(data: Dict):
    """Handle friend removed event"""
    try:
        user_id = data.get("userId")
        friend_id = data.get("friendId")
        friend_name = data.get("friendName", "Someone")
        
        # Notify the friend who was removed
        await send_notification(
            user_id=friend_id,
            notification_type="system",
            title="Friend Removed",
            content=f"{friend_name} removed you from their friends list",
            data={
                "userId": user_id,
                "friendName": friend_name
            }
        )
        
        logger.info(f"Friend removed notification sent: {user_id} removed {friend_id}")
    except Exception as e:
        logger.error(f"Error handling friend removed: {str(e)}")
        raise



