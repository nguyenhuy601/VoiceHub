FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

COPY services/voice-stt-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/messaging/rabbit_quorum.py ./rabbit_quorum.py
COPY services/voice-stt-worker/ .

CMD ["python", "worker.py"]
