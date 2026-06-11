FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY templates ./templates
COPY static ./static

EXPOSE 5000

ENTRYPOINT ["python", "app.py"]
CMD ["tcp", "192.168.1.3", "8899"]