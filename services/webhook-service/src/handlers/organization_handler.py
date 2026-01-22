import logging
from typing import Dict
from src.utils.notification_client import send_notification

logger = logging.getLogger(__name__)


async def handle_server_member_added(data: Dict):
    """Handle server member added event"""
    try:
        user_id = data.get("userId")
        server_id = data.get("serverId")
        server_name = data.get("serverName", "Server")
        added_by = data.get("addedBy")
        organization_id = data.get("organizationId")
        
        # Notify the user who was added
        await send_notification(
            user_id=user_id,
            notification_type="system",
            title="Added to Server",
            content=f"You have been added to {server_name}",
            data={
                "serverId": server_id,
                "serverName": server_name,
                "addedBy": added_by,
                "organizationId": organization_id
            },
            action_url=f"/servers/{server_id}"
        )
        
        logger.info(f"Server member added notification sent: {user_id} to {server_id}")
    except Exception as e:
        logger.error(f"Error handling server member added: {str(e)}")
        raise


async def handle_server_member_removed(data: Dict):
    """Handle server member removed event"""
    try:
        user_id = data.get("userId")
        server_id = data.get("serverId")
        server_name = data.get("serverName", "Server")
        removed_by = data.get("removedBy")
        organization_id = data.get("organizationId")
        
        # Notify the user who was removed
        await send_notification(
            user_id=user_id,
            notification_type="system",
            title="Removed from Server",
            content=f"You have been removed from {server_name}",
            data={
                "serverId": server_id,
                "serverName": server_name,
                "removedBy": removed_by,
                "organizationId": organization_id
            }
        )
        
        logger.info(f"Server member removed notification sent: {user_id} from {server_id}")
    except Exception as e:
        logger.error(f"Error handling server member removed: {str(e)}")
        raise


async def handle_organization_created(data: Dict):
    """Handle organization created event"""
    try:
        organization_id = data.get("organizationId")
        organization_name = data.get("organizationName", "Organization")
        owner_id = data.get("ownerId")
        
        # Notify the owner
        await send_notification(
            user_id=owner_id,
            notification_type="system",
            title="Organization Created",
            content=f"Your organization '{organization_name}' has been created successfully",
            data={
                "organizationId": organization_id,
                "organizationName": organization_name
            },
            action_url=f"/organizations/{organization_id}"
        )
        
        logger.info(f"Organization created notification sent: {organization_id}")
    except Exception as e:
        logger.error(f"Error handling organization created: {str(e)}")
        raise



