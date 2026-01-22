import logging
from typing import Dict
from src.utils.notification_client import send_notification

logger = logging.getLogger(__name__)


async def handle_role_assigned(data: Dict):
    """Handle role assigned event"""
    try:
        user_id = data.get("userId")
        role_name = data.get("roleName", "Role")
        server_id = data.get("serverId")
        server_name = data.get("serverName", "Server")
        assigned_by = data.get("assignedBy")
        organization_id = data.get("organizationId")
        
        # Notify the user who was assigned the role
        await send_notification(
            user_id=user_id,
            notification_type="system",
            title="Role Assigned",
            content=f"You have been assigned the role '{role_name}' in {server_name}",
            data={
                "roleName": role_name,
                "serverId": server_id,
                "serverName": server_name,
                "assignedBy": assigned_by,
                "organizationId": organization_id
            },
            action_url=f"/servers/{server_id}/roles"
        )
        
        logger.info(f"Role assigned notification sent: {user_id} - {role_name}")
    except Exception as e:
        logger.error(f"Error handling role assigned: {str(e)}")
        raise


async def handle_role_removed(data: Dict):
    """Handle role removed event"""
    try:
        user_id = data.get("userId")
        role_name = data.get("roleName", "Role")
        server_id = data.get("serverId")
        server_name = data.get("serverName", "Server")
        removed_by = data.get("removedBy")
        organization_id = data.get("organizationId")
        
        # Notify the user who had the role removed
        await send_notification(
            user_id=user_id,
            notification_type="system",
            title="Role Removed",
            content=f"The role '{role_name}' has been removed from you in {server_name}",
            data={
                "roleName": role_name,
                "serverId": server_id,
                "serverName": server_name,
                "removedBy": removed_by,
                "organizationId": organization_id
            },
            action_url=f"/servers/{server_id}/roles"
        )
        
        logger.info(f"Role removed notification sent: {user_id} - {role_name}")
    except Exception as e:
        logger.error(f"Error handling role removed: {str(e)}")
        raise



