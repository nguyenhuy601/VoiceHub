from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os
from dotenv import load_dotenv
import logging
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

from src.handlers import (
    friend_handler,
    task_handler,
    meeting_handler,
    document_handler,
    chat_handler,
    role_handler,
    organization_handler,
)

load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Webhook Service",
    description="Webhook service for handling events from microservices",
    version="1.0.0"
)

# Webhook server-to-server — không cần CORS trình duyệt; tránh wildcard + credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class WebhookPayload(BaseModel):
    """Payload tối thiểu; cho phép field thêm theo từng event."""

    event_type: Optional[str] = None
    model_config = ConfigDict(extra="allow")

    def as_dict(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=False)

# Webhook secret for authentication — phải trùng WEBHOOK_SECRET trên friend-service / các service gọi webhook
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "your-webhook-secret-key-change-this-in-production")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:3003")


async def verify_webhook_secret(x_webhook_secret: Optional[str] = Header(None)):
    """Verify webhook secret"""
    if not x_webhook_secret or x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    return True


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "webhook-service"}


@app.post("/webhook/friend")
async def handle_friend_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle friend-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "friend_request_accepted":
            await friend_handler.handle_friend_request_accepted(data)
        elif event_type == "friend_request_sent":
            await friend_handler.handle_friend_request_sent(data)
        elif event_type == "friend_removed":
            await friend_handler.handle_friend_removed(data)
        else:
            logger.warning(f"Unknown friend event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing friend webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/task")
async def handle_task_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle task-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "task_created":
            await task_handler.handle_task_created(data)
        elif event_type == "task_assigned":
            await task_handler.handle_task_assigned(data)
        elif event_type == "task_completed":
            await task_handler.handle_task_completed(data)
        elif event_type == "task_updated":
            await task_handler.handle_task_updated(data)
        else:
            logger.warning(f"Unknown task event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing task webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/meeting")
async def handle_meeting_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle meeting-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "meeting_created":
            await meeting_handler.handle_meeting_created(data)
        elif event_type == "meeting_started":
            await meeting_handler.handle_meeting_started(data)
        elif event_type == "meeting_ended":
            await meeting_handler.handle_meeting_ended(data)
        elif event_type == "participant_joined":
            await meeting_handler.handle_participant_joined(data)
        else:
            logger.warning(f"Unknown meeting event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing meeting webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/document")
async def handle_document_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle document-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "document_uploaded":
            await document_handler.handle_document_uploaded(data)
        elif event_type == "document_updated":
            await document_handler.handle_document_updated(data)
        elif event_type == "document_shared":
            await document_handler.handle_document_shared(data)
        else:
            logger.warning(f"Unknown document event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing document webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/chat")
async def handle_chat_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle chat-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "message_created":
            await chat_handler.handle_message_created(data)
        elif event_type == "message_mentioned":
            await chat_handler.handle_message_mentioned(data)
        else:
            logger.warning(f"Unknown chat event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing chat webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/role")
async def handle_role_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle role-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "role_assigned":
            await role_handler.handle_role_assigned(data)
        elif event_type == "role_removed":
            await role_handler.handle_role_removed(data)
        else:
            logger.warning(f"Unknown role event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing role webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/organization")
async def handle_organization_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle organization-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        data = body.as_dict()
        event_type = data.get("event_type")
        
        if event_type == "server_member_added":
            await organization_handler.handle_server_member_added(data)
        elif event_type == "server_member_removed":
            await organization_handler.handle_server_member_removed(data)
        elif event_type == "organization_created":
            await organization_handler.handle_organization_created(data)
        else:
            logger.warning(f"Unknown organization event type: {event_type}")
        
        return JSONResponse({"success": True, "message": "Webhook processed"})
    except Exception as e:
        logger.error(f"Error processing organization webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3016))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True if os.getenv("NODE_ENV") == "development" else False
    )



