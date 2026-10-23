FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
WORKDIR /srv
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN useradd -m -u 10002 citem
USER citem
EXPOSE 8765
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8765","--no-access-log"]
