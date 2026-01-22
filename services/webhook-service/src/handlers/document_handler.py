import logging
from typing import Dict, List
from src.utils.notification_client import send_notification, send_bulk_notifications

logger = logging.getLogger(__name__)


async def handle_document_uploaded(data: Dict):
    """Handle document uploaded event"""
    try:
        document_id = data.get("documentId")
        document_name = data.get("documentName", "Document")
        uploaded_by = data.get("uploadedBy")
        organization_id = data.get("organizationId")
        server_id = data.get("serverId")
        shared_with = data.get("sharedWith", [])
        
        # Notify users who have access to the document
        if shared_with:
            await send_bulk_notifications(
                user_ids=shared_with,
                notification_type="document",
                title="New Document",
                content=f"{document_name} has been uploaded",
                data={
                    "documentId": document_id,
                    "documentName": document_name,
                    "uploadedBy": uploaded_by,
                    "organizationId": organization_id,
                    "serverId": server_id
                },
                action_url=f"/documents/{document_id}"
            )
        
        logger.info(f"Document uploaded notification sent: {document_id}")
    except Exception as e:
        logger.error(f"Error handling document uploaded: {str(e)}")
        raise


async def handle_document_updated(data: Dict):
    """Handle document updated event"""
    try:
        document_id = data.get("documentId")
        document_name = data.get("documentName", "Document")
        updated_by = data.get("updatedBy")
        organization_id = data.get("organizationId")
        server_id = data.get("serverId")
        shared_with = data.get("sharedWith", [])
        
        # Notify users who have access to the document
        if shared_with:
            await send_bulk_notifications(
                user_ids=shared_with,
                notification_type="document",
                title="Document Updated",
                content=f"{document_name} has been updated",
                data={
                    "documentId": document_id,
                    "documentName": document_name,
                    "updatedBy": updated_by,
                    "organizationId": organization_id,
                    "serverId": server_id
                },
                action_url=f"/documents/{document_id}"
            )
        
        logger.info(f"Document updated notification sent: {document_id}")
    except Exception as e:
        logger.error(f"Error handling document updated: {str(e)}")
        raise


async def handle_document_shared(data: Dict):
    """Handle document shared event"""
    try:
        document_id = data.get("documentId")
        document_name = data.get("documentName", "Document")
        shared_by = data.get("sharedBy")
        shared_with = data.get("sharedWith", [])
        organization_id = data.get("organizationId")
        server_id = data.get("serverId")
        
        # Notify users who the document was shared with
        if shared_with:
            await send_bulk_notifications(
                user_ids=shared_with,
                notification_type="document",
                title="Document Shared",
                content=f"{document_name} has been shared with you",
                data={
                    "documentId": document_id,
                    "documentName": document_name,
                    "sharedBy": shared_by,
                    "organizationId": organization_id,
                    "serverId": server_id
                },
                action_url=f"/documents/{document_id}"
            )
        
        logger.info(f"Document shared notification sent: {document_id}")
    except Exception as e:
        logger.error(f"Error handling document shared: {str(e)}")
        raise



