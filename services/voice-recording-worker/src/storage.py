import os
import tempfile
from datetime import datetime

import boto3
from botocore.client import Config


def _client():
    endpoint = os.environ.get("MINIO_ENDPOINT", "http://minio:9000").rstrip("/")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ.get("MINIO_ACCESS_KEY", ""),
        aws_secret_access_key=os.environ.get("MINIO_SECRET_KEY", ""),
        region_name=os.environ.get("MINIO_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def bucket():
    return os.environ.get("MINIO_BUCKET", "meeting-recordings")


def download_to_temp(storage_path: str) -> str:
    suffix = ".webm" if storage_path.endswith(".webm") else ".opus"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    _client().download_file(bucket(), storage_path, path)
    return path


def upload_file(local_path: str, storage_path: str, content_type: str) -> str:
    _client().upload_file(
        local_path,
        bucket(),
        storage_path,
        ExtraArgs={"ContentType": content_type},
    )
    return storage_path


def delete_object(storage_path: str) -> None:
    if not storage_path:
        return
    try:
        _client().delete_object(Bucket=bucket(), Key=storage_path)
    except Exception:
        pass


def build_opus_path(room_key: str, meeting_id: str) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_room = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(room_key))[:80]
    return f"meeting-recordings/{safe_room}/{meeting_id}_{ts}.opus"
