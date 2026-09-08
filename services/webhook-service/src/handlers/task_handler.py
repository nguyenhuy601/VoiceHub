import logging
from typing import Dict
from src.utils.notification_client import send_notification

logger = logging.getLogger(__name__)


async def handle_task_created(data: Dict):
    """Handle task created event"""
    try:
        task_id = data.get("taskId")
        task_title = data.get("taskTitle", "New Task")
        created_by = data.get("createdBy")
        assignee_id = data.get("assigneeId")
        organization_id = data.get("organizationId")
        
        # Notify assignee if task is assigned
        if assignee_id and str(assignee_id) != str(created_by or ""):
            project_id = data.get("projectId") or ""
            action = (
                f"/app/collaborate/projects/{project_id}"
                if project_id
                else "/app/collaborate/projects"
            )
            await send_notification(
                user_id=assignee_id,
                notification_type="task_assigned",
                title="New Task Assigned",
                content=f"You have been assigned to: {task_title}",
                data={
                    "taskId": task_id,
                    "taskTitle": task_title,
                    "createdBy": created_by,
                    "organizationId": organization_id,
                    "projectId": project_id,
                },
                action_url=action
            )
        
        logger.info(f"Task created notification sent: {task_id}")
    except Exception as e:
        logger.error(f"Error handling task created: {str(e)}")
        raise


async def handle_task_assigned(data: Dict):
    """Handle task assigned event"""
    try:
        task_id = data.get("taskId")
        task_title = data.get("taskTitle", "Task")
        assignee_id = data.get("assigneeId")
        assigned_by = data.get("assignedBy")
        organization_id = data.get("organizationId")
        project_id = data.get("projectId") or ""

        if assignee_id and str(assignee_id) != str(assigned_by or ""):
            action = (
                f"/app/collaborate/projects/{project_id}"
                if project_id
                else "/app/collaborate/projects"
            )
            await send_notification(
                user_id=assignee_id,
                notification_type="task_assigned",
                title="Task Assigned",
                content=f"You have been assigned to: {task_title}",
                data={
                    "taskId": task_id,
                    "taskTitle": task_title,
                    "assignedBy": assigned_by,
                    "organizationId": organization_id,
                    "projectId": project_id,
                },
                action_url=action
            )
        
        logger.info(f"Task assigned notification sent: {task_id} to {assignee_id}")
    except Exception as e:
        logger.error(f"Error handling task assigned: {str(e)}")
        raise


async def handle_task_completed(data: Dict):
    """Handle task completed event"""
    try:
        task_id = data.get("taskId")
        task_title = data.get("taskTitle", "Task")
        completed_by = data.get("completedBy")
        created_by = data.get("createdBy")
        organization_id = data.get("organizationId")
        project_id = data.get("projectId") or ""
        
        # Notify the creator if different from completer
        if created_by and created_by != completed_by:
            action = (
                f"/app/collaborate/projects/{project_id}"
                if project_id
                else "/app/collaborate/projects"
            )
            await send_notification(
                user_id=created_by,
                notification_type="task_completed",
                title="Task Completed",
                content=f"{task_title} has been completed",
                data={
                    "taskId": task_id,
                    "taskTitle": task_title,
                    "completedBy": completed_by,
                    "organizationId": organization_id,
                    "projectId": project_id,
                },
                action_url=action
            )
        
        logger.info(f"Task completed notification sent: {task_id}")
    except Exception as e:
        logger.error(f"Error handling task completed: {str(e)}")
        raise


async def handle_task_updated(data: Dict):
    """Handle task updated event"""
    try:
        task_id = data.get("taskId")
        task_title = data.get("taskTitle", "Task")
        assignee_id = data.get("assigneeId")
        updated_by = data.get("updatedBy")
        changes = data.get("changes", {})
        organization_id = data.get("organizationId")
        project_id = data.get("projectId") or ""
        
        # Notify assignee if task was updated
        if assignee_id and assignee_id != updated_by:
            change_summary = ", ".join(changes.keys()) if changes else "updated"
            action = (
                f"/app/collaborate/projects/{project_id}"
                if project_id
                else "/app/collaborate/projects"
            )
            await send_notification(
                user_id=assignee_id,
                notification_type="task_assigned",
                title="Task Updated",
                content=f"{task_title} has been {change_summary}",
                data={
                    "taskId": task_id,
                    "taskTitle": task_title,
                    "changes": changes,
                    "updatedBy": updated_by,
                    "organizationId": organization_id,
                    "projectId": project_id,
                },
                action_url=action
            )
        
        logger.info(f"Task updated notification sent: {task_id}")
    except Exception as e:
        logger.error(f"Error handling task updated: {str(e)}")
        raise



