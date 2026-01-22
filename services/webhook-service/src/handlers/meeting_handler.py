import logging
from typing import Dict, List
from src.utils.notification_client import send_notification, send_bulk_notifications

logger = logging.getLogger(__name__)


async def handle_meeting_created(data: Dict):
    """Handle meeting created event"""
    try:
        meeting_id = data.get("meetingId")
        meeting_title = data.get("meetingTitle", "New Meeting")
        host_id = data.get("hostId")
        participant_ids = data.get("participantIds", [])
        server_id = data.get("serverId")
        organization_id = data.get("organizationId")
        start_time = data.get("startTime")
        
        # Notify all participants except host
        notify_user_ids = [pid for pid in participant_ids if pid != host_id]
        
        if notify_user_ids:
            await send_bulk_notifications(
                user_ids=notify_user_ids,
                notification_type="meeting",
                title="Meeting Invitation",
                content=f"You have been invited to: {meeting_title}",
                data={
                    "meetingId": meeting_id,
                    "meetingTitle": meeting_title,
                    "hostId": host_id,
                    "serverId": server_id,
                    "organizationId": organization_id,
                    "startTime": start_time
                },
                action_url=f"/meetings/{meeting_id}"
            )
        
        logger.info(f"Meeting created notification sent: {meeting_id}")
    except Exception as e:
        logger.error(f"Error handling meeting created: {str(e)}")
        raise


async def handle_meeting_started(data: Dict):
    """Handle meeting started event"""
    try:
        meeting_id = data.get("meetingId")
        meeting_title = data.get("meetingTitle", "Meeting")
        participant_ids = data.get("participantIds", [])
        server_id = data.get("serverId")
        
        # Notify all participants
        if participant_ids:
            await send_bulk_notifications(
                user_ids=participant_ids,
                notification_type="meeting",
                title="Meeting Started",
                content=f"{meeting_title} has started",
                data={
                    "meetingId": meeting_id,
                    "meetingTitle": meeting_title,
                    "serverId": server_id
                },
                action_url=f"/meetings/{meeting_id}"
            )
        
        logger.info(f"Meeting started notification sent: {meeting_id}")
    except Exception as e:
        logger.error(f"Error handling meeting started: {str(e)}")
        raise


async def handle_meeting_ended(data: Dict):
    """Handle meeting ended event"""
    try:
        meeting_id = data.get("meetingId")
        meeting_title = data.get("meetingTitle", "Meeting")
        participant_ids = data.get("participantIds", [])
        
        # Notify all participants
        if participant_ids:
            await send_bulk_notifications(
                user_ids=participant_ids,
                notification_type="meeting",
                title="Meeting Ended",
                content=f"{meeting_title} has ended",
                data={
                    "meetingId": meeting_id,
                    "meetingTitle": meeting_title
                }
            )
        
        logger.info(f"Meeting ended notification sent: {meeting_id}")
    except Exception as e:
        logger.error(f"Error handling meeting ended: {str(e)}")
        raise


async def handle_participant_joined(data: Dict):
    """Handle participant joined event"""
    try:
        meeting_id = data.get("meetingId")
        meeting_title = data.get("meetingTitle", "Meeting")
        participant_id = data.get("participantId")
        participant_name = data.get("participantName", "Someone")
        other_participant_ids = data.get("otherParticipantIds", [])
        
        # Notify other participants
        if other_participant_ids:
            await send_bulk_notifications(
                user_ids=other_participant_ids,
                notification_type="meeting",
                title="Participant Joined",
                content=f"{participant_name} joined {meeting_title}",
                data={
                    "meetingId": meeting_id,
                    "meetingTitle": meeting_title,
                    "participantId": participant_id,
                    "participantName": participant_name
                },
                action_url=f"/meetings/{meeting_id}"
            )
        
        logger.info(f"Participant joined notification sent: {meeting_id}")
    except Exception as e:
        logger.error(f"Error handling participant joined: {str(e)}")
        raise



